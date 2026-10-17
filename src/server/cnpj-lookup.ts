/**
 * Consulta de CNPJ (CNPJá). Com CNPJ_API_KEY usa a API comercial (api.cnpja.com); sem chave
 * (desenvolvimento), a API pública (open.cnpja.com, com limite de consultas por minuto).
 * Devolve só o necessário para verificar a organização; falha do provedor = "indisponível".
 */
export type CnpjData = {
  taxId: string;
  legalName: string;
  alias: string | null;
  active: boolean;
  statusText: string;
  mainActivity: { id: number; text: string } | null;
  activityIds: number[];
  emailDomains: string[];
  /** E-mails do cadastro (avisos de que a organização foi cadastrada). */
  emails: string[];
  memberNames: string[];
  city: string | null;
  uf: string | null;
};

export type CnpjLookup = { status: "found"; data: CnpjData } | { status: "not_found" } | { status: "unavailable" };

export interface CnpjProvider {
  readonly name: string;
  lookup(cnpjDigits: string): Promise<CnpjLookup>;
}

type OfficeResponse = {
  taxId?: string;
  alias?: string | null;
  status?: { id?: number; text?: string };
  company?: { name?: string; members?: { person?: { name?: string } }[] };
  mainActivity?: { id: number; text: string };
  sideActivities?: { id: number }[];
  emails?: { address?: string; domain?: string }[];
  address?: { city?: string; state?: string };
};

export function cnpjaProvider(apiKey: string | undefined, fetchImpl: typeof fetch = fetch): CnpjProvider {
  const base = apiKey ? "https://api.cnpja.com" : "https://open.cnpja.com";
  return {
    name: "cnpja",
    async lookup(cnpj) {
      let res: Response;
      try {
        res = await fetchImpl(`${base}/office/${cnpj}`, {
          headers: apiKey ? { Authorization: apiKey } : {},
          signal: AbortSignal.timeout(30_000),
        });
      } catch {
        return { status: "unavailable" };
      }
      if (res.status === 404) return { status: "not_found" };
      if (!res.ok) {
        console.warn(`[cnpj-lookup] cnpja respondeu ${res.status}`);
        return { status: "unavailable" };
      }
      const j = (await res.json().catch(() => null)) as OfficeResponse | null;
      if (!j?.taxId || !j.company?.name) return { status: "unavailable" };
      const domains = (j.emails ?? [])
        .map((e) => (e.domain ?? e.address?.split("@")[1] ?? "").toLowerCase())
        .filter(Boolean);
      return {
        status: "found",
        data: {
          taxId: j.taxId,
          legalName: j.company.name,
          alias: j.alias ?? null,
          // Situação cadastral 2 = "Ativa".
          active: j.status?.id === 2,
          statusText: j.status?.text ?? "",
          mainActivity: j.mainActivity ?? null,
          activityIds: [j.mainActivity?.id, ...(j.sideActivities ?? []).map((a) => a.id)].filter(
            (x): x is number => typeof x === "number",
          ),
          emailDomains: [...new Set(domains)],
          emails: (j.emails ?? []).map((e) => e.address?.toLowerCase() ?? "").filter(Boolean),
          memberNames: (j.company.members ?? []).map((m) => m.person?.name ?? "").filter(Boolean),
          city: j.address?.city ?? null,
          uf: j.address?.state ?? null,
        },
      };
    },
  };
}

export function getCnpjProvider(): CnpjProvider {
  return cnpjaProvider(process.env.CNPJ_API_KEY || undefined);
}
