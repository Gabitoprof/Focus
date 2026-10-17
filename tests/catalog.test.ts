import { randomUUID } from "node:crypto";
import { beforeEach, describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import { normalizeTerm } from "@/domain/catalog";
import { catalogTopics, studySessions, topics, user, xpTransactions } from "@/server/db/schema";
import {
  addCatalogAlias,
  getProfileTags,
  linkTopicToCatalog,
  listPendingSuggestions,
  searchCatalogTopics,
  setCategoryArea,
  setProfileTags,
} from "@/server/services/catalog";
import { createCategory, createTopic, listCategories } from "@/server/services/categories";
import { ensureProfile } from "@/server/services/profile";
import { finishBreak, finishSession, heartbeat, startSession } from "@/server/services/timer";
import { setup } from "./helpers";

type Env = Awaited<ReturnType<typeof setup>>;
let env: Env;

beforeEach(async () => {
  env = await setup();
});

async function newUser(name = "Estudante") {
  const id = randomUUID();
  await env.db.insert(user).values({ id, name, email: `${id}@teste.local` });
  await ensureProfile(env.db, id, name);
  return id;
}

async function catalogId(name: string) {
  const [t] = await env.db.select().from(catalogTopics).where(eq(catalogTopics.normalizedName, normalizeTerm(name)));
  return t;
}

async function studyCycle(userId: string, topicId: string, opts: { breakOverrunSeconds?: number } = {}) {
  const s = await startSession(env.ctx, userId, { topicId, methodId: "custom", plannedMinutes: 30 });
  for (let i = 0; i < 30; i++) {
    env.clock.advance(60);
    await heartbeat(env.ctx, userId, s.session!.id);
  }
  const st = await finishSession(env.ctx, userId, s.session!.id, {
    startBreak: opts.breakOverrunSeconds != null,
    breakMinutes: 5,
  });
  if (opts.breakOverrunSeconds != null) {
    env.clock.advance(5 * 60 + opts.breakOverrunSeconds);
    await finishBreak(env.ctx, userId, st.break!.id);
  }
  return s.session!.id;
}

describe("Padronização de nomes", () => {
  it("ignora acentos, maiúsculas, pontuação e espaços", () => {
    expect(normalizeTerm("Sub-Redes")).toBe("sub redes");
    expect(normalizeTerm("  sub   redes ")).toBe("sub redes");
    expect(normalizeTerm("Matemática")).toBe(normalizeTerm("MATEMATICA"));
  });
});

describe("Catálogo", () => {
  it("vem com as áreas CAPES + Preparatórios e temas iniciais", async () => {
    const all = await searchCatalogTopics(env.ctx, { areaId: "preparatorios" });
    expect(all.map((t) => t.name)).toContain("Cisco CCNA");
    const redes = await searchCatalogTopics(env.ctx, { query: "redes" });
    expect(redes.map((t) => t.name)).toContain("Redes de Computadores");
  });

  it("tema com nome do catálogo já nasce vinculado (sem diferenciar acento/maiúscula)", async () => {
    const u = await newUser();
    const c = await createCategory(env.ctx, u, { name: "Faculdade", areaId: "exatas" });
    const t = await createTopic(env.ctx, u, { categoryId: c.id, name: "redes de computadores" });
    expect(t.catalogTopicId).toBe((await catalogId("Redes de Computadores")).id);
  });

  it("sinônimo cadastrado pelo admin vincula temas existentes e futuros", async () => {
    const u = await newUser();
    const c = await createCategory(env.ctx, u, { name: "Cisco" });
    const before = await createTopic(env.ctx, u, { categoryId: c.id, name: "CCNA 1" });
    expect(before.catalogTopicId).toBeNull();
    const ccna = await catalogId("Cisco CCNA");
    await addCatalogAlias(env.db, ccna.id, "ccna 1");
    const [row] = await env.db.select().from(topics).where(eq(topics.id, before.id));
    expect(row.catalogTopicId).toBe(ccna.id);
  });

  it("termo novo vira sugestão com 5 usuários e entra sozinho com 20, na área mais usada", async () => {
    const users: string[] = [];
    for (let i = 0; i < 20; i++) users.push(await newUser(`U${i}`));
    const topicIds: string[] = [];
    for (let i = 0; i < 20; i++) {
      // 15 colocam em Exatas, 5 em Engenharias: a área escolhida deve ser Exatas.
      const c = await createCategory(env.ctx, users[i], { name: "Estudos", areaId: i < 15 ? "exatas" : "engenharias" });
      const t = await createTopic(env.ctx, users[i], { categoryId: c.id, name: i % 2 ? "Kubernetes" : "kubernetes " });
      topicIds.push(t.id);
      if (i === 3) expect(await listPendingSuggestions(env.ctx)).toHaveLength(0);
      if (i === 4) expect((await listPendingSuggestions(env.ctx)).map((s) => s.normalizedName)).toEqual(["kubernetes"]);
      if (i === 18) expect((await catalogId("kubernetes")).status).toBe("pending");
    }
    const k = await catalogId("kubernetes");
    expect(k.status).toBe("approved");
    expect(k.areaId).toBe("exatas");
    const linked = await env.db.select().from(topics).where(eq(topics.catalogTopicId, k.id));
    expect(linked).toHaveLength(20);
    expect(await listPendingSuggestions(env.ctx)).toHaveLength(0);
  });

  it("a área do tema novo vem do próprio tema (a categoria não tem área escolhida)", async () => {
    const users: string[] = [];
    for (let i = 0; i < 20; i++) users.push(await newUser(`V${i}`));
    for (let i = 0; i < 20; i++) {
      const c = await createCategory(env.ctx, users[i], { name: "Faculdade" });
      expect(c.areaId).toBeNull();
      await createTopic(env.ctx, users[i], { categoryId: c.id, name: "Bioinformática aplicada", areaId: i < 12 ? "biologicas" : "exatas" });
    }
    const t = await catalogId("Bioinformática aplicada");
    expect(t).toMatchObject({ status: "approved", areaId: "biologicas" });
  });
});

describe("Vínculos e justiça do ranking", () => {
  it("vincular depois não altera sessões passadas; só as novas contam para a área/tema", async () => {
    const u = await newUser();
    const c = await createCategory(env.ctx, u, { name: "Cisco Networking Academy" });
    const t = await createTopic(env.ctx, u, { categoryId: c.id, name: "Sub-redes Cisco" });
    const first = await studyCycle(u, t.id);

    env.clock.advance(3600);
    await setCategoryArea(env.ctx, u, c.id, "exatas");
    const redes = await catalogId("Redes de Computadores");
    await linkTopicToCatalog(env.ctx, u, t.id, redes.id);
    env.clock.advance(3600);
    const second = await studyCycle(u, t.id);

    const [s1] = await env.db.select().from(studySessions).where(eq(studySessions.id, first));
    const [s2] = await env.db.select().from(studySessions).where(eq(studySessions.id, second));
    expect(s1.areaId).toBeNull();
    expect(s1.catalogTopicId).toBeNull();
    expect(s2.areaId).toBe("exatas");
    expect(s2.catalogTopicId).toBe(redes.id);

    const xp = await env.db
      .select()
      .from(xpTransactions)
      .where(and(eq(xpTransactions.userId, u), eq(xpTransactions.reason, "cycle_completed")));
    expect(xp.find((x) => x.sourceId === first)?.areaId).toBeNull();
    expect(xp.find((x) => x.sourceId === second)?.areaId).toBe("exatas");
    expect(xp.find((x) => x.sourceId === second)?.catalogTopicId).toBe(redes.id);
  });

  it("a área vem do tema do catálogo, não da categoria (sem rankings incoerentes)", async () => {
    const u = await newUser();
    // Categoria marcada como Humanas, mas o tema é Bioquímica (Ciências Biológicas).
    const c = await createCategory(env.ctx, u, { name: "feijão", areaId: "humanas" });
    const bio = await createTopic(env.ctx, u, { categoryId: c.id, name: "Bioquímica" });
    const proprio = await createTopic(env.ctx, u, { categoryId: c.id, name: "Anotações soltas" });
    const s1 = await studyCycle(u, bio.id);
    const s2 = await studyCycle(u, proprio.id);

    const [a] = await env.db.select().from(studySessions).where(eq(studySessions.id, s1));
    const [b] = await env.db.select().from(studySessions).where(eq(studySessions.id, s2));
    expect(a.areaId).toBe("biologicas");
    expect(a.catalogTopicId).toBe((await catalogId("Bioquímica")).id);
    // Tema personalizado: não entra em ranking de área nem de tema (só geral e método).
    expect(b.areaId).toBeNull();
    expect(b.catalogTopicId).toBeNull();
    const xp = await env.db.select().from(xpTransactions).where(eq(xpTransactions.userId, u));
    expect(xp.find((x) => x.sourceId === s1)?.areaId).toBe("biologicas");
    expect(xp.find((x) => x.sourceId === s2)?.areaId).toBeNull();
  });

  it("penalidade de intervalo vai para a área/tema da sessão anterior", async () => {
    const u = await newUser();
    const c = await createCategory(env.ctx, u, { name: "Faculdade", areaId: "exatas" });
    const t = await createTopic(env.ctx, u, { categoryId: c.id, name: "Banco de Dados" });
    await studyCycle(u, t.id, { breakOverrunSeconds: 60 });
    const [penalty] = await env.db
      .select()
      .from(xpTransactions)
      .where(and(eq(xpTransactions.userId, u), eq(xpTransactions.reason, "break_overrun_penalty")));
    expect(penalty.amount).toBe(-5);
    expect(penalty.areaId).toBe("exatas");
    expect(penalty.catalogTopicId).toBe((await catalogId("Banco de Dados")).id);
  });

  it("usuário não vincula tema de outro usuário nem a tema pendente", async () => {
    const a = await newUser("A");
    const b = await newUser("B");
    const c = await createCategory(env.ctx, a, { name: "X" });
    const t = await createTopic(env.ctx, a, { categoryId: c.id, name: "Algo novo" });
    const redes = await catalogId("Redes de Computadores");
    await expect(linkTopicToCatalog(env.ctx, b, t.id, redes.id)).rejects.toThrow(/não encontrado/);
    const pending = await catalogId("Algo novo");
    expect(pending.status).toBe("pending");
    await expect(linkTopicToCatalog(env.ctx, a, t.id, pending.id)).rejects.toThrow(/não encontrado/);
    const cats = await listCategories(env.ctx, a);
    expect(cats[0].topics[0].catalogTopic).toBeNull();
  });
});

describe("Tags do perfil", () => {
  it("salva áreas, temas e objetivos, respeitando os limites", async () => {
    const u = await newUser();
    const redes = await catalogId("Redes de Computadores");
    await setProfileTags(env.ctx, u, { areaIds: ["exatas", "preparatorios"], catalogTopicIds: [redes.id], goalIds: ["certificacao"] });
    const tags = await getProfileTags(env.ctx, u);
    expect(tags.areas.map((a) => a.id)).toEqual(["exatas", "preparatorios"]);
    expect(tags.topics.map((t) => t.name)).toEqual(["Redes de Computadores"]);
    expect(tags.goals.map((g) => g.id)).toEqual(["certificacao"]);

    const many = (await searchCatalogTopics(env.ctx, { areaId: "exatas" })).slice(0, 11).map((t) => t.id);
    await expect(setProfileTags(env.ctx, u, { areaIds: [], catalogTopicIds: many, goalIds: [] })).rejects.toThrow(/no máximo 10/);
    await expect(setProfileTags(env.ctx, u, { areaIds: ["inventada"], catalogTopicIds: [], goalIds: [] })).rejects.toThrow(/inválida/);
    await expect(setProfileTags(env.ctx, u, { areaIds: [], catalogTopicIds: [], goalIds: ["hack"] })).rejects.toThrow(/inválido/);
  });
});

describe("Base curada do catálogo", () => {
  it("cobre escola, vestibular e faculdade, une os níveis e encontra pelo curso", async () => {
    const [gen] = await env.db.select().from(catalogTopics).where(eq(catalogTopics.normalizedName, normalizeTerm("Genética")));
    expect(gen.status).toBe("approved");
    expect([...gen.levels].sort()).toEqual(["escola", "faculdade", "vestibular"]);
    const esteq = await catalogId("Estequiometria");
    expect(esteq).toMatchObject({ areaId: "exatas", status: "approved" });
    expect(esteq.levels).toContain("vestibular");
    const medicina = (await searchCatalogTopics(env.ctx, { query: "Medicina" })).map((t) => t.name);
    expect(medicina).toEqual(expect.arrayContaining(["Semiologia", "Clínica Médica", "Anatomia Humana", "Imunologia"]));
    const direito = await catalogId("Direito Processual Civil");
    expect(direito.courses).toEqual(["Direito"]);
  });
});
