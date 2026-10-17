"use server";

import { eq } from "drizzle-orm";
import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { LOCALE_COOKIE, isLocale } from "@/i18n/config";
import { getCurrentUser } from "@/server/auth/session";
import { getDb } from "@/server/db";
import { profiles } from "@/server/db/schema";
import { toResult } from "./result";

/** Troca o idioma: guarda no navegador (cookie) e, se logado, no perfil (para e-mails futuros). */
export async function setLocaleAction(locale: string) {
  return toResult(async () => {
    if (!isLocale(locale)) throw new Error("Idioma inválido.");
    (await cookies()).set(LOCALE_COOKIE, locale, {
      path: "/",
      maxAge: 60 * 60 * 24 * 365,
      sameSite: "lax",
    });
    const user = await getCurrentUser();
    if (user) {
      await (await getDb()).update(profiles).set({ locale }).where(eq(profiles.userId, user.id));
    }
    revalidatePath("/", "layout");
  });
}
