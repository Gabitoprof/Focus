"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { appCtx, requireUser } from "@/server/auth/session";
import { registerCpf } from "@/server/services/identity";
import { joinInstitution, requestInstitution, searchInstitutions } from "@/server/services/institutions";
import { toResult } from "./result";

const kind = z.enum(["higher", "school"]);

export async function registerCpfAction(input: { cpf: string; birthDate: string }) {
  return toResult(async () => {
    const user = await requireUser();
    const data = z.object({ cpf: z.string().max(20), birthDate: z.string().max(10) }).parse(input);
    await registerCpf(await appCtx(), user.id, data.cpf, data.birthDate);
    revalidatePath("/", "layout");
  });
}

export async function searchInstitutionsAction(input: { query: string; kind?: "higher" | "school"; uf?: string }) {
  return toResult(async () => {
    await requireUser();
    const q = z
      .object({ query: z.string().max(100), kind: kind.optional(), uf: z.string().max(2).optional() })
      .parse(input);
    return searchInstitutions(await appCtx(), q);
  });
}

export async function joinInstitutionAction(input: { institutionId: string; enrollment: string }) {
  return toResult(async () => {
    const user = await requireUser();
    const data = z.object({ institutionId: z.uuid(), enrollment: z.string().max(40) }).parse(input);
    const result = await joinInstitution(await appCtx(), user.id, data);
    revalidatePath("/", "layout");
    return result;
  });
}

export async function requestInstitutionAction(input: { kind: "higher" | "school"; name: string; city: string; uf: string }) {
  return toResult(async () => {
    const user = await requireUser();
    const data = z
      .object({ kind, name: z.string().max(200), city: z.string().max(100), uf: z.string().max(2) })
      .parse(input);
    await requestInstitution(await appCtx(), user.id, data);
  });
}
