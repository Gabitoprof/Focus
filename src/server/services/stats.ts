import { and, desc, eq, gt, gte, inArray, isNotNull, isNull, lt, lte, or, sql } from "drizzle-orm";
import {
  clippedSeconds,
  computeStreaks,
  localDayKey,
  resolveRange,
  secondsByLocalDay,
  weekRange,
  type Range,
  type RangeKey,
} from "@/domain/time";
import { projectKey, taskKey, type AppContext } from "@/domain/contexts";
import {
  breaks,
  categories,
  profiles,
  projects,
  projectTasks,
  sessionSegments,
  studyMethods,
  studySessions,
  topics,
} from "../db/schema";
import { getTimerSettings, secondsBetween, type Ctx } from "./common";
import { notDeletedSession } from "./corrections";
import { getTimerState } from "./timer";

/**
 * Segmentos de estudo que tocam o período. Segmentos ainda abertos (sessão em andamento)
 * contam até `now`, para o dashboard refletir o estudo ao vivo.
 */
async function segmentsInRange(ctx: Ctx, userId: string, range: Range, now: Date, context: AppContext) {
  const rows = await ctx.db
    .select({
      start: sessionSegments.startedAt,
      end: sessionSegments.endedAt,
      categoryId: studySessions.categoryId,
      topicId: studySessions.topicId,
      projectId: studySessions.projectId,
      taskId: studySessions.taskId,
    })
    .from(sessionSegments)
    .innerJoin(studySessions, eq(studySessions.id, sessionSegments.sessionId))
    .where(
      and(
        eq(sessionSegments.userId, userId),
        eq(studySessions.context, context),
        lt(sessionSegments.startedAt, range.end),
        or(isNull(sessionSegments.endedAt), gt(sessionSegments.endedAt, range.start)),
      ),
    );
  // Projetos entram no painel como "categoria" (o projeto) e "tema" (a tarefa, ou o projeto em geral).
  return rows.map((r) => ({
    start: r.start,
    end: r.end ?? now,
    categoryKey: r.projectId ? projectKey(r.projectId) : r.categoryId!,
    topicKey: r.projectId ? (r.taskId ? taskKey(r.taskId) : projectKey(r.projectId)) : r.topicId!,
  }));
}

async function studiedSeconds(ctx: Ctx, userId: string, range: Range, now: Date, context: AppContext) {
  const segs = await segmentsInRange(ctx, userId, range, now, context);
  return Math.floor(segs.reduce((acc, s) => acc + clippedSeconds(s.start, s.end, range), 0));
}

/**
 * Dashboard calculado a partir dos registros persistidos. A sessão em andamento entra ao vivo
 * (tempo estudado, excedente e pausa até agora). Intervalos nunca entram no tempo de estudo.
 */
export async function getDashboard(
  ctx: Ctx,
  userId: string,
  filter: { key: RangeKey; from?: string; to?: string },
  context: AppContext = "academic",
) {
  // Encerra sessões/intervalos abandonados antes de calcular e obtém a sessão em andamento.
  const timer = await getTimerState(ctx, userId);
  const now = ctx.now();
  const [profile] = await ctx.db.select().from(profiles).where(eq(profiles.userId, userId));
  const tz = profile?.timezone ?? "America/Sao_Paulo";
  const range = resolveRange(filter.key, tz, now, filter.from, filter.to);

  // Totais gerais (todo o histórico) das sessões encerradas.
  const [all] = await ctx.db
    .select({
      overtimeSeconds: sql<number>`coalesce(sum(${studySessions.overtimeSeconds}), 0)::int`,
      sessions: sql<number>`count(*)::int`,
      completedCycles: sql<number>`count(*) filter (where ${studySessions.xpAwarded} > 0)::int`,
    })
    .from(studySessions)
    .where(and(eq(studySessions.userId, userId), eq(studySessions.context, context), isNotNull(studySessions.endedAt), notDeletedSession));

  const [todaySeconds, weekSeconds, monthSeconds] = await Promise.all([
    studiedSeconds(ctx, userId, resolveRange("today", tz, now), now, context),
    studiedSeconds(ctx, userId, weekRange(tz, now), now, context),
    studiedSeconds(ctx, userId, resolveRange("month", tz, now), now, context),
  ]);

  // Sequência de dias (no fuso do usuário).
  const settings = await getTimerSettings(ctx.db);
  const allSegs = await ctx.db
    .select({ start: sessionSegments.startedAt, end: sessionSegments.endedAt })
    .from(sessionSegments)
    .innerJoin(studySessions, eq(studySessions.id, sessionSegments.sessionId))
    .where(and(eq(sessionSegments.userId, userId), eq(studySessions.context, context)));
  const allIntervals = allSegs.map((s) => ({ start: s.start, end: s.end ?? now }));
  const allTimeSeconds = Math.floor(
    allIntervals.reduce((acc, it) => acc + (it.end.getTime() - it.start.getTime()) / 1000, 0),
  );
  const perDayAll = secondsByLocalDay(allIntervals, tz);
  const streakDays = [...perDayAll].filter(([, sec]) => sec >= settings.streakMinMinutes * 60).map(([d]) => d);
  const streak = computeStreaks(streakDays, localDayKey(now, tz));

  // Período filtrado.
  const segs = await segmentsInRange(ctx, userId, range, now, context);
  const perDay = secondsByLocalDay(
    segs.map((s) => ({ start: s.start, end: s.end })),
    tz,
    range,
  );
  const byCategory = new Map<string, number>();
  const byTopic = new Map<string, number>();
  for (const s of segs) {
    const sec = clippedSeconds(s.start, s.end, range);
    byCategory.set(s.categoryKey, (byCategory.get(s.categoryKey) ?? 0) + sec);
    byTopic.set(s.topicKey, (byTopic.get(s.topicKey) ?? 0) + sec);
  }

  const plain = (keys: Iterable<string>) => [...keys].filter((k) => !k.includes(":"));
  const prefixed = (keys: Iterable<string>, prefix: string) =>
    [...keys].filter((k) => k.startsWith(prefix)).map((k) => k.slice(prefix.length));
  const catIds = plain(byCategory.keys());
  const topicIds = plain(byTopic.keys());
  const projectIds = [...new Set([...prefixed(byCategory.keys(), "p:"), ...prefixed(byTopic.keys(), "p:")])];
  const taskIds = prefixed(byTopic.keys(), "t:");
  const [catList, topicList, projectList, taskList] = await Promise.all([
    catIds.length
      ? ctx.db
          .select({ id: categories.id, name: categories.name, color: categories.color })
          .from(categories)
          .where(and(eq(categories.userId, userId), inArray(categories.id, catIds)))
      : [],
    topicIds.length
      ? ctx.db
          .select({ id: topics.id, name: topics.name, categoryId: topics.categoryId })
          .from(topics)
          .where(and(eq(topics.userId, userId), inArray(topics.id, topicIds)))
      : [],
    projectIds.length
      ? ctx.db
          .select({ id: projects.id, name: projects.name, color: projects.color })
          .from(projects)
          .where(inArray(projects.id, projectIds))
      : [],
    taskIds.length
      ? ctx.db
          .select({ id: projectTasks.id, name: projectTasks.title, projectId: projectTasks.projectId })
          .from(projectTasks)
          .where(inArray(projectTasks.id, taskIds))
      : [],
  ]);
  const catRows = [
    ...catList,
    ...projectList.filter((p) => byCategory.has(projectKey(p.id))).map((p) => ({ ...p, id: projectKey(p.id) })),
  ];
  const topicRows = [
    ...topicList.map((t) => ({ ...t, categoryId: t.categoryId as string })),
    ...projectList
      .filter((p) => byTopic.has(projectKey(p.id)))
      .map((p) => ({ id: projectKey(p.id), name: p.name, categoryId: projectKey(p.id) })),
    ...taskList.map((t) => ({ id: taskKey(t.id), name: t.name, categoryId: projectKey(t.projectId) })),
  ];

  // Sessões encerradas no período: planejado x efetivo x excedente.
  const [period] = await ctx.db
    .select({
      sessions: sql<number>`count(*)::int`,
      plannedSeconds: sql<number>`coalesce(sum(${studySessions.plannedSeconds}), 0)::int`,
      activeSeconds: sql<number>`coalesce(sum(${studySessions.activeSeconds}), 0)::int`,
      overtimeSeconds: sql<number>`coalesce(sum(${studySessions.overtimeSeconds}), 0)::int`,
      pausedSeconds: sql<number>`coalesce(sum(${studySessions.pausedSeconds}), 0)::int`,
      pausedSessions: sql<number>`count(*) filter (where ${studySessions.pausedSeconds} > 0)::int`,
      completedCycles: sql<number>`count(*) filter (where ${studySessions.xpAwarded} > 0)::int`,
      xp: sql<number>`coalesce(sum(${studySessions.xpAwarded}), 0)::int`,
    })
    .from(studySessions)
    .where(
      and(
        eq(studySessions.userId, userId),
        eq(studySessions.context, context),
        gte(studySessions.endedAt, range.start),
        lte(studySessions.endedAt, range.end),
        notDeletedSession,
      ),
    );
  const [breakStats] = await ctx.db
    .select({
      count: sql<number>`count(*)::int`,
      seconds: sql<number>`coalesce(sum(extract(epoch from (${breaks.endedAt} - ${breaks.startedAt}))), 0)::int`,
      penalties: sql<number>`count(*) filter (where ${breaks.penaltyXp} > 0)::int`,
      penaltyXp: sql<number>`coalesce(sum(${breaks.penaltyXp}), 0)::int`,
    })
    .from(breaks)
    .innerJoin(studySessions, eq(studySessions.id, breaks.sessionId))
    .where(
      and(
        eq(breaks.userId, userId),
        eq(studySessions.context, context),
        gte(breaks.endedAt, range.start),
        lte(breaks.endedAt, range.end),
      ),
    );

  // Sessão em andamento: estudado, excedente e pausa até agora (entra no período se "agora" está nele).
  let live: null | {
    status: "running" | "paused";
    topicName: string;
    categoryName: string;
    plannedSeconds: number;
    activeSeconds: number;
    overtimeSeconds: number;
    pausedSeconds: number;
  } = null;
  if (timer.session && timer.session.context === context) {
    const ts = timer.session;
    const openSeconds = ts.openSegmentStartedAt ? secondsBetween(new Date(ts.openSegmentStartedAt), now) : 0;
    const activeSeconds = ts.closedActiveSeconds + openSeconds;
    live = {
      status: ts.status,
      topicName: ts.topic.name,
      categoryName: ts.category.name,
      plannedSeconds: ts.plannedSeconds,
      activeSeconds,
      overtimeSeconds: Math.max(0, activeSeconds - ts.plannedSeconds),
      pausedSeconds: Math.max(0, secondsBetween(new Date(ts.startedAt), now) - activeSeconds),
    };
  }
  const liveInRange = live && now >= range.start && now <= range.end ? live : null;

  return {
    timezone: tz,
    live,
    range: { key: filter.key, start: range.start.toISOString(), end: range.end.toISOString() },
    totals: {
      allTimeSeconds,
      allTimeOvertimeSeconds: Number(all.overtimeSeconds) + (live?.overtimeSeconds ?? 0),
      sessions: Number(all.sessions),
      completedCycles: Number(all.completedCycles),
      todaySeconds,
      weekSeconds,
      monthSeconds,
      xpBalance: profile?.xpBalance ?? 0,
      currentStreak: streak.current,
      longestStreak: streak.longest,
    },
    period: {
      studiedSeconds: Math.floor([...perDay.values()].reduce((a, b) => a + b, 0)),
      sessions: Number(period.sessions),
      plannedSeconds: Number(period.plannedSeconds) + (liveInRange?.plannedSeconds ?? 0),
      activeSeconds: Number(period.activeSeconds) + (liveInRange?.activeSeconds ?? 0),
      overtimeSeconds: Number(period.overtimeSeconds) + (liveInRange?.overtimeSeconds ?? 0),
      pausedSeconds: Number(period.pausedSeconds) + (liveInRange?.pausedSeconds ?? 0),
      pausedSessions: Number(period.pausedSessions) + (liveInRange && liveInRange.pausedSeconds > 0 ? 1 : 0),
      completedCycles: Number(period.completedCycles),
      xp: Number(period.xp),
      breaks: {
        count: Number(breakStats.count),
        seconds: Number(breakStats.seconds),
        penalties: Number(breakStats.penalties),
        penaltyXp: Number(breakStats.penaltyXp),
      },
    },
    perDay: [...perDay.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([day, seconds]) => ({ day, seconds })),
    byCategory: catRows
      .map((c) => ({ ...c, seconds: Math.floor(byCategory.get(c.id) ?? 0) }))
      .sort((a, b) => b.seconds - a.seconds),
    byTopic: topicRows
      .map((t) => ({ ...t, seconds: Math.floor(byTopic.get(t.id) ?? 0) }))
      .sort((a, b) => b.seconds - a.seconds),
  };
}

export type Dashboard = Awaited<ReturnType<typeof getDashboard>>;

/** Histórico de sessões do próprio usuário. */
export async function listSessions(
  ctx: Ctx,
  userId: string,
  opts: { categoryId?: string; topicId?: string; context?: AppContext; limit?: number; offset?: number } = {},
) {
  const where = [eq(studySessions.userId, userId), isNotNull(studySessions.endedAt), notDeletedSession];
  if (opts.context) where.push(eq(studySessions.context, opts.context));
  if (opts.categoryId) where.push(eq(studySessions.categoryId, opts.categoryId));
  if (opts.topicId) where.push(eq(studySessions.topicId, opts.topicId));
  return ctx.db
    .select({
      id: studySessions.id,
      startedAt: studySessions.startedAt,
      endedAt: studySessions.endedAt,
      status: studySessions.status,
      plannedSeconds: studySessions.plannedSeconds,
      activeSeconds: studySessions.activeSeconds,
      overtimeSeconds: studySessions.overtimeSeconds,
      pausedSeconds: studySessions.pausedSeconds,
      completed: studySessions.completed,
      xpAwarded: studySessions.xpAwarded,
      endReason: studySessions.endReason,
      flagged: studySessions.flagged,
      correction: studySessions.correction,
      originalActiveSeconds: studySessions.originalActiveSeconds,
      topicName: sql<string>`coalesce(${topics.name}, ${projectTasks.title}, ${projects.name})`,
      categoryName: sql<string>`coalesce(${categories.name}, ${projects.name})`,
      categoryColor: sql<string>`coalesce(${categories.color}, ${projects.color})`,
      isProject: sql<boolean>`${studySessions.projectId} is not null`,
      methodId: studySessions.methodId,
      methodName: studyMethods.name,
    })
    .from(studySessions)
    .leftJoin(topics, eq(topics.id, studySessions.topicId))
    .leftJoin(categories, eq(categories.id, studySessions.categoryId))
    .leftJoin(projects, eq(projects.id, studySessions.projectId))
    .leftJoin(projectTasks, eq(projectTasks.id, studySessions.taskId))
    .innerJoin(studyMethods, eq(studyMethods.id, studySessions.methodId))
    .where(and(...where))
    .orderBy(desc(studySessions.startedAt))
    .limit(opts.limit ?? 50)
    .offset(opts.offset ?? 0);
}
