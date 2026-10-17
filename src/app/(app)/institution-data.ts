import "server-only";
import type { InstitutionPanelProps } from "@/components/institution-panel";
import type { Ctx } from "@/server/services/common";
import { getIdentity } from "@/server/services/identity";
import { countInstitutions, getMembership } from "@/server/services/institutions";
import { getProfile } from "@/server/services/profile";

/** Dados do painel de identidade/instituição (só o que o próprio usuário pode ver). */
export async function loadInstitutionPanel(ctx: Ctx, userId: string): Promise<InstitutionPanelProps> {
  const [profile, identity, membership, counts] = await Promise.all([
    getProfile(ctx, userId),
    getIdentity(ctx, userId),
    getMembership(ctx, userId),
    countInstitutions(ctx.db),
  ]);
  return {
    publicCode: profile.publicCode,
    identity: identity.hasCpf ? { hasCpf: true, masked: identity.masked } : { hasCpf: false },
    membership: membership
      ? {
          name: membership.name,
          acronym: membership.acronym,
          city: membership.city,
          uf: membership.uf,
          kind: membership.kind,
          nextChangeAt: membership.nextChangeAt.toISOString(),
          pending: membership.status === "pending",
        }
      : null,
    catalogSize: { higher: counts.higher ?? 0, school: counts.school ?? 0 },
  };
}
