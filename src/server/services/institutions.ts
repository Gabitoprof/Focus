import { and, asc, eq, ilike, like, or, sql } from "drizzle-orm";
import { normalizeTerm } from "@/domain/catalog";
import { normalizeEnrollment } from "@/domain/identity";
import type { DB } from "../db";
import { auditLogs, institutionMemberships, institutionRequests, institutions, INSTITUTION_KINDS } from "../db/schema";
import { enrollmentHmac } from "../identity-crypto";
import { getCatalogSettings } from "./catalog";
import { settleInstitutionMembership } from "./membership";
import { AppError, type Ctx } from "./common";
import { getIdentity } from "./identity";

export type InstitutionKind = (typeof INSTITUTION_KINDS)[number];

const UFS = new Set("AC AL AP AM BA CE DF ES GO MA MT MS MG PA PB PR PE PI RJ RN RS RO RR SC SP SE TO".split(" "));

export async function countInstitutions(db: DB) {
  const rows = await db
    .select({ kind: institutions.kind, n: sql<number>`count(*)::int` })
    .from(institutions)
    .where(eq(institutions.isActive, true))
    .groupBy(institutions.kind);
  return Object.fromEntries(rows.map((r) => [r.kind, Number(r.n)])) as Partial<Record<InstitutionKind, number>>;
}

/** Busca por nome ou sigla (ignorando acentos), opcionalmente por tipo e UF. */
export async function searchInstitutions(ctx: Ctx, q: { query: string; kind?: InstitutionKind; uf?: string; limit?: number }) {
  const term = normalizeTerm(q.query);
  if (term.length < 2) return [];
  // Escapa os curingas do LIKE digitados pelo usuário.
  const acronymPrefix = q.query.trim().replace(/[\\%_]/g, (c) => `\\${c}`);
  // Todas as palavras, em qualquer ordem ("instituto federal sul" acha "INSTITUTO FEDERAL ... SUL-RIO-GRANDENSE").
  // `term` só tem [a-z0-9 ], então não há curingas do LIKE nas palavras.
  const words = term.split(" ").filter(Boolean);
  const where = [
    eq(institutions.isActive, true),
    or(
      and(...words.map((w) => like(institutions.normalizedName, `%${w}%`))),
      ilike(institutions.acronym, `${acronymPrefix}%`),
    )!,
  ];
  if (q.kind) where.push(eq(institutions.kind, q.kind));
  if (q.uf && UFS.has(q.uf.toUpperCase())) where.push(eq(institutions.uf, q.uf.toUpperCase()));
  return ctx.db
    .select({
      id: institutions.id,
      kind: institutions.kind,
      name: institutions.name,
      acronym: institutions.acronym,
      city: institutions.city,
      uf: institutions.uf,
    })
    .from(institutions)
    .where(and(...where))
    // Sigla exata primeiro (ex.: "unicamp" → UNICAMP), depois nomes que começam com o termo.
    .orderBy(
      sql`case when upper(${institutions.acronym}) = upper(${q.query.trim()}) then 0
               when ${institutions.normalizedName} like ${term + "%"} then 1 else 2 end`,
      asc(institutions.name),
    )
    .limit(Math.min(q.limit ?? 20, 50));
}

export async function getMembership(ctx: Ctx, userId: string) {
  const [m] = await ctx.db
    .select({
      institutionId: institutions.id,
      kind: institutions.kind,
      name: institutions.name,
      acronym: institutions.acronym,
      city: institutions.city,
      uf: institutions.uf,
      joinedAt: institutionMemberships.joinedAt,
      status: institutionMemberships.status,
    })
    .from(institutionMemberships)
    .innerJoin(institutions, eq(institutions.id, institutionMemberships.institutionId))
    .where(eq(institutionMemberships.userId, userId));
  if (!m) return null;
  const settings = await getCatalogSettings(ctx.db);
  const nextChangeAt = new Date(m.joinedAt.getTime() + settings.institutionChangeDays * 86_400_000);
  return { ...m, nextChangeAt };
}

/**
 * Vincula o usuário a uma instituição. Exige CPF já vinculado. A matrícula vira HMAC e é única
 * dentro da instituição. Trocar de instituição só após `institutionChangeDays`; corrigir a
 * matrícula na mesma instituição é permitido e mantém a data de entrada.
 */
export async function joinInstitution(ctx: Ctx, userId: string, input: { institutionId: string; enrollment: string }) {
  const identity = await getIdentity(ctx, userId);
  if (!identity.hasCpf) throw new AppError("Para participar do ranking da instituição, vincule seu CPF primeiro.");
  const normalized = normalizeEnrollment(input.enrollment);
  if (normalized.length < 3 || normalized.length > 30) throw new AppError("Informe uma matrícula válida.");

  const [inst] = await ctx.db
    .select()
    .from(institutions)
    .where(and(eq(institutions.id, input.institutionId), eq(institutions.isActive, true)));
  if (!inst) throw new AppError("Instituição não encontrada.", "not_found");

  const now = ctx.now();
  const current = await getMembership(ctx, userId);
  let result: "active" | "pending" = "active";
  const hmac = enrollmentHmac(inst.id, normalized);
  const sameInstitution = current?.institutionId === inst.id;
  if (current && !sameInstitution && current.nextChangeAt > now) {
    const when = current.nextChangeAt.toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" });
    throw new AppError(`Você poderá trocar de instituição a partir de ${when}.`, "conflict");
  }

  try {
    await ctx.db.transaction(async (tx) => {
      await tx
        .insert(institutionMemberships)
        .values({ userId, institutionId: inst.id, enrollmentHmac: hmac, joinedAt: now })
        .onConflictDoUpdate({
          target: institutionMemberships.userId,
          set: sameInstitution
            ? { enrollmentHmac: hmac }
            : { institutionId: inst.id, enrollmentHmac: hmac, joinedAt: now, status: "active" },
        });
      // Corrigir a matrícula de um vínculo já aceito não reabre o aceite.
      if (!(sameInstitution && current?.status === "active")) {
        result = await settleInstitutionMembership(tx, userId, inst.id, input.enrollment, now);
      }
      await tx.insert(auditLogs).values({
        actorUserId: userId,
        action: sameInstitution ? "institution.enrollment_updated" : "institution.joined",
        entityType: "institution",
        entityId: inst.id,
      });
    });
  } catch (e) {
    const err = e as { code?: string; cause?: { code?: string } };
    if (err?.code === "23505" || err?.cause?.code === "23505") {
      throw new AppError("Esta matrícula já está vinculada a outra conta nesta instituição. Fale com o suporte se for um erro.", "conflict");
    }
    throw e;
  }
  return { status: result as "active" | "pending" };
}

/** "Minha instituição não está na lista." */
export async function requestInstitution(
  ctx: Ctx,
  userId: string,
  input: { kind: InstitutionKind; name: string; city: string; uf: string },
) {
  const uf = input.uf.trim().toUpperCase();
  if (!UFS.has(uf)) throw new AppError("UF inválida.");
  if (input.name.trim().length < 3) throw new AppError("Informe o nome da instituição.");
  if (input.city.trim().length < 2) throw new AppError("Informe a cidade.");
  const pending = await ctx.db
    .select({ id: institutionRequests.id })
    .from(institutionRequests)
    .where(and(eq(institutionRequests.userId, userId), eq(institutionRequests.status, "pending")));
  if (pending.length >= 3) throw new AppError("Você já tem pedidos em análise. Aguarde a resposta.");
  await ctx.db.insert(institutionRequests).values({
    userId,
    kind: input.kind,
    name: input.name.trim(),
    city: input.city.trim(),
    uf,
    createdAt: ctx.now(),
  });
}

/** Abreviações usadas nos nomes do INEP → palavras que as pessoas digitam. */
const SCHOOL_ABBREVIATIONS: [RegExp, string][] = [
  // Siglas inequívocas valem em qualquer posição; as ambíguas ("em", "e", "c", "u" — também
  // palavras comuns) só no início do nome.
  [/^(e e|ee|eeb|eei|eef|eem|eeefm|eeef|eeem)\b|\b(eeb|eeefm|eeef|eeem)\b/, "escola estadual"],
  [/^(e m|em)\b|\b(emef|emei|emeb|emeief|emeif|pem)\b/, "escola municipal"],
  [/\b(c e|c eef|c ee|cee)\b|^ce\b/, "colegio estadual"],
  [/^(c m|cm)\b/, "colegio municipal"],
  [/^(col|c)\b/, "colegio"],
  [/^(esc|e)\b/, "escola"],
  [/\b(cmei|cemei|ceim)\b/, "centro municipal de educacao infantil"],
  [/\bcei\b/, "centro de educacao infantil"],
  [/^(ue|ueb|u|ui|unid)\b/, "unidade escolar"],
  [/\b(etec|ete)\b/, "escola tecnica"],
  [/\bced\b/, "centro educacional"],
  [/\bcef\b/, "centro de ensino fundamental"],
  [/\bcem\b/, "centro de ensino medio"],
];

/** Palavras extras para a busca: expande as abreviações do nome da escola. */
export function schoolSearchExtras(normalizedName: string): string {
  return SCHOOL_ABBREVIATIONS.filter(([re]) => re.test(normalizedName))
    .map(([, words]) => words)
    .join(" ");
}

/**
 * Importação da base oficial (e-MEC / INEP). Idempotente por (fonte, código):
 * atualiza nome, cidade e situação; nunca apaga (instituições extintas ficam inativas).
 */
export async function upsertInstitutions(
  db: DB,
  rows: {
    kind: InstitutionKind;
    source: "emec" | "inep" | "admin";
    sourceCode: string;
    name: string;
    acronym?: string | null;
    city?: string | null;
    uf?: string | null;
    isActive?: boolean;
  }[],
) {
  const chunk = 500;
  for (let i = 0; i < rows.length; i += chunk) {
    const values = rows.slice(i, i + chunk).map((r) => ({
      kind: r.kind,
      source: r.source,
      sourceCode: r.sourceCode,
      name: r.name.trim(),
      acronym: r.acronym?.trim() || null,
      // Nome + sigla + município (+ abreviações expandidas nas escolas): permite buscar
      // "escola estadual belo horizonte" e achar "EE PROFESSOR ... · Belo Horizonte".
      normalizedName: (() => {
        const base = normalizeTerm(`${r.name} ${r.acronym ?? ""} ${r.city ?? ""}`);
        return r.kind === "school" ? `${base} ${schoolSearchExtras(normalizeTerm(r.name))}`.trim() : base;
      })(),
      city: r.city?.trim() || null,
      uf: r.uf?.trim().toUpperCase() || null,
      isActive: r.isActive ?? true,
      updatedAt: new Date(),
    }));
    await db
      .insert(institutions)
      .values(values)
      .onConflictDoUpdate({
        target: [institutions.source, institutions.sourceCode],
        set: {
          name: sql`excluded.name`,
          acronym: sql`excluded.acronym`,
          normalizedName: sql`excluded.normalized_name`,
          city: sql`excluded.city`,
          uf: sql`excluded.uf`,
          isActive: sql`excluded.is_active`,
          updatedAt: sql`excluded.updated_at`,
        },
      });
  }
}
