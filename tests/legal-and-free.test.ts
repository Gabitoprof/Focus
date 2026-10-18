import { describe, expect, it, beforeEach } from "vitest";
import { TERMS_VERSION, needsTermsAcceptance } from "@/domain/legal";
import { FREE_DURING_TESTS, isFreeForEveryone } from "@/domain/entitlements";
import { acceptTerms, getProfile } from "@/server/services/profile";
import { createUser, setup } from "./helpers";

describe("Termos de Uso e Política de Privacidade", () => {
  let env: Awaited<ReturnType<typeof setup>>;
  beforeEach(async () => {
    env = await setup();
  });
  it("conta nova precisa aceitar; depois do aceite guarda versão e data", async () => {
    const u = await createUser(env.ctx, "Ana");
    expect(needsTermsAcceptance((await getProfile(env.ctx, u.id)).termsVersion)).toBe(true);
    await acceptTerms(env.ctx, u.id);
    const p = await getProfile(env.ctx, u.id);
    expect(p.termsVersion).toBe(TERMS_VERSION);
    expect(p.termsAcceptedAt).toEqual(env.clock.now());
    expect(needsTermsAcceptance(p.termsVersion)).toBe(false);
    expect(needsTermsAcceptance("2000-01-01")).toBe(true);
  });
});

describe("Ranking liberado durante os testes", () => {
  it("fica livre para todos, mas nos testes automáticos a cobrança continua valendo", () => {
    expect(FREE_DURING_TESTS).toContain("ranking");
    expect(process.env.FOCUS_ENFORCE_PLANS).toBe("1");
    expect(isFreeForEveryone("ranking")).toBe(false);
    const prev = process.env.FOCUS_ENFORCE_PLANS;
    delete process.env.FOCUS_ENFORCE_PLANS;
    expect(isFreeForEveryone("ranking")).toBe(true);
    process.env.FOCUS_ENFORCE_PLANS = prev;
  });
});
