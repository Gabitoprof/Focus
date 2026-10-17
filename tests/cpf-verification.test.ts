import { randomUUID } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { eq, sql } from "drizzle-orm";
import { cpfhubVerifier, type CpfCheck, type CpfVerifier } from "@/server/cpf-verification";
import { user, userIdentity } from "@/server/db/schema";
import { MAX_CPF_ATTEMPTS_PER_DAY, getIdentity, parseBirthDate, registerCpf } from "@/server/services/identity";
import { ensureProfile } from "@/server/services/profile";
import { setup } from "./helpers";

type Env = Awaited<ReturnType<typeof setup>>;
let env: Env;

const CPF = "529.982.247-25";

beforeEach(async () => {
  env = await setup();
  env.clock.set("2026-03-10T12:00:00.000Z");
});

async function newUser() {
  const id = randomUUID();
  await env.db.insert(user).values({ id, name: "Ana", email: `${id}@teste.local` });
  await ensureProfile(env.db, id, "Ana");
  return id;
}

/** Verificador falso que responde sempre o mesmo e conta as chamadas. */
function fake(result: CpfCheck) {
  const calls: unknown[] = [];
  const v: CpfVerifier = {
    name: "cpfhub",
    async verify(...args) {
      calls.push(args);
      return result;
    },
  };
  return { v, calls };
}

/** fetch simulado com a resposta do CPFHub. */
function mockFetch(status: number, body: unknown) {
  return vi.fn(async () => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } }));
}

describe("Data de nascimento", () => {
  it("aceita datas reais e recusa inválidas ou futuras", () => {
    const now = new Date("2026-03-10T12:00:00Z");
    expect(parseBirthDate("2005-02-28", now)).toEqual({ day: 28, month: 2, year: 2005 });
    expect(() => parseBirthDate("2005-02-30", now)).toThrow(/inválida/);
    expect(() => parseBirthDate("2027-01-01", now)).toThrow(/inválida/);
    expect(() => parseBirthDate("1899-12-31", now)).toThrow(/inválida/);
    expect(() => parseBirthDate("", now)).toThrow(/Informe/);
  });
});

describe("Adaptador CPFHub (Consulta em Tempo Real)", () => {
  const birth = { day: 5, month: 3, year: 2001 };

  it("envia CPF e nascimento no formato DD/MM/AAAA com a chave no cabeçalho", async () => {
    const f = mockFetch(200, { success: true, data: { situation: "REGULAR", deathYear: null } });
    await cpfhubVerifier("chave-teste", f as unknown as typeof fetch).verify("52998224725", birth);
    const [url, init] = f.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://api.cpfhub.io/cpf/realtime");
    expect(init.method).toBe("POST");
    expect((init.headers as Record<string, string>)["x-api-key"]).toBe("chave-teste");
    expect(JSON.parse(init.body as string)).toEqual({ cpf: "52998224725", birthDate: "05/03/2001" });
  });

  it.each([
    [200, { success: true, data: { situation: "REGULAR", deathYear: null, name: "FULANO" } }, { status: "verified" }],
    [200, { success: true, data: { situation: "SUSPENSA", deathYear: null } }, { status: "rejected", reason: "irregular" }],
    [200, { success: true, data: { situation: "PENDENTE DE REGULARIZAÇÃO" } }, { status: "rejected", reason: "irregular" }],
    [200, { success: true, data: { situation: "TITULAR FALECIDO", deathYear: 2020 } }, { status: "rejected", reason: "deceased" }],
    [422, { success: false, error: { message: "Data de nascimento divergente" } }, { status: "rejected", reason: "mismatch" }],
    [401, { success: false, error: "chave inválida" }, { status: "unavailable" }],
    [403, { success: false, error: "sem créditos" }, { status: "unavailable" }],
    [429, { success: false }, { status: "unavailable" }],
    [503, { success: false }, { status: "unavailable" }],
  ])("HTTP %i → %j", async (status, body, expected) => {
    const r = await cpfhubVerifier("k", mockFetch(status, body) as unknown as typeof fetch).verify("52998224725", birth);
    expect(r).toEqual(expected);
  });

  it("data devolvida pela Receita diferente da informada → recusado (mesmo com HTTP 200)", async () => {
    const differs = mockFetch(200, { success: true, data: { situation: "REGULAR", deathYear: null, birthDate: "06/03/2001" } });
    expect(await cpfhubVerifier("k", differs as unknown as typeof fetch).verify("52998224725", birth)).toEqual({
      status: "rejected",
      reason: "mismatch",
    });
    const same = mockFetch(200, { success: true, data: { situation: "REGULAR", deathYear: null, birthDate: "05/03/2001" } });
    expect(await cpfhubVerifier("k", same as unknown as typeof fetch).verify("52998224725", birth)).toEqual({ status: "verified" });
  });

  it("falha de rede vira 'indisponível', nunca 'verificado'", async () => {
    const f = vi.fn(async () => {
      throw new Error("timeout");
    });
    expect(await cpfhubVerifier("k", f as unknown as typeof fetch).verify("52998224725", birth)).toEqual({ status: "unavailable" });
  });
});

describe("Vínculo do CPF com verificação", () => {
  it("verificado: grava só HMAC, 2 últimos dígitos e o ano de nascimento", async () => {
    const u = await newUser();
    await registerCpf(env.ctx, u, CPF, "2001-03-05", fake({ status: "verified" }).v);
    const [row] = await env.db.select().from(userIdentity).where(eq(userIdentity.userId, u));
    expect(row).toMatchObject({ cpfLastDigits: "25", birthYear: 2001, verificationProvider: "cpfhub" });
    const dump = JSON.stringify(await env.db.execute(sql`select * from user_identity`));
    expect(dump).not.toContain("52998224725");
    expect(dump).not.toContain("05/03/2001");
    expect(dump).not.toContain("2001-03-05");
    expect(await getIdentity(env.ctx, u)).toMatchObject({ hasCpf: true, verifiedOfficially: true });
  });

  it.each([["mismatch"], ["irregular"], ["deceased"]] as const)("recusado (%s): mensagem única e nada é gravado", async (reason) => {
    const u = await newUser();
    await expect(registerCpf(env.ctx, u, CPF, "2001-03-05", fake({ status: "rejected", reason }).v)).rejects.toThrow(
      "CPF inválido ou dados não conferem.",
    );
    expect((await getIdentity(env.ctx, u)).hasCpf).toBe(false);
  });

  it("provedor fora do ar: não vincula e não conta como tentativa", async () => {
    const u = await newUser();
    const down = fake({ status: "unavailable" }).v;
    for (let i = 0; i < MAX_CPF_ATTEMPTS_PER_DAY + 2; i++) {
      await expect(registerCpf(env.ctx, u, CPF, "2001-03-05", down)).rejects.toThrow(/indisponível/);
    }
    await registerCpf(env.ctx, u, CPF, "2001-03-05", fake({ status: "verified" }).v);
    expect((await getIdentity(env.ctx, u)).hasCpf).toBe(true);
  });

  it(`limite de ${MAX_CPF_ATTEMPTS_PER_DAY} tentativas por 24 h`, async () => {
    const u = await newUser();
    const no = fake({ status: "rejected", reason: "mismatch" });
    for (let i = 0; i < MAX_CPF_ATTEMPTS_PER_DAY; i++) {
      await expect(registerCpf(env.ctx, u, CPF, "2001-03-05", no.v)).rejects.toThrow(/não conferem/);
    }
    await expect(registerCpf(env.ctx, u, CPF, "2001-03-05", no.v)).rejects.toThrow(/Muitas tentativas/);
    expect(no.calls).toHaveLength(MAX_CPF_ATTEMPTS_PER_DAY); // a 4ª nem chega ao provedor
    env.clock.advance(24 * 3600 + 1);
    await registerCpf(env.ctx, u, CPF, "2001-03-05", fake({ status: "verified" }).v);
  });

  it("CPF já usado em outra conta: recusa sem gastar consulta no provedor", async () => {
    const a = await newUser();
    const b = await newUser();
    await registerCpf(env.ctx, a, CPF, "2001-03-05", fake({ status: "verified" }).v);
    const spy = fake({ status: "verified" });
    await expect(registerCpf(env.ctx, b, "52998224725", "2001-03-05", spy.v)).rejects.toThrow(/outra conta/);
    expect(spy.calls).toHaveLength(0);
  });

  it("dígitos inválidos ou data inválida: recusa sem consultar o provedor", async () => {
    const u = await newUser();
    const spy = fake({ status: "verified" });
    await expect(registerCpf(env.ctx, u, "529.982.247-24", "2001-03-05", spy.v)).rejects.toThrow(/CPF inválido/);
    await expect(registerCpf(env.ctx, u, CPF, "2001-02-30", spy.v)).rejects.toThrow(/inválida/);
    expect(spy.calls).toHaveLength(0);
  });
});
