import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { nextCookies } from "better-auth/next-js";
import { getDb, type DB } from "../db";
import * as schema from "../db/schema";
import { sendMail } from "../mail";
import { ensureProfile } from "../services/profile";

function createAuth(db: DB) {
  return betterAuth({
    appName: "Focus",
    baseURL: process.env.BETTER_AUTH_URL,
    secret: process.env.BETTER_AUTH_SECRET,
    database: drizzleAdapter(db, {
      provider: "pg",
      schema: { user: schema.user, session: schema.session, account: schema.account, verification: schema.verification },
    }),
    emailAndPassword: {
      enabled: true,
      minPasswordLength: 8,
      maxPasswordLength: 128,
      revokeSessionsOnPasswordReset: true,
      sendResetPassword: async ({ user, url }) => {
        await sendMail({
          to: user.email,
          subject: "Redefinição de senha — Focus",
          text: `Olá, ${user.name}!\n\nPara criar uma nova senha, acesse: ${url}\n\nSe você não pediu a redefinição, ignore esta mensagem.`,
        });
      },
    },
    session: {
      expiresIn: 60 * 60 * 24 * 30,
      updateAge: 60 * 60 * 24,
    },
    databaseHooks: {
      user: {
        create: {
          after: async (user) => {
            await ensureProfile(db, user.id, user.name);
          },
        },
      },
    },
    plugins: [nextCookies()],
  });
}

export type Auth = ReturnType<typeof createAuth>;

const globalForAuth = globalThis as unknown as { __focusAuth?: Promise<Auth> };

/** Instância única do Better Auth (o banco é inicializado de forma assíncrona). */
export function getAuth(): Promise<Auth> {
  globalForAuth.__focusAuth ??= getDb().then(createAuth);
  return globalForAuth.__focusAuth;
}
