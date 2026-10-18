import { TERMS_VERSION } from "@/domain/legal";
import { randomBytes } from "node:crypto";
import { and, eq, isNull } from "drizzle-orm";
import { DEFAULT_CONTEXT, isAppContext, type AppContext } from "@/domain/contexts";
import { getContextAccess } from "./membership";
import { generatePublicCode } from "@/domain/identity";
import { profiles, userRoles } from "../db/schema";
import { AppError, type Ctx } from "./common";
import type { DB } from "../db";

export function isValidTimeZone(tz: string) {
  try {
    new Intl.DateTimeFormat("pt-BR", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

/** Criado automaticamente após o cadastro (hook do Better Auth). Idempotente. */
export async function ensureProfile(db: DB, userId: string, displayName: string) {
  await db
    .insert(profiles)
    .values({ userId, displayName: displayName.trim() || "Estudante" })
    .onConflictDoNothing();
  await assignPublicCode(db, userId);
}

/** Gera o código público único da conta (tenta de novo no caso raríssimo de colisão). */
export async function assignPublicCode(db: DB, userId: string) {
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      const updated = await db
        .update(profiles)
        .set({ publicCode: generatePublicCode(randomBytes) })
        .where(and(eq(profiles.userId, userId), isNull(profiles.publicCode)))
        .returning({ code: profiles.publicCode });
      return updated[0]?.code ?? null;
    } catch (e) {
      const code = (e as { code?: string; cause?: { code?: string } }).code ?? (e as { cause?: { code?: string } }).cause?.code;
      if (code !== "23505") throw e;
    }
  }
  throw new Error("Não foi possível gerar o código da conta.");
}

export async function getProfile(ctx: Ctx, userId: string) {
  const [p] = await ctx.db.select().from(profiles).where(eq(profiles.userId, userId));
  if (!p) throw new AppError("Perfil não encontrado.", "not_found");
  return p;
}

/** Apenas campos editáveis pelo usuário. XP e papéis nunca passam por aqui. */
export async function updateProfile(
  ctx: Ctx,
  userId: string,
  input: { displayName?: string; timezone?: string; alarmVolume?: number },
) {
  if (input.timezone && !isValidTimeZone(input.timezone)) throw new AppError("Fuso horário inválido.");
  await ctx.db
    .update(profiles)
    .set({
      ...(input.displayName !== undefined ? { displayName: input.displayName.trim() } : {}),
      ...(input.timezone !== undefined ? { timezone: input.timezone } : {}),
      ...(input.alarmVolume !== undefined ? { alarmVolume: input.alarmVolume } : {}),
      updatedAt: ctx.now(),
    })
    .where(eq(profiles.userId, userId));
}

/** Admin da plataforma (o papel "master" também conta como admin). */
export async function isAdmin(db: DB, userId: string) {
  const rows = await db.select({ role: userRoles.role }).from(userRoles).where(eq(userRoles.userId, userId));
  return rows.some((r) => r.role === "admin" || r.role === "master");
}

/** Dono da plataforma (console master). */
export async function isMaster(db: DB, userId: string) {
  const [r] = await db
    .select()
    .from(userRoles)
    .where(and(eq(userRoles.userId, userId), eq(userRoles.role, "master")));
  return Boolean(r);
}

/** Contexto em uso (Acadêmico, Pessoal ou Profissional). */
export async function getActiveContext(ctx: Ctx, userId: string): Promise<AppContext> {
  const [p] = await ctx.db.select({ c: profiles.activeContext }).from(profiles).where(eq(profiles.userId, userId));
  const wanted = p?.c ?? DEFAULT_CONTEXT;
  if (wanted === "personal") return wanted;
  // Acadêmico/Profissional só com aceite de uma organização verificada; senão, Pessoal.
  const access = await getContextAccess(ctx.db, userId);
  return access[wanted] ? wanted : "personal";
}

export async function setActiveContext(ctx: Ctx, userId: string, context: AppContext) {
  if (!isAppContext(context)) throw new AppError("Contexto inválido.");
  if (!(await getContextAccess(ctx.db, userId))[context]) {
    throw new AppError("Este perfil é liberado quando uma instituição ou empresa aceitar você.", "forbidden");
  }
  await ctx.db.update(profiles).set({ activeContext: context, updatedAt: ctx.now() }).where(eq(profiles.userId, userId));
}

/** Registra o aceite da versão vigente dos Termos de Uso e da Política de Privacidade. */
export async function acceptTerms(ctx: Ctx, userId: string) {
  await ctx.db
    .update(profiles)
    .set({ termsVersion: TERMS_VERSION, termsAcceptedAt: ctx.now() })
    .where(eq(profiles.userId, userId));
}
