import { and, eq, inArray, isNotNull, lte, or, sql } from "drizzle-orm";
import { titleFor } from "@/domain/titles";
import { friendships, profiles, studySessions, xpTransactions } from "../db/schema";
import { AppError, type Ctx } from "./common";
import { periodStart, type RankingPeriod } from "./ranking";

export const MAX_FRIENDS = 500;

const pairWhere = (a: string, b: string) =>
  or(
    and(eq(friendships.requesterId, a), eq(friendships.addresseeId, b)),
    and(eq(friendships.requesterId, b), eq(friendships.addresseeId, a)),
  );

async function userByCode(ctx: Ctx, publicCode: string) {
  const [p] = await ctx.db
    .select({ userId: profiles.userId, displayName: profiles.displayName })
    .from(profiles)
    .where(eq(profiles.publicCode, publicCode.trim().toUpperCase()));
  if (!p) throw new AppError("Nenhuma conta com esse código.", "not_found");
  return p;
}

/** Amigos aceitos (ids). */
export async function friendIds(ctx: Ctx, userId: string) {
  const rows = await ctx.db
    .select({ a: friendships.requesterId, b: friendships.addresseeId })
    .from(friendships)
    .where(and(eq(friendships.status, "accepted"), or(eq(friendships.requesterId, userId), eq(friendships.addresseeId, userId))));
  return rows.map((r) => (r.a === userId ? r.b : r.a));
}

/**
 * Pede amizade pelo código público. Se a outra pessoa já tinha pedido, vira amizade na hora.
 */
export async function sendFriendRequest(ctx: Ctx, userId: string, publicCode: string) {
  const target = await userByCode(ctx, publicCode);
  if (target.userId === userId) throw new AppError("Esse é o seu próprio código.", "invalid");
  const [existing] = await ctx.db.select().from(friendships).where(pairWhere(userId, target.userId));
  if (existing) {
    if (existing.status === "pending" && existing.addresseeId === userId) {
      await ctx.db
        .update(friendships)
        .set({ status: "accepted", respondedAt: ctx.now() })
        .where(and(eq(friendships.requesterId, existing.requesterId), eq(friendships.addresseeId, userId)));
      return { status: "accepted" as const };
    }
    throw new AppError("Vocês já são amigos ou já existe um pedido.", "conflict");
  }
  if ((await friendIds(ctx, userId)).length >= MAX_FRIENDS) {
    throw new AppError(`Você já tem o máximo de ${MAX_FRIENDS} amigos.`, "conflict");
  }
  await ctx.db.insert(friendships).values({ requesterId: userId, addresseeId: target.userId, createdAt: ctx.now() });
  return { status: "pending" as const };
}

export async function respondFriendRequest(ctx: Ctx, userId: string, requesterCode: string, accept: boolean) {
  const requester = await userByCode(ctx, requesterCode);
  const where = and(
    eq(friendships.requesterId, requester.userId),
    eq(friendships.addresseeId, userId),
    eq(friendships.status, "pending"),
  );
  const [row] = await ctx.db.select().from(friendships).where(where);
  if (!row) throw new AppError("Pedido não encontrado.", "not_found");
  if (accept) await ctx.db.update(friendships).set({ status: "accepted", respondedAt: ctx.now() }).where(where);
  else await ctx.db.delete(friendships).where(where);
}

/** Desfaz a amizade ou cancela um pedido enviado. */
export async function removeFriend(ctx: Ctx, userId: string, otherCode: string) {
  const other = await userByCode(ctx, otherCode);
  await ctx.db.delete(friendships).where(pairWhere(userId, other.userId));
}

export async function listFriends(ctx: Ctx, userId: string) {
  const rows = await ctx.db
    .select()
    .from(friendships)
    .where(or(eq(friendships.requesterId, userId), eq(friendships.addresseeId, userId)));
  const others = rows.map((r) => (r.requesterId === userId ? r.addresseeId : r.requesterId));
  const people = others.length
    ? await ctx.db
        .select({ userId: profiles.userId, displayName: profiles.displayName, publicCode: profiles.publicCode })
        .from(profiles)
        .where(inArray(profiles.userId, others))
    : [];
  const who = (id: string) => {
    const p = people.find((x) => x.userId === id);
    return { displayName: p?.displayName ?? "—", publicCode: p?.publicCode ?? "" };
  };
  return {
    friends: rows.filter((r) => r.status === "accepted").map((r) => who(r.requesterId === userId ? r.addresseeId : r.requesterId)),
    incoming: rows.filter((r) => r.status === "pending" && r.addresseeId === userId).map((r) => who(r.requesterId)),
    outgoing: rows.filter((r) => r.status === "pending" && r.requesterId === userId).map((r) => who(r.addresseeId)),
  };
}

/**
 * Ranking entre amigos (você + amigos aceitos): XP do ranking acadêmico no período e horas de
 * foco na plataforma (todos os perfis). Livre, sem assinatura.
 */
export async function getFriendsRanking(ctx: Ctx, userId: string, period: RankingPeriod) {
  const ids = [userId, ...(await friendIds(ctx, userId))];
  const now = ctx.now();
  const start = periodStart(period, now);
  const xpWhere = [inArray(xpTransactions.userId, ids), eq(xpTransactions.ranked, true), lte(xpTransactions.createdAt, now)];
  if (start) xpWhere.push(sql`${xpTransactions.createdAt} >= ${start.toISOString()}::timestamptz`);
  const sesWhere = [inArray(studySessions.userId, ids), isNotNull(studySessions.endedAt), lte(studySessions.endedAt, now)];
  if (start) sesWhere.push(sql`${studySessions.endedAt} >= ${start.toISOString()}::timestamptz`);
  const [xp, secs, total, names] = await Promise.all([
    ctx.db
      .select({ userId: xpTransactions.userId, xp: sql<number>`coalesce(sum(${xpTransactions.amount}), 0)::int` })
      .from(xpTransactions)
      .where(and(...xpWhere))
      .groupBy(xpTransactions.userId),
    ctx.db
      .select({ userId: studySessions.userId, seconds: sql<number>`coalesce(sum(${studySessions.activeSeconds}), 0)::int` })
      .from(studySessions)
      .where(and(...sesWhere))
      .groupBy(studySessions.userId),
    ctx.db
      .select({ userId: studySessions.userId, seconds: sql<number>`coalesce(sum(${studySessions.activeSeconds}), 0)::int` })
      .from(studySessions)
      .where(and(inArray(studySessions.userId, ids), isNotNull(studySessions.endedAt)))
      .groupBy(studySessions.userId),
    ctx.db
      .select({ userId: profiles.userId, displayName: profiles.displayName, publicCode: profiles.publicCode })
      .from(profiles)
      .where(inArray(profiles.userId, ids)),
  ]);
  return ids
    .map((id) => ({
      displayName: names.find((n) => n.userId === id)?.displayName ?? "—",
      publicCode: names.find((n) => n.userId === id)?.publicCode ?? "",
      xp: Math.max(0, Number(xp.find((x) => x.userId === id)?.xp ?? 0)),
      platformSeconds: Number(secs.find((x) => x.userId === id)?.seconds ?? 0),
      title: titleFor(Number(total.find((x) => x.userId === id)?.seconds ?? 0)),
      isViewer: id === userId,
    }))
    .sort((a, b) => b.xp - a.xp || b.platformSeconds - a.platformSeconds || a.displayName.localeCompare(b.displayName))
    .map((r, i) => ({ ...r, position: i + 1 }));
}
