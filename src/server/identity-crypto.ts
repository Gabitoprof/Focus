import { createHmac } from "node:crypto";
import { cpfDigits, normalizeEnrollment } from "@/domain/identity";

const DEV_FALLBACK = "focus-dev-only-identity-secret-nao-usar-em-producao";

/**
 * Chave do HMAC de identidade. Deve ser longa, aleatória e NUNCA trocada depois que houver
 * usuários: com outra chave, o mesmo CPF gera outro HMAC e a unicidade deixa de funcionar.
 */
function secret(): string {
  const s = process.env.IDENTITY_HMAC_SECRET;
  if (s && s.length >= 32) return s;
  if (process.env.NODE_ENV === "production") {
    throw new Error("IDENTITY_HMAC_SECRET ausente ou curta (mínimo 32 caracteres).");
  }
  return DEV_FALLBACK;
}

const hmac = (value: string) => createHmac("sha256", secret()).update(value).digest("hex");

/** HMAC do CPF (só dígitos). Mesmo CPF → mesmo HMAC; o HMAC não permite recuperar o CPF. */
export function cpfHmac(cpf: string): string {
  return hmac(`cpf:${cpfDigits(cpf)}`);
}

/** HMAC da matrícula, vinculado à instituição (a mesma matrícula em outra instituição não colide). */
export function enrollmentHmac(institutionId: string, enrollment: string): string {
  return hmac(`enr:${institutionId}:${normalizeEnrollment(enrollment)}`);
}
