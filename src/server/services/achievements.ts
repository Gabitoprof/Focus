import { TZDate } from "@date-fns/tz";
import { and, eq, inArray, isNotNull, ne, or, sql } from "drizzle-orm";
import { ACHIEVEMENTS, SHOWCASE_MAX, evaluateAchievements, type AchievementMetric } from "@/domain/achievements";
import { computeStreaks, localDayKey, secondsByLocalDay } from "@/domain/time";
import {
  breaks,
  friendships,
  institutionMemberships,
  profiles,
  projectMembers,
  projects,
  sessionSegments,
  studySessions,
  topics,
} from "../db/schema";
import { AppError, getTimerSettings, type Ctx } from "./common";
import { notDeletedSession } from "./corrections";

/**
 * Conquistas da pessoa, com o progresso de cada uma. Calculadas sobre todos os perfis
 * (Pessoal, Acadêmico e Profissional), no fuso da pessoa.
 */
export async function getAchievements(ctx: Ctx, userId: string) {
  const now = ctx.now();
  const [profile] = await ctx.db.select({ tz: profiles.timezone }).from(profiles).where(eq(profiles.userId, userId));
  const tz = profile?.tz ?? "America/Sao_Paulo";
  const settings = await getTimerSettings(ctx.db);

  const [sessions, segs, cleanBreaks, linked, done, team, friends, membership] = await Promise.all([
    ctx.db
      .select({
        startedAt: studySessions.startedAt,
        methodId: studySessions.methodId,
        xp: studySessions.xpAwarded,
        completed: studySessions.completed,
        areaId: studySessions.areaId,
      })
      .from(studySessions)
      .where(and(eq(studySessions.userId, userId), isNotNull(studySessions.endedAt), notDeletedSession)),
    ctx.db
      .select({ start: sessionSegments.startedAt, end: sessionSegments.endedAt })
      .from(sessionSegments)
      .where(eq(sessionSegments.userId, userId)),
    ctx.db
      .select({ n: sql<number>`count(*)::int` })
      .from(breaks)
      .where(and(eq(breaks.userId, userId), eq(breaks.status, "finished"), eq(breaks.penaltyXp, 0))),
    ctx.db
      .select({ n: sql<number>`count(*)::int` })
      .from(topics)
      .where(and(eq(topics.userId, userId), isNotNull(topics.catalogTopicId), sql`${topics.deletedAt} is null`)),
    ctx.db
      .select({ n: sql<number>`count(*)::int` })
      .from(projects)
      .where(and(eq(projects.ownerUserId, userId), eq(projects.status, "done"), sql`${projects.deletedAt} is null`)),
    // Projetos (de qualquer pessoa) em que você participa junto com pelo menos mais alguém.
    ctx.db
      .select({ projectId: projectMembers.projectId })
      .from(projectMembers)
      .where(and(eq(projectMembers.userId, userId), eq(projectMembers.status, "active"))),
    ctx.db
      .select({ n: sql<number>`count(*)::int` })
      .from(friendships)
      .where(and(eq(friendships.status, "accepted"), or(eq(friendships.requesterId, userId), eq(friendships.addresseeId, userId)))),
    ctx.db
      .select({ n: sql<number>`count(*)::int` })
      .from(institutionMemberships)
      .where(and(eq(institutionMemberships.userId, userId), eq(institutionMemberships.status, "active"))),
  ]);

  let teamProjects = 0;
  if (team.length) {
    const ids = team.map((t) => t.projectId);
    const [r] = await ctx.db
      .select({ n: sql<number>`count(distinct ${projectMembers.projectId})::int` })
      .from(projectMembers)
      .where(
        and(inArray(projectMembers.projectId, ids), eq(projectMembers.status, "active"), ne(projectMembers.userId, userId)),
      );
    teamProjects = Number(r?.n ?? 0);
  }

  const intervals = segs.map((s) => ({ start: s.start, end: s.end ?? now }));
  const totalSeconds = intervals.reduce((a, i) => a + Math.max(0, (i.end.getTime() - i.start.getTime()) / 1000), 0);
  const perDay = secondsByLocalDay(intervals, tz);
  const streakDays = [...perDay].filter(([, sec]) => sec >= settings.streakMinMinutes * 60).map(([d]) => d);
  const streak = computeStreaks(streakDays, localDayKey(now, tz));

  const cycles = sessions.filter((s) => s.xp > 0);
  const cyclesPerDay = new Map<string, number>();
  for (const s of cycles) {
    const k = localDayKey(s.startedAt, tz);
    cyclesPerDay.set(k, (cyclesPerDay.get(k) ?? 0) + 1);
  }
  const hourOf = (d: Date) => new TZDate(d.getTime(), tz).getHours();

  const metrics: Record<AchievementMetric, number> = {
    sessions: sessions.length,
    cycles: cycles.length,
    longestStreak: streak.longest,
    totalHours: totalSeconds / 3600,
    dayCycles: Math.max(0, ...cyclesPerDay.values()),
    deepWork: sessions.filter((s) => s.methodId === "deep_work" && s.completed).length,
    pomodoroCycles: cycles.filter((s) => s.methodId === "pomodoro_classic").length,
    earlySession: sessions.some((s) => hourOf(s.startedAt) < 7) ? 1 : 0,
    lateSession: sessions.some((s) => hourOf(s.startedAt) >= 23) ? 1 : 0,
    cleanBreaks: Number(cleanBreaks[0]?.n ?? 0),
    areas: new Set(sessions.map((s) => s.areaId).filter(Boolean)).size,
    linkedTopics: Number(linked[0]?.n ?? 0),
    projectsDone: Number(done[0]?.n ?? 0),
    teamProjects,
    friends: Number(friends[0]?.n ?? 0),
    institution: Number(membership[0]?.n ?? 0) > 0 ? 1 : 0,
  };
  const list = evaluateAchievements(metrics);
  const [showcaseRow] = await ctx.db.select({ ids: profiles.showcaseAchievements }).from(profiles).where(eq(profiles.userId, userId));
  // Só entram na vitrine as que continuam conquistadas.
  const unlockedIds = new Set(list.filter((a) => a.unlocked).map((a) => a.id));
  const showcase = (showcaseRow?.ids ?? []).filter((id) => unlockedIds.has(id));
  return { list, unlocked: unlockedIds.size, total: list.length, showcase };
}

/**
 * Escolhe as conquistas da vitrine do ranking (até SHOWCASE_MAX, na ordem dada). Só aceita
 * conquistas que a pessoa já desbloqueou — conferido aqui, no servidor.
 */
export async function setShowcase(ctx: Ctx, userId: string, ids: string[]) {
  const unique = [...new Set(ids)];
  if (unique.length > SHOWCASE_MAX) throw new AppError(`Escolha no máximo ${SHOWCASE_MAX} conquistas.`);
  if (unique.some((id) => !ACHIEVEMENTS.some((a) => a.id === id))) throw new AppError("Conquista inválida.");
  const { list } = await getAchievements(ctx, userId);
  const unlocked = new Set(list.filter((a) => a.unlocked).map((a) => a.id));
  if (unique.some((id) => !unlocked.has(id))) throw new AppError("Só dá para exibir conquistas que você já desbloqueou.");
  await ctx.db.update(profiles).set({ showcaseAchievements: unique }).where(eq(profiles.userId, userId));
  return unique;
}
