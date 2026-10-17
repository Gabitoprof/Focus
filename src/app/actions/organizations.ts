"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { PROJECT_LIMITS } from "@/domain/contexts";
import { ORGANIZATION_KINDS } from "@/domain/organizations";
import { appCtx, requireUser } from "@/server/auth/session";
import { AppError } from "@/server/services/common";
import * as svc from "@/server/services/organizations";
import { isAdmin } from "@/server/services/profile";
import { toResult } from "./result";

const id = z.uuid("Identificador inválido.");
const code = z.string().trim().min(4, "Informe o código da conta.").max(20, "Informe o código da conta.");
const area = z.string().trim().max(60, "Área muito longa (máx. 60).").nullish();

async function run<T>(fn: (ctx: Awaited<ReturnType<typeof appCtx>>, userId: string) => Promise<T>) {
  return toResult(async () => {
    const user = await requireUser();
    const result = await fn(await appCtx(), user.id);
    revalidatePath("/organizacao", "layout");
    revalidatePath("/registro", "layout");
    return result;
  });
}

/** Endereço público do site (para o link de confirmação). */
async function baseUrl() {
  if (process.env.BETTER_AUTH_URL) return process.env.BETTER_AUTH_URL.replace(/\/$/, "");
  const h = await headers();
  return `${h.get("x-forwarded-proto") ?? "http"}://${h.get("host")}`;
}

export async function requestOrganizationAction(input: {
  kind: string;
  cnpj: string;
  alias: string;
  contactEmail: string;
  requesterRole: string;
  message: string;
}) {
  return run(async (ctx, uid) => {
    const data = z
      .object({
        kind: z.enum(ORGANIZATION_KINDS, "Tipo inválido."),
        cnpj: z.string().trim().min(14, "CNPJ inválido.").max(20, "CNPJ inválido."),
        alias: z.string().trim().min(2, "Informe o nome fantasia.").max(120, "Nome muito longo (máx. 120)."),
        contactEmail: z.email("E-mail inválido.").max(160, "E-mail inválido."),
        requesterRole: z.string().trim().min(2, "Informe o seu cargo.").max(80, "Cargo muito longo (máx. 80)."),
        message: z.string().trim().min(10, "Conte em poucas palavras o seu interesse.").max(1000, "Mensagem muito longa (máx. 1000)."),
      })
      .parse(input);
    return svc.requestOrganization(ctx, uid, data, { baseUrl: await baseUrl() });
  });
}

export async function confirmOrganizationEmailAction(token: string) {
  return toResult(async () => {
    const ctx = await appCtx();
    const result = await svc.confirmOrganizationEmail(ctx, z.string().regex(/^[0-9a-f]{64}$/, "Link inválido ou já utilizado.").parse(token));
    revalidatePath("/organizacao", "layout");
    return result;
  });
}

export async function reviewOrganizationAction(orgId: string, approve: boolean, note: string) {
  return run(async (ctx, uid) => {
    if (!(await isAdmin(ctx.db, uid))) throw new AppError("Acesso restrito.", "forbidden");
    await svc.reviewOrganization(ctx, uid, id.parse(orgId), {
      approve: z.boolean().parse(approve),
      note: z.string().trim().max(500).parse(note),
    });
    revalidatePath("/admin/organizacoes");
  });
}

export async function inviteOrgMemberAction(orgId: string, input: { publicCode: string; role: string; area?: string | null }) {
  return run(async (ctx, uid) => {
    const data = z.object({ publicCode: code, role: z.enum(["manager", "member"], "Papel inválido."), area }).parse(input);
    await svc.inviteOrgMember(ctx, uid, id.parse(orgId), data);
  });
}

export async function respondOrgInviteAction(orgId: string, accept: boolean) {
  return run((ctx, uid) => svc.respondOrgInvite(ctx, uid, id.parse(orgId), z.boolean().parse(accept)));
}

export async function updateOrgMemberAction(orgId: string, memberId: string, input: { role?: string; area?: string | null }) {
  return run(async (ctx, uid) => {
    const data = z.object({ role: z.enum(["manager", "member"], "Papel inválido.").optional(), area }).parse(input);
    await svc.updateOrgMember(ctx, uid, id.parse(orgId), z.string().min(1).max(64).parse(memberId), {
      ...(data.role ? { role: data.role } : {}),
      ...("area" in input ? { area: data.area ?? null } : {}),
    });
  });
}

export async function removeOrgMemberAction(orgId: string, memberId: string) {
  return run((ctx, uid) => svc.removeOrgMember(ctx, uid, id.parse(orgId), z.string().min(1).max(64).parse(memberId)));
}

export async function createOrgProjectAction(
  orgId: string,
  input: { name: string; description?: string | null; targetHours?: number | null; dueDate?: string | null },
) {
  return run(async (ctx, uid) => {
    const data = z
      .object({
        name: z.string().trim().min(1, "Informe um nome.").max(80, "Nome muito longo (máx. 80)."),
        description: z.string().trim().max(500, "Descrição muito longa (máx. 500).").nullish(),
        targetHours: z.number("Horas a cumprir inválidas.").positive("Horas a cumprir inválidas.").max(PROJECT_LIMITS.maxTargetMinutes / 60, "Horas a cumprir inválidas.").nullish(),
        dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Data inválida.").nullish().or(z.literal("").transform(() => null)),
      })
      .parse(input);
    const p = await svc.createOrgProject(ctx, uid, id.parse(orgId), {
      name: data.name,
      description: data.description ?? null,
      targetMinutes: data.targetHours ? Math.round(data.targetHours * 60) : null,
      dueDate: data.dueDate ?? null,
    });
    return { id: p.id };
  });
}

export async function assignToOrgProjectAction(orgId: string, projectId: string, memberId: string) {
  return run((ctx, uid) =>
    svc.assignToOrgProject(ctx, uid, id.parse(orgId), id.parse(projectId), z.string().min(1).max(64).parse(memberId)),
  );
}

export async function updateOrgPublicPageAction(orgId: string, input: { about?: string; whyStudy?: string; website?: string }) {
  return run(async (ctx, uid) => {
    const data = z
      .object({
        about: z.string().max(1200, "Texto muito longo (máx. 1200).").optional(),
        whyStudy: z.string().max(1200, "Texto muito longo (máx. 1200).").optional(),
        website: z.string().max(200, "Informe o site começando com https://.").optional(),
      })
      .parse(input);
    await svc.updateOrgPublicPage(ctx, uid, id.parse(orgId), data);
  });
}

/** Busca de membros ativos por nome ou CPF e turma/área (dono e gestores). Não altera nada. */
export async function searchOrgMembersAction(orgId: string, filters: { query?: string; area?: string | null; excludeProjectId?: string }) {
  return toResult(async () => {
    const user = await requireUser();
    const f = z
      .object({
        query: z.string().max(80).optional(),
        area: z.string().max(60).nullish(),
        excludeProjectId: id.optional(),
      })
      .parse(filters);
    return svc.searchOrgMembers(await appCtx(), user.id, id.parse(orgId), f);
  });
}
