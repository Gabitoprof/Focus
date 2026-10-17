import "server-only";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getDb } from "../db";
import type { Ctx } from "../services/common";
import { getAuth } from "./index";

export async function getCurrentUser() {
  // Ler os cabeçalhos primeiro marca a rota como dinâmica antes de qualquer acesso ao banco.
  const h = await headers();
  const auth = await getAuth();
  const session = await auth.api.getSession({ headers: h });
  return session?.user ?? null;
}

/** Usuário autenticado ou redireciona para o login. O id vem sempre da sessão, nunca do cliente. */
export async function requireUser() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return user;
}

export async function appCtx(): Promise<Ctx> {
  return { db: await getDb(), now: () => new Date() };
}
