import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { AchievementIcon, hasAchievementIcon } from "@/components/achievement-icon";
import { Card, PageHeader, Skeleton, cx } from "@/components/ui";
import { formatDuration } from "@/domain/time";
import { compactNumber } from "@/domain/titles";
import type { Dict } from "@/i18n";
import { translateMessage } from "@/i18n/errors";
import { getI18n } from "@/i18n/server";
import { appCtx, requireUser } from "@/server/auth/session";
import { getAccess } from "@/server/services/entitlements";
import { getActiveContext, getProfile } from "@/server/services/profile";
import {
  getFilterOptions,
  getInstitutionsLeaderboard,
  getLeaderboard,
  type LeaderboardRow,
  type RankingPeriod,
  type RankingScope,
} from "@/server/services/ranking";
import { ContextRanking } from "./context-ranking";
import { FilterBar } from "./filter-bar";
import { PersonCard } from "./person-card";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getI18n()).t.meta.titles.ranking };
}

const SCOPES: Record<string, RankingScope> = { geral: "global", meu: "mine", filtro: "filter", instituicao: "institution" };
const PERIODS: Record<string, RankingPeriod> = { hoje: "day", semana: "week", mes: "month", sempre: "all" };
const SCOPE_KEYS = ["geral", "meu", "filtro", "instituicao", "instituicoes"] as const;
const PERIOD_KEYS = ["hoje", "semana", "mes", "sempre"] as const;

export default async function RankingPage(props: PageProps<"/ranking">) {
  const { t } = await getI18n();
  return (
    <>
      <PageHeader title={t.ranking.title} description={t.ranking.description} />
      <Suspense fallback={<Skeleton className="h-[520px]" />}>
        <Content searchParams={props.searchParams} />
      </Suspense>
    </>
  );
}

async function Content({ searchParams }: { searchParams: PageProps<"/ranking">["searchParams"] }) {
  const user = await requireUser();
  const ctx = await appCtx();
  const { locale, t: d } = await getI18n();
  const R = d.ranking;
  // Profissional: ranking da empresa fica em Organização; aqui, banco de horas e projetos.
  // Pessoal: ranking acadêmico geral (área Acadêmica) + banco de horas e projetos.
  const context = await getActiveContext(ctx, user.id);
  if (context === "professional") return <ContextRanking userId={user.id} context={context} />;
  const extra = context === "personal" ? <ContextRanking userId={user.id} context="personal" /> : null;
  const access = await getAccess(ctx, user.id, "ranking");
  if (!access.allowed) {
    return (
      <div className="space-y-8">
        <Paywall xp={(await getProfile(ctx, user.id)).xpBalance} d={d} />
        {extra}
      </div>
    );
  }

  const sp = await searchParams;
  const str = (k: string) => (typeof sp[k] === "string" ? (sp[k] as string) : undefined);
  const scopeKey = str("escopo") === "instituicoes" ? "instituicoes" : str("escopo") && SCOPES[str("escopo")!] ? str("escopo")! : "geral";
  const periodKey = str("periodo") && PERIODS[str("periodo")!] ? str("periodo")! : "semana";
  const uuid = (v?: string) => (v && /^[0-9a-f-]{36}$/i.test(v) ? v : undefined);
  const slug = (v?: string) => (v && /^[a-z_]{2,40}$/.test(v) ? v : undefined);
  const scope: RankingScope | undefined = SCOPES[scopeKey];
  const period = PERIODS[periodKey];
  const kindKey = str("tipo") === "escolas" ? "escolas" : "faculdades";
  const sortKey = str("ordem") === "total" ? "total" : "media";
  const areaId = scope === "filter" ? slug(str("area")) : undefined;
  const topicId = scope === "filter" ? uuid(str("tema")) : undefined;
  const methodId = slug(str("metodo"));
  const page = Math.max(1, Number(str("pagina")) || 1);

  const [board, rawOptions, institutionsBoard] = await Promise.all([
    scope
      ? getLeaderboard(ctx, user.id, { scope, period, areaId, topicId, methodId, page }).catch((e: Error) => ({
          status: "error" as const,
          message: translateMessage(e.message, locale),
        }))
      : null,
    getFilterOptions(ctx, user.id, period, methodId),
    scope
      ? null
      : getInstitutionsLeaderboard(ctx, user.id, {
          kind: kindKey === "escolas" ? "school" : "higher",
          period,
          methodId,
          sort: sortKey === "total" ? "total" : "average",
        }),
  ]);
  // Nomes de áreas e métodos no idioma do usuário (temas do catálogo mantêm o nome oficial).
  const options = {
    ...rawOptions,
    areas: rawOptions.areas.map((a) => ({ ...a, name: d.areas[a.id] ?? a.name })),
    methods: rawOptions.methods.map((m) => ({ ...m, name: d.methods[m.id]?.name ?? m.name })),
  };

  // Título do recorte no idioma do usuário.
  const title = (serverTitle: string) => {
    if (scope === "global") return [R.titleGlobal, methodId && d.methods[methodId]?.name].filter(Boolean).join(" · ");
    if (scope === "mine") return [R.titleMine, methodId && d.methods[methodId]?.name].filter(Boolean).join(" · ");
    if (scope === "institution") return serverTitle;
    const topicName = topicId ? options.topics.find((x) => x.id === topicId)?.name : undefined;
    if (topicId && !topicName) return serverTitle;
    const parts = [areaId && (d.areas[areaId] ?? areaId), topicName, methodId && d.methods[methodId]?.name].filter(Boolean);
    return parts.length ? parts.join(" · ") : R.titleAll;
  };

  const query = (over: Record<string, string | undefined>) => {
    const p = new URLSearchParams();
    const merged = {
      escopo: scopeKey,
      periodo: periodKey,
      area: areaId,
      tema: topicId,
      metodo: methodId,
      tipo: scope ? undefined : kindKey,
      ...over,
    };
    for (const [k, v] of Object.entries(merged)) if (v) p.set(k, v);
    return `/ranking?${p}`;
  };

  return (
    <div className="space-y-5">
      {access.reason === "admin" && <p className="text-xs text-text-3">{R.adminNote}</p>}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <nav aria-label={R.scopeGroup} className="flex flex-wrap rounded-3xl border border-border p-1">
          {SCOPE_KEYS.map((k) => (
            <Link
              key={k}
              href={query({ escopo: k, area: undefined, tema: undefined, pagina: undefined })}
              aria-current={scopeKey === k ? "page" : undefined}
              className={cx(
                "rounded-full px-4 py-1.5 text-sm font-medium",
                scopeKey === k ? "bg-accent text-accent-ink" : "text-text-2 hover:text-text",
              )}
            >
              {R.scopes[k]}
            </Link>
          ))}
        </nav>
        <nav aria-label={R.periodGroup} className="flex gap-1 text-sm">
          {PERIOD_KEYS.map((k) => (
            <Link
              key={k}
              href={query({ periodo: k, pagina: undefined })}
              aria-current={periodKey === k ? "page" : undefined}
              className={cx(
                "rounded-full px-3 py-1.5",
                periodKey === k ? "bg-accent-soft font-medium text-link" : "text-text-2 hover:text-text",
              )}
            >
              {R.periods[k]}
            </Link>
          ))}
        </nav>
      </div>

      {scope !== "global" && (
        <FilterBar
          scope={scopeKey}
          options={options}
          value={{ areaId, topicId, methodId }}
          base={{ escopo: scopeKey, periodo: periodKey, ...(scope ? {} : { tipo: kindKey }) }}
        />
      )}
      {scope === "global" && <p className="text-sm text-text-2">{R.globalNote}</p>}

      {board && <Board board={board} title={title} d={d} locale={locale} pageHref={(p) => query({ pagina: String(p) })} />}
      {institutionsBoard && (
        <InstitutionsBoard
          data={institutionsBoard}
          d={d}
          locale={locale}
          kindKey={kindKey}
          kindHref={(k) => query({ tipo: k, pagina: undefined })}
          sortKey={sortKey}
          sortHref={(k) => query({ ordem: k === "total" ? "total" : undefined })}
        />
      )}
      {extra}
    </div>
  );
}

function Board({
  locale,
  board,
  title,
  d,
  pageHref,
}: {
  locale: string;
  board: Awaited<ReturnType<typeof getLeaderboard>> | { status: "error"; message: string };
  title: (serverTitle: string) => string;
  d: Dict;
  pageHref: (p: number) => string;
}) {
  const R = d.ranking;
  if (board.status === "error") return <Card className="text-sm text-danger">{board.message}</Card>;
  if (board.status === "needs_institution") {
    return (
      <Card className="text-center">
        <p className="font-medium">{R.needInstitutionTitle}</p>
        <p className="mt-1 text-sm text-text-2">{R.needInstitutionText}</p>
        <Link href="/perfil" className="mt-4 inline-flex h-10 items-center rounded-full bg-accent px-5 text-sm font-medium text-accent-ink">
          {R.needInstitutionCta}
        </Link>
      </Card>
    );
  }
  if (board.status === "needs_tags") {
    return (
      <Card className="text-center">
        <p className="font-medium">{R.needTagsTitle}</p>
        <p className="mt-1 text-sm text-text-2">{R.needTagsText}</p>
        <Link href="/perfil" className="mt-4 inline-flex h-10 items-center rounded-full bg-accent px-5 text-sm font-medium text-accent-ink">
          {R.needTagsCta}
        </Link>
      </Card>
    );
  }
  if (board.status === "insufficient") {
    return (
      <Card className="text-center">
        <p className="font-medium">{title(board.title)}</p>
        <p className="mt-1 text-sm text-text-2">{R.insufficient(board.participants, board.minParticipants)}</p>
      </Card>
    );
  }
  const viewerOutside = board.viewer && !board.rows.some((r) => r.isViewer);
  return (
    <Card className="p-0">
      <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-border px-5 py-4">
        <h2 className="font-semibold">{title(board.title)}</h2>
        <p className="text-sm text-text-2">
          {R.participants(board.participants)}
          {board.viewer ? R.youAre(board.viewer.position) : R.youNotYet}
        </p>
      </div>
      {board.rows.length === 0 ? (
        <p className="p-6 text-sm text-text-2">{R.nobody}</p>
      ) : (
        <table className="w-full text-sm">
          <thead className="text-left text-xs text-text-2">
            <tr className="border-b border-border">
              <th className="w-16 px-5 py-2 font-medium">#</th>
              <th className="px-2 py-2 font-medium">{R.colStudent}</th>
              <th className="hidden px-2 py-2 font-medium md:table-cell">{d.achievements.showcase.column}</th>
              <th className="hidden px-2 py-2 text-right font-medium lg:table-cell">{R.colPlatform}</th>
              <th className="hidden px-2 py-2 text-right font-medium sm:table-cell">{R.colProfile}</th>
              <th className="px-2 py-2 text-right font-medium">XP</th>
              <th className="w-16 px-5 py-2 text-right font-medium">
                <span className="sr-only">{R.col24h}</span>24h
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {board.rows.map((r) => (
              <Row key={r.position} r={r} d={d} locale={locale} />
            ))}
            {viewerOutside && (
              <>
                <tr aria-hidden>
                  <td colSpan={7} className="px-5 py-1 text-center text-xs text-text-3">
                    ⋯
                  </td>
                </tr>
                <Row r={board.viewer!} d={d} locale={locale} />
              </>
            )}
          </tbody>
        </table>
      )}
      {board.pageCount > 1 && (
        <div className="flex justify-between border-t border-border px-5 py-3 text-sm">
          {board.page > 1 ? (
            <Link href={pageHref(board.page - 1)} className="text-link">
              {d.common.previous}
            </Link>
          ) : (
            <span />
          )}
          <span className="text-text-3">{d.common.page(board.page, board.pageCount)}</span>
          {board.page < board.pageCount ? (
            <Link href={pageHref(board.page + 1)} className="text-link">
              {d.common.next}
            </Link>
          ) : (
            <span />
          )}
        </div>
      )}
    </Card>
  );
}

function Row({ r, d, locale }: { r: LeaderboardRow; d: Dict; locale: string }) {
  const R = d.ranking;
  const goals = r.goals.map((g) => d.goals[g]).filter(Boolean);
  return (
    <tr className={cx(r.isViewer && "bg-accent-soft")}>
      <td className={cx("px-5 py-2.5 font-semibold tabular", r.position <= 3 ? "text-link" : "text-text-2")}>{R.position(r.position)}</td>
      <td className="px-2 py-2.5">
        <PersonCard
          name={r.displayName}
          publicCode={r.publicCode}
          isViewer={r.isViewer}
          details={{
            title: R.titles[r.title],
            institution: r.institution ? (r.institution.acronym ?? r.institution.name) : R.noLink,
            hours: formatDuration(r.platformSeconds),
            goals,
          }}
        />
        {r.isViewer && <span className="ml-2 text-xs text-link">{d.common.you}</span>}
        <span className="ml-2 rounded-full bg-accent-soft px-2 py-0.5 text-[11px] font-medium text-link">{R.titles[r.title]}</span>
        <span className="mt-0.5 block text-xs text-text-3">
          {r.institution ? (r.institution.acronym ?? r.institution.name) : R.noLink}
          {r.institution?.pending && <span className="text-warn"> · {R.pendingLink}</span>}
          {goals.length > 0 && <span className="hidden md:inline"> · {goals.join(" · ")}</span>}
        </span>
      </td>
      <td className="hidden px-2 py-2.5 md:table-cell">
        {r.showcase.length > 0 ? (
          <ul className="flex items-center gap-1.5" aria-label={d.achievements.showcase.column}>
            {r.showcase
              .filter((id) => hasAchievementIcon("achievements", id))
              .map((id) => {
                const name = d.achievements.items[id]?.name ?? id;
                return (
                  <li key={id}>
                    <AchievementIcon id={id} alt={name} title={name} size={28} />
                  </li>
                );
              })}
          </ul>
        ) : (
          <span className="text-xs text-text-3">—</span>
        )}
      </td>
      <td className="hidden px-2 py-2.5 text-right text-text-2 tabular lg:table-cell">{formatDuration(r.platformSeconds)}</td>
      <td className="hidden px-2 py-2.5 text-right text-text-2 tabular sm:table-cell">{formatDuration(r.studiedSeconds)}</td>
      <td className="px-2 py-2.5 text-right font-semibold tabular" title={String(r.xp)}>
        {compactNumber(r.xp, locale)}
      </td>
      <td className="px-5 py-2.5 text-right text-xs tabular">
        {r.change == null ? (
          <span className="text-text-3">{R.newEntry}</span>
        ) : r.change > 0 ? (
          <span className="text-good" aria-label={R.up(r.change)}>
            ▲{r.change}
          </span>
        ) : r.change < 0 ? (
          <span className="text-danger" aria-label={R.down(-r.change)}>
            ▼{-r.change}
          </span>
        ) : (
          <span className="text-text-3" aria-label={R.same}>
            –
          </span>
        )}
      </td>
    </tr>
  );
}

/** Usuário gratuito: explica o recurso sem expor dados de outros participantes. */
function Paywall({ xp, d }: { xp: number; d: Dict }) {
  const R = d.ranking;
  return (
    <div className="theme-black overflow-hidden rounded-2xl p-8 sm:p-12">
      <p className="text-sm font-medium text-link">{R.paywallBadge}</p>
      <h2 className="mt-2 max-w-xl text-3xl font-semibold tracking-tight sm:text-4xl">{R.paywallTitle}</h2>
      <ul className="mt-6 space-y-2 text-text-2">
        {R.paywallItems.map((item) => (
          <li key={item}>• {item}</li>
        ))}
      </ul>
      <p className="mt-6 text-sm text-text-2">{R.paywallXp(xp)}</p>
      <p className="mt-8 inline-flex h-11 items-center rounded-full bg-accent px-6 text-sm font-medium text-accent-ink">{R.paywallSoon}</p>
    </div>
  );
}

function InstitutionsBoard({
  data,
  d,
  locale,
  kindKey,
  kindHref,
  sortKey,
  sortHref,
}: {
  data: Awaited<ReturnType<typeof getInstitutionsLeaderboard>>;
  d: Dict;
  locale: string;
  kindKey: "faculdades" | "escolas";
  kindHref: (k: "faculdades" | "escolas") => string;
  sortKey: "media" | "total";
  sortHref: (k: "media" | "total") => string;
}) {
  const I = d.ranking.institutions;
  const mine = data.viewerInstitution;
  return (
    <Card className="p-0">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-5 py-4">
        <div>
          <h2 className="font-semibold">{I.title(kindKey === "escolas")}</h2>
          <p className="text-xs text-text-2">{sortKey === "total" ? I.ruleTotal(data.minActive) : I.rule(data.minActive)}</p>
        </div>
        <nav aria-label={I.sortGroup} className="flex gap-1 text-sm">
          {(["media", "total"] as const).map((k) => (
            <Link
              key={k}
              href={sortHref(k)}
              aria-current={sortKey === k ? "page" : undefined}
              className={cx("rounded-full px-3 py-1.5", sortKey === k ? "bg-accent-soft font-medium text-link" : "text-text-2 hover:text-text")}
            >
              {k === "media" ? I.sortAverage : I.sortTotal}
            </Link>
          ))}
        </nav>
        <nav aria-label={I.kindGroup} className="flex gap-1 text-sm">
          {(["faculdades", "escolas"] as const).map((k) => (
            <Link
              key={k}
              href={kindHref(k)}
              aria-current={kindKey === k ? "page" : undefined}
              className={cx("rounded-full px-3 py-1.5", kindKey === k ? "bg-accent-soft font-medium text-link" : "text-text-2 hover:text-text")}
            >
              {k === "faculdades" ? I.higher : I.schools}
            </Link>
          ))}
        </nav>
      </div>
      {mine && !mine.standing && (
        <p className="border-b border-border bg-accent-soft px-5 py-2 text-sm">
          {I.missing(mine.name, mine.activeMembers, Math.max(0, data.minActive - mine.activeMembers))}
        </p>
      )}
      {data.rows.length === 0 ? (
        <p className="p-6 text-sm text-text-2">{I.empty}</p>
      ) : (
        <table className="w-full text-sm">
          <thead className="text-left text-xs text-text-2">
            <tr className="border-b border-border">
              <th className="w-16 px-5 py-2 font-medium">#</th>
              <th className="px-2 py-2 font-medium">{I.colInstitution}</th>
              <th className="px-2 py-2 text-right font-medium">{I.colActive}</th>
              <th className="hidden px-2 py-2 text-right font-medium md:table-cell">{I.colAvgHours}</th>
              <th className="hidden px-2 py-2 text-right font-medium sm:table-cell">{I.colTotalHours}</th>
              <th className="hidden px-2 py-2 text-right font-medium sm:table-cell">{I.colTotalXp}</th>
              <th className="px-5 py-2 text-right font-medium">{I.colAverage}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {data.rows.map((r) => (
              <tr key={r.position} className={cx(r.isViewerInstitution && "bg-accent-soft")}>
                <td className={cx("px-5 py-2.5 font-semibold tabular", r.position <= 3 ? "text-link" : "text-text-2")}>
                  {d.ranking.position(r.position)}
                </td>
                <td className="px-2 py-2.5">
                  <Link href={`/instituicoes/${r.institutionId}`} className="font-medium hover:underline">
                    {r.acronym ?? r.name}
                  </Link>
                  {(r.medals.gold > 0 || r.medals.silver > 0 || r.medals.bronze > 0) && (
                    <span className="ml-2 text-xs tabular" title={I.medalsTitle}>
                      {r.medals.gold > 0 && `🥇${r.medals.gold} `}
                      {r.medals.silver > 0 && `🥈${r.medals.silver} `}
                      {r.medals.bronze > 0 && `🥉${r.medals.bronze}`}
                    </span>
                  )}
                  {r.acronym && <span className="ml-2 hidden text-xs text-text-3 md:inline">{r.name}</span>}
                  <span className="block text-xs text-text-3">{[r.city, r.uf].filter(Boolean).join("/")}</span>
                </td>
                <td className="px-2 py-2.5 text-right text-text-2 tabular">{r.activeMembers}</td>
                <td className="hidden px-2 py-2.5 text-right text-text-2 tabular md:table-cell">{formatDuration(r.averageSeconds)}</td>
                <td className="hidden px-2 py-2.5 text-right text-text-2 tabular sm:table-cell">{formatDuration(r.totalSeconds)}</td>
                <td className={cx("hidden px-2 py-2.5 text-right tabular sm:table-cell", sortKey === "total" ? "font-semibold" : "text-text-2")}>
                  {compactNumber(r.totalXp, locale)}
                </td>
                <td className={cx("px-5 py-2.5 text-right tabular", sortKey === "media" ? "font-semibold" : "text-text-2")}>{r.averageXp}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </Card>
  );
}
