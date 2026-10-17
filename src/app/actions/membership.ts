"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { appCtx, requireUser } from "@/server/auth/session";
import * as svc from "@/server/services/membership";
import { toResult } from "./result";

const id = z.uuid("Identificador inválido.");

async function run<T>(fn: (ctx: Awaited<ReturnType<typeof appCtx>>, userId: string) => Promise<T>) {
  return toResult(async () => {
    const user = await requireUser();
    const result = await fn(await appCtx(), user.id);
    revalidatePath("/", "layout");
    return result;
  });
}

export async function searchCompaniesAction(query: string) {
  return run((ctx) => svc.searchCompanies(ctx, z.string().max(80).parse(query)));
}

export async function requestCompanyLinkAction(orgId: string, registration: string) {
  return run((ctx, uid) =>
    svc.requestCompanyLink(ctx, uid, id.parse(orgId), z.string().trim().min(1, "Informe uma matrícula válida.").max(40).parse(registration)),
  );
}

export async function reviewMemberRequestsAction(orgId: string, userIds: string[], approve: boolean) {
  return run((ctx, uid) =>
    svc.reviewMemberRequests(ctx, uid, id.parse(orgId), z.array(z.string().min(1).max(64)).max(500).parse(userIds), z.boolean().parse(approve)),
  );
}

/** Lista de matrículas: uma por linha (ou separadas por vírgula/ponto e vírgula). */
export async function addToRosterAction(orgId: string, text: string) {
  return run((ctx, uid) => {
    const values = z.string().max(3_000_000, "Lista grande demais.").parse(text).split(/[\r\n,;]+/);
    return svc.addToRoster(ctx, uid, id.parse(orgId), values);
  });
}

export async function linkOrgToInstitutionAction(orgId: string, institutionId: string) {
  return run((ctx, uid) => svc.linkOrgToInstitution(ctx, uid, id.parse(orgId), id.parse(institutionId)));
}
