/**
 * Verificação de CPF + data de nascimento junto a um provedor. Plugável: o provedor é escolhido
 * por configuração. Nunca devolve dados pessoais do provedor (nome, comprovante etc.) — só a
 * conclusão. Em caso de falha do provedor, a resposta é "indisponível" (nunca "verificado").
 */

export type BirthDate = { day: number; month: number; year: number };

export type CpfCheck =
  | { status: "verified" }
  | { status: "rejected"; reason: "mismatch" | "irregular" | "deceased" }
  | { status: "unavailable" };

export interface CpfVerifier {
  readonly name: string;
  verify(cpfDigits: string, birth: BirthDate): Promise<CpfCheck>;
}

const pad = (n: number) => String(n).padStart(2, "0");

/**
 * CPFHub.io — Consulta em Tempo Real (POST /cpf/realtime), que confere CPF + nascimento na
 * Receita Federal. 422 = Receita recusou (ex.: data divergente). Só "REGULAR" sem óbito é aceito.
 */
export function cpfhubVerifier(apiKey: string, fetchImpl: typeof fetch = fetch): CpfVerifier {
  return {
    name: "cpfhub",
    async verify(cpfDigits, birth) {
      let res: Response;
      try {
        res = await fetchImpl("https://api.cpfhub.io/cpf/realtime", {
          method: "POST",
          headers: { "x-api-key": apiKey, "Content-Type": "application/json" },
          body: JSON.stringify({ cpf: cpfDigits, birthDate: `${pad(birth.day)}/${pad(birth.month)}/${birth.year}` }),
          signal: AbortSignal.timeout(60_000),
        });
      } catch {
        return { status: "unavailable" };
      }
      if (res.status === 422 || res.status === 400 || res.status === 404) {
        return { status: "rejected", reason: "mismatch" };
      }
      if (!res.ok) {
        // 401/403 (chave/créditos), 429 (limite), 5xx: problema do provedor, não do usuário.
        console.warn(`[cpf-verification] cpfhub respondeu ${res.status}`);
        return { status: "unavailable" };
      }
      const body = (await res.json().catch(() => null)) as {
        success?: boolean;
        data?: { situation?: string; deathYear?: number | null; birthDate?: string };
      } | null;
      const situation = body?.data?.situation?.trim().toUpperCase();
      if (!body?.success || !situation) return { status: "unavailable" };
      // Segunda checagem: a data devolvida pela Receita tem de ser a mesma informada.
      const informed = `${pad(birth.day)}/${pad(birth.month)}/${birth.year}`;
      const official = body.data?.birthDate?.replace(/\D/g, "");
      if (official && official !== informed.replace(/\D/g, "")) return { status: "rejected", reason: "mismatch" };
      if (situation === "TITULAR FALECIDO" || body.data?.deathYear) return { status: "rejected", reason: "deceased" };
      if (situation !== "REGULAR") return { status: "rejected", reason: "irregular" };
      return { status: "verified" };
    },
  };
}

/** Desenvolvimento/testes: aceita qualquer CPF com dígitos válidos (a validação de dígitos é feita antes). */
export const digitsOnlyVerifier: CpfVerifier = {
  name: "digits",
  async verify() {
    return { status: "verified" };
  },
};

/** Produção sem provedor configurado: nunca verifica (falha fechada). */
const unavailableVerifier: CpfVerifier = {
  name: "none",
  async verify() {
    return { status: "unavailable" };
  },
};

/**
 * Escolha do verificador:
 * - CPFHUB_API_KEY definida → CPFHub (Receita em tempo real);
 * - sem chave, fora de produção → só dígitos (com aviso);
 * - sem chave em produção → indisponível (nenhum CPF é vinculado sem verificação).
 */
export function getCpfVerifier(): CpfVerifier {
  const key = process.env.CPFHUB_API_KEY?.trim();
  if (key) return cpfhubVerifier(key);
  if (process.env.NODE_ENV === "production") return unavailableVerifier;
  return digitsOnlyVerifier;
}
