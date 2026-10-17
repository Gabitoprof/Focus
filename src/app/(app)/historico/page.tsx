import type { Metadata } from "next";
import { getI18n } from "@/i18n/server";
import Link from "next/link";
import { Suspense } from "react";
import { Card, PageHeader, Skeleton, cx } from "@/components/ui";
import { formatClock, formatDuration } from "@/domain/time";
import { INTL_LOCALE } from "@/i18n";
import { appCtx, requireUser } from "@/server/auth/session";
import { listCategories } from "@/server/services/categories";
import { getActiveContext, getProfile } from "@/server/services/profile";
import { listSessions } from "@/server/services/stats";
import { listXpTransactions } from "@/server/services/xp";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getI18n()).t.meta.titles.history };
}

const PAGE = 30;

export default async function HistoryPage(props: PageProps<"/historico">) {
  const { t } = await getI18n();
  return (
    <>
      <PageHeader title={t.history.title} description={t.history.description} />
      <Suspense fallback={<Skeleton className="h-96" />}>
        <Content searchParams={props.searchParams} />
      </Suspense>
    </>
  );
}

async function Content({ searchParams }: { searchParams: PageProps<"/historico">["searchParams"] }) {
  const user = await requireUser();
  const ctx = await appCtx();
  const { locale, t: d } = await getI18n();
  const H = d.history;
  const endReasons: Record<string, string> = { heartbeat_timeout: H.autoHeartbeat, pause_timeout: H.autoPause };
  const sp = await searchParams;
  const categoryId = typeof sp.categoria === "string" ? sp.categoria : undefined;
  const page = Math.max(1, Number(sp.pagina) || 1);
  const context = await getActiveContext(ctx, user.id);
  const [profile, cats, sessions, xp] = await Promise.all([
    getProfile(ctx, user.id),
    listCategories(ctx, user.id, context),
    listSessions(ctx, user.id, {
      context,
      categoryId: safeUuid(categoryId),
      limit: PAGE + 1,
      offset: (page - 1) * PAGE,
    }),
    listXpTransactions(ctx, user.id, 30),
  ]);
  const hasMore = sessions.length > PAGE;
  const dt = new Intl.DateTimeFormat(INTL_LOCALE[locale], { dateStyle: "short", timeStyle: "short", timeZone: profile.timezone });
  const qs = (p: number) => `/historico?${new URLSearchParams({ ...(categoryId ? { categoria: categoryId } : {}), pagina: String(p) })}`;

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
      <Card className="p-0">
        <div className="flex flex-wrap items-center gap-2 border-b border-border p-4">
          <h2 className="mr-auto font-semibold">{H.sessions}</h2>
          <Link href="/historico" className={cx("rounded-md px-2 py-1 text-sm", !categoryId ? "bg-accent-soft text-link" : "text-text-2")}>
            {H.all}
          </Link>
          {cats.map((c) => (
            <Link
              key={c.id}
              href={`/historico?categoria=${c.id}`}
              className={cx("rounded-md px-2 py-1 text-sm", categoryId === c.id ? "bg-accent-soft text-link" : "text-text-2")}
            >
              {c.name}
            </Link>
          ))}
        </div>
        {sessions.length === 0 ? (
          <p className="p-6 text-sm text-text-2">{H.empty}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-sm">
              <thead className="text-left text-xs text-text-2">
                <tr className="border-b border-border">
                  <th className="px-4 py-2 font-medium">{H.start}</th>
                  <th className="px-4 py-2 font-medium">{H.topic}</th>
                  <th className="px-4 py-2 font-medium">{H.method}</th>
                  <th className="px-4 py-2 text-right font-medium">{H.planned}</th>
                  <th className="px-4 py-2 text-right font-medium">{H.studied}</th>
                  <th className="px-4 py-2 text-right font-medium">{H.overtime}</th>
                  <th className="px-4 py-2 text-right font-medium">{H.paused}</th>
                  <th className="px-4 py-2 text-right font-medium">XP</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {sessions.slice(0, PAGE).map((s) => (
                  <tr key={s.id}>
                    <td className="whitespace-nowrap px-4 py-2 text-text-2 tabular">{dt.format(s.startedAt)}</td>
                    <td className="px-4 py-2">
                      <span className="flex items-center gap-2">
                        <span aria-hidden className="h-2 w-2 shrink-0 rounded-full" style={{ background: s.categoryColor }} />
                        <span>
                          {s.topicName}
                          <span className="block text-xs text-text-3">
                            {s.categoryName}
                            {s.endReason && endReasons[s.endReason] && ` · ${endReasons[s.endReason]}`}
                            {s.flagged && ` · ${H.flagged}`}
                            {s.correction === "trimmed" && ` · ${d.corrections.reduced}`}
                          </span>
                        </span>
                      </span>
                    </td>
                    <td className="px-4 py-2 text-text-2">{d.methods[s.methodId]?.name ?? s.methodName}</td>
                    <td className="px-4 py-2 text-right tabular">{formatDuration(s.plannedSeconds)}</td>
                    <td className="px-4 py-2 text-right tabular">{formatClock(s.activeSeconds)}</td>
                    <td className="px-4 py-2 text-right text-text-2 tabular">{s.overtimeSeconds ? formatClock(s.overtimeSeconds) : "—"}</td>
                    <td className="px-4 py-2 text-right text-text-2 tabular">{s.pausedSeconds ? formatClock(s.pausedSeconds) : "—"}</td>
                    <td className={cx("px-4 py-2 text-right font-medium tabular", s.xpAwarded ? "text-good" : "text-text-3")}>
                      {s.xpAwarded ? `+${s.xpAwarded}` : "0"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {(page > 1 || hasMore) && (
          <div className="flex justify-between border-t border-border p-3 text-sm">
            {page > 1 ? <Link href={qs(page - 1)} className="text-link">{H.newer}</Link> : <span />}
            {hasMore && <Link href={qs(page + 1)} className="text-link">{H.older}</Link>}
          </div>
        )}
      </Card>

      <Card className="p-0">
        <h2 className="border-b border-border p-4 font-semibold">{H.xpTitle}</h2>
        {xp.length === 0 ? (
          <p className="p-4 text-sm text-text-2">{H.xpEmpty}</p>
        ) : (
          <ul className="divide-y divide-border">
            {xp.map((x) => (
              <li key={x.id} className="flex items-start justify-between gap-3 px-4 py-2.5 text-sm">
                <div>
                  <p>{H.reasons[x.reason] ?? x.reason}</p>
                  <p className="text-xs text-text-3">{dt.format(x.createdAt)}</p>
                  {x.note && locale === "pt-BR" && <p className="text-xs text-text-3">{x.note}</p>}
                </div>
                <span className={cx("font-semibold tabular", x.amount > 0 ? "text-good" : x.amount < 0 ? "text-danger" : "text-text-3")}>
                  {x.amount > 0 ? `+${x.amount}` : x.amount}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}

/** Aceita apenas UUIDs como filtro; qualquer outra coisa é ignorada. */
function safeUuid(id?: string) {
  return id && /^[0-9a-f-]{36}$/i.test(id) ? id : undefined;
}
