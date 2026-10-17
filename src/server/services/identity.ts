import { and, count, eq, gte } from "drizzle-orm";
import { cpfDigits, isValidCpf } from "@/domain/identity";
import { auditLogs, cpfVerificationAttempts, institutionMemberships, userIdentity } from "../db/schema";
import { getCpfVerifier, type BirthDate, type CpfVerifier } from "../cpf-verification";
import { cpfHmac } from "../identity-crypto";
import { AppError, type Ctx } from "./common";

/** Tentativas de verificação por conta em 24 h (evita usar a Focus para "testar" CPFs alheios). */
export const MAX_CPF_ATTEMPTS_PER_DAY = 3;

function isUniqueViolation(e: unknown) {
  const err = e as { code?: string; cause?: { code?: string } };
  return err?.code === "23505" || err?.cause?.code === "23505";
}

/** "AAAA-MM-DD" (campo de data do navegador) → data validada. */
export function parseBirthDate(input: string, now: Date): BirthDate {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(input.trim());
  if (!m) throw new AppError("Informe a data de nascimento.");
  const [year, month, day] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const d = new Date(Date.UTC(year, month - 1, day));
  const real = d.getUTCFullYear() === year && d.getUTCMonth() === month - 1 && d.getUTCDate() === day;
  if (!real || year < 1900 || d > now) throw new AppError("Data de nascimento inválida.");
  return { day, month, year };
}

export async function getIdentity(ctx: Ctx, userId: string) {
  const [row] = await ctx.db
    .select({
      cpfLastDigits: userIdentity.cpfLastDigits,
      createdAt: userIdentity.createdAt,
      verificationProvider: userIdentity.verificationProvider,
    })
    .from(userIdentity)
    .where(eq(userIdentity.userId, userId));
  return row
    ? {
        hasCpf: true as const,
        masked: `•••.•••.•••-${row.cpfLastDigits}`,
        since: row.createdAt,
        verifiedOfficially: row.verificationProvider === "cpfhub",
      }
    : { hasCpf: false as const };
}

/**
 * Vincula um CPF à conta depois de conferir CPF + data de nascimento com o provedor.
 * Guarda só o HMAC do CPF (uma conta por CPF, índice único), os 2 últimos dígitos e o ano de
 * nascimento. Ordem: dígitos → já vinculado? → CPF em outra conta? → limite → provedor → grava.
 */
export async function registerCpf(
  ctx: Ctx,
  userId: string,
  cpf: string,
  birthDateInput: string,
  verifier: CpfVerifier = getCpfVerifier(),
) {
  const now = ctx.now();
  if (!isValidCpf(cpf)) throw new AppError("CPF inválido. Confira os números digitados.");
  const birth = parseBirthDate(birthDateInput, now);
  const existing = await getIdentity(ctx, userId);
  if (existing.hasCpf) throw new AppError("Esta conta já tem um CPF vinculado. Para alterar, fale com o suporte.", "conflict");

  const digits = cpfDigits(cpf);
  const hmac = cpfHmac(digits);
  // Antes de gastar uma consulta paga: o CPF já está em outra conta?
  const [taken] = await ctx.db.select({ userId: userIdentity.userId }).from(userIdentity).where(eq(userIdentity.cpfHmac, hmac));
  if (taken) throw new AppError("Este CPF já está vinculado a outra conta. Se acha que é um erro, fale com o suporte.", "conflict");

  const since = new Date(now.getTime() - 24 * 3_600_000);
  const [{ n }] = await ctx.db
    .select({ n: count() })
    .from(cpfVerificationAttempts)
    .where(and(eq(cpfVerificationAttempts.userId, userId), gte(cpfVerificationAttempts.createdAt, since)));
  if (Number(n) >= MAX_CPF_ATTEMPTS_PER_DAY) {
    throw new AppError("Muitas tentativas de verificação. Tente novamente em 24 horas.", "conflict");
  }

  const check = await verifier.verify(digits, birth);
  const outcome = check.status === "rejected" ? check.reason : check.status;
  // Indisponibilidade do provedor não conta contra o usuário.
  if (check.status !== "unavailable") {
    await ctx.db.insert(cpfVerificationAttempts).values({ userId, outcome, createdAt: now });
  }
  if (check.status === "unavailable") {
    throw new AppError("A verificação de CPF está indisponível no momento. Tente novamente mais tarde.");
  }
  if (check.status === "rejected") {
    // Mensagem única para não revelar se o CPF existe, se a data é que não confere etc.
    throw new AppError("CPF inválido ou dados não conferem.");
  }

  try {
    await ctx.db.insert(userIdentity).values({
      userId,
      cpfHmac: hmac,
      cpfLastDigits: digits.slice(-2),
      birthYear: birth.year,
      verificationProvider: verifier.name,
      verifiedAt: now,
      createdAt: now,
    });
  } catch (e) {
    if (isUniqueViolation(e)) {
      throw new AppError("Este CPF já está vinculado a outra conta. Se acha que é um erro, fale com o suporte.", "conflict");
    }
    throw e;
  }
}

/** Admin: libera o CPF de uma conta (disputa, uso indevido). Remove também o vínculo institucional. */
export async function releaseCpf(ctx: Ctx, adminId: string, userId: string, reason: string) {
  if (!reason.trim()) throw new AppError("Informe o motivo.");
  await ctx.db.transaction(async (tx) => {
    await tx.delete(institutionMemberships).where(eq(institutionMemberships.userId, userId));
    await tx.delete(userIdentity).where(eq(userIdentity.userId, userId));
    await tx.insert(auditLogs).values({
      actorUserId: adminId,
      action: "identity.cpf_released",
      entityType: "user",
      entityId: userId,
      metadata: { reason },
    });
  });
}
