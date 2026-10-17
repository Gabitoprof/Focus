/**
 * Organizações (CNPJ): instituições de ensino e empresas. A conta da organização não é um login
 * separado: o responsável (uma conta com CPF verificado) vira o dono dela, depois de verificada.
 */
export const ORGANIZATION_KINDS = ["institution", "company"] as const;
export type OrganizationKind = (typeof ORGANIZATION_KINDS)[number];

export const ORGANIZATION_STATUSES = ["pending_email", "pending_review", "approved", "rejected"] as const;
export type OrganizationStatus = (typeof ORGANIZATION_STATUSES)[number];

export const ORG_ROLES = ["owner", "manager", "member"] as const;
export type OrgRole = (typeof ORG_ROLES)[number];

/** Instituição → contexto Acadêmico; empresa → Profissional. */
export const orgContext = (kind: OrganizationKind): "academic" | "professional" =>
  kind === "institution" ? "academic" : "professional";

export const ORG_LIMITS = {
  /** Pedidos em andamento por conta. */
  maxOpenRequests: 3,
  /** Validade do link de confirmação do e-mail. */
  emailTokenHours: 48,
  maxMembers: 5000,
} as const;

export const cnpjDigits = (v: string) => v.replace(/\D/g, "");

/** Dígitos verificadores do CNPJ (módulo 11). */
export function isValidCnpj(value: string): boolean {
  const d = cnpjDigits(value);
  if (d.length !== 14 || /^(\d)\1{13}$/.test(d)) return false;
  const calc = (len: number) => {
    const weights = len === 12 ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2] : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
    const sum = weights.reduce((acc, w, i) => acc + Number(d[i]) * w, 0);
    const r = sum % 11;
    return r < 2 ? 0 : 11 - r;
  };
  return calc(12) === Number(d[12]) && calc(13) === Number(d[13]);
}

export const formatCnpj = (v: string) =>
  cnpjDigits(v).replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, "$1.$2.$3/$4-$5");

/** Provedores de e-mail gratuitos: não comprovam vínculo com a organização. */
export const FREE_EMAIL_DOMAINS = new Set([
  "gmail.com",
  "googlemail.com",
  "hotmail.com",
  "hotmail.com.br",
  "outlook.com",
  "outlook.com.br",
  "live.com",
  "msn.com",
  "yahoo.com",
  "yahoo.com.br",
  "ymail.com",
  "icloud.com",
  "me.com",
  "uol.com.br",
  "bol.com.br",
  "terra.com.br",
  "ig.com.br",
  "globo.com",
  "globomail.com",
  "zipmail.com.br",
  "protonmail.com",
  "proton.me",
  "aol.com",
  "gmx.com",
  "mail.com",
  "yandex.com",
]);

export function emailDomain(email: string): string {
  return email.trim().toLowerCase().split("@")[1] ?? "";
}

export const isFreeEmailDomain = (domain: string) => FREE_EMAIL_DOMAINS.has(domain.toLowerCase());

/** O domínio do e-mail informado é o mesmo (ou subdomínio) de um domínio do cadastro do CNPJ. */
export function domainMatches(contactDomain: string, cnpjDomains: string[]): boolean {
  const d = contactDomain.toLowerCase();
  return cnpjDomains
    .map((x) => x.toLowerCase())
    .filter((x) => x && !isFreeEmailDomain(x))
    .some((x) => d === x || d.endsWith(`.${x}`));
}

/** CNAE de educação (divisão 85): exigido para instituições de ensino. */
export const isEducationActivity = (cnae: number | string) => String(cnae).padStart(7, "0").startsWith("85");

/** Resultado das checagens automáticas do pedido. */
export type OrgChecks = {
  cnpjActive: boolean;
  educationActivity: boolean | null;
  corporateDomain: boolean;
  domainMatchesCnpj: boolean;
  requesterIsMember: boolean;
  emailConfirmed: boolean;
};

/** Tudo confere → aprovação automática; senão, análise manual. */
export function canAutoApprove(kind: OrganizationKind, c: OrgChecks): boolean {
  return (
    c.cnpjActive &&
    c.corporateDomain &&
    c.domainMatchesCnpj &&
    c.emailConfirmed &&
    (kind === "company" || c.educationActivity === true)
  );
}
