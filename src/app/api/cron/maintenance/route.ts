import { appCtx } from "@/server/auth/session";
import { sweepAllStale } from "@/server/services/timer";

/**
 * Encerra sessões e intervalos abandonados. Agende em produção (ex.: Vercel Cron a cada 10 min)
 * com o cabeçalho Authorization: Bearer $CRON_SECRET.
 */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) {
    return new Response("Unauthorized", { status: 401 });
  }
  const users = await sweepAllStale(await appCtx());
  return Response.json({ ok: true, usersChecked: users });
}
