"use client";

import { useId, useMemo, useState, useTransition } from "react";
import { linkTopicAction } from "@/app/actions/catalog";
import {
  archiveCategoryAction,
  archiveTopicAction,
  createCategoryAction,
  setCategoryUsageAction,
  createTopicAction,
  deleteCategoryAction,
  deleteTopicAction,
  makeCategoryPersonalAction,
  updateCategoryAction,
  updateTopicAction,
} from "@/app/actions/categories";
import type { ActionResult } from "@/app/actions/result";
import { Alert, Button, CATEGORY_COLORS, Input, Select, cx } from "@/components/ui";
import { useConfirm } from "@/components/confirm";
import { normalizeTerm } from "@/domain/catalog";
import { USAGES, type AppContext, type Usage } from "@/domain/contexts";
import { formatDuration } from "@/domain/time";
import { useI18n } from "@/i18n/client";

type Area = { id: string; name: string };
type CatalogTopic = { id: string; name: string; areaId: string | null; levels: string[]; courses: string[] };
const LEVELS = ["escola", "vestibular", "faculdade"] as const;
type Topic = {
  id: string;
  name: string;
  archived: boolean;
  totalSeconds: number;
  sessions: number;
  catalogTopic: { id: string; name: string; areaId: string | null } | null;
};
type Category = {
  id: string;
  name: string;
  color: string;
  areaId: string | null;
  context: AppContext;
  /** Área de utilização (no perfil Pessoal: pessoal, profissional ou acadêmica). */
  usage: Usage;
  /** Pode entrar no ranking acadêmico geral. */
  ranked: boolean;
  archived: boolean;
  totalSeconds: number;
  topics: Topic[];
};
type Run = (fn: () => Promise<ActionResult<unknown>>, after?: () => void) => void;

export function CategoryManager({
  context,
  categories,
  areas,
  catalog,
}: {
  context: AppContext;
  categories: Category[];
  areas: Area[];
  catalog: CatalogTopic[];
}) {
  const academic = context === "academic";
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [showArchived, setShowArchived] = useState(false);
  const [newName, setNewName] = useState("");
  const [newUsage, setNewUsage] = useState<Usage>("academic");

  const { t: d } = useI18n();
  const L = d.categories;
  const run: Run = (fn, after) =>
    start(async () => {
      const res = await fn();
      if (!res.ok) setError(res.error);
      else {
        setError(null);
        after?.();
      }
    });

  const visible = categories.filter((c) => showArchived || !c.archived);
  const nextColor = CATEGORY_COLORS[categories.length % CATEGORY_COLORS.length];

  return (
    <div className="space-y-4">
      <form
        className={cx(
          "grid gap-2 rounded-xl border border-border bg-surface p-4",
          context === "personal" ? "sm:grid-cols-[1fr_200px_auto]" : "sm:grid-cols-[1fr_auto]",
        )}
        onSubmit={(e) => {
          e.preventDefault();
          if (!newName.trim()) return;
          run(
            () =>
              createCategoryAction({ name: newName, color: nextColor, usage: context === "personal" ? newUsage : null }),
            () => setNewName(""),
          );
        }}
      >
        <label htmlFor="new-cat" className="sr-only">
          {L.newLabel}
        </label>
        <Input
          id="new-cat"
          placeholder={L.newPlaceholder}
          value={newName}
          maxLength={80}
          onChange={(e) => setNewName(e.target.value)}
        />
        {context === "personal" && (
          <Select aria-label={L.usageLabel} value={newUsage} onChange={(e) => setNewUsage(e.target.value as Usage)}>
            {USAGES.map((u) => (
              <option key={u} value={u}>
                {L.usages[u]}
              </option>
            ))}
          </Select>
        )}
        <Button type="submit" disabled={pending || !newName.trim()} className="shrink-0">
          {L.add}
        </Button>
      </form>

      <p className="px-1 text-sm text-text-2">{academic ? L.areaFromTopics : L.contextNote[context]}</p>

      {error && <Alert>{error}</Alert>}

      <label className="flex items-center gap-2 text-sm text-text-2">
        <input type="checkbox" checked={showArchived} onChange={(e) => setShowArchived(e.target.checked)} />
        {L.showArchived}
      </label>

      {visible.length === 0 && (
        <div className="rounded-xl border border-dashed border-border p-8 text-center text-sm text-text-2">
          {L.empty}
        </div>
      )}

      {visible.map((c) => (
        <CategoryCard
          key={c.id}
          category={c}
          areas={areas}
          catalog={catalog}
          showArchived={showArchived}
          pending={pending}
          run={run}
        />
      ))}
    </div>
  );
}

function CategoryCard({
  category: c,
  areas,
  catalog,
  showArchived,
  pending,
  run,
}: {
  category: Category;
  areas: Area[];
  catalog: CatalogTopic[];
  showArchived: boolean;
  pending: boolean;
  run: Run;
}) {
  const [editing, setEditing] = useState(false);
  const confirm = useConfirm();
  const { t: d } = useI18n();
  const L = d.categories;
  const [name, setName] = useState(c.name);
  const [topicName, setTopicName] = useState("");
  const listId = useId();
  const topics = c.topics.filter((t) => showArchived || !t.archived);
  // Sugestões ao digitar um tema: primeiro os da área da categoria, depois os demais.
  // Áreas da categoria = áreas dos temas do catálogo vinculados a ela (nunca uma escolha solta).
  const topicAreas = useMemo(
    () => [...new Set(c.topics.map((t) => t.catalogTopic?.areaId).filter((a): a is string => Boolean(a)))],
    [c.topics],
  );
  // Sugestões ao digitar um tema: primeiro as das áreas que a categoria já tem.
  const suggestions = useMemo(
    () =>
      [...catalog].sort(
        (a, b) => Number(topicAreas.includes(b.areaId ?? "")) - Number(topicAreas.includes(a.areaId ?? "")),
      ),
    [catalog, topicAreas],
  );
  const [topicArea, setTopicArea] = useState("");
  const exact = catalog.find((t) => normalizeTerm(t.name) === normalizeTerm(topicName));

  return (
    <section className={cx("rounded-xl border border-border bg-surface", c.archived && "opacity-70")} aria-label={c.name}>
      <header className="flex flex-wrap items-center gap-3 border-b border-border p-4">
        <span aria-hidden className="h-3 w-3 shrink-0 rounded-full" style={{ background: c.color }} />
        {editing ? (
          <form
            className="flex flex-1 gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              run(() => updateCategoryAction(c.id, { name }), () => setEditing(false));
            }}
          >
            <Input aria-label={L.categoryName} value={name} maxLength={80} onChange={(e) => setName(e.target.value)} autoFocus />
            <Button size="sm" type="submit" disabled={pending}>
              {d.common.save}
            </Button>
            <Button size="sm" variant="ghost" type="button" onClick={() => setEditing(false)}>
              {d.common.cancel}
            </Button>
          </form>
        ) : (
          <div className="min-w-0 flex-1">
            <h2 className="flex flex-wrap items-center gap-2 font-semibold">
              <span className="truncate">{c.name}</span>
              {c.context === "personal" && (
                <span
                  className={cx(
                    "rounded-full px-2 py-0.5 text-[11px] font-medium",
                    c.ranked ? "bg-accent-soft text-link" : "bg-surface-2 text-text-2",
                  )}
                >
                  {L.usages[c.usage]}
                </span>
              )}
              {c.archived && <span className="text-xs font-normal text-text-3">{L.archived}</span>}
            </h2>
            <p className="text-xs text-text-2 tabular">{L.total(formatDuration(c.totalSeconds))}</p>
          </div>
        )}
        {!editing && (
          <div className="flex flex-wrap items-center gap-1">
            <ColorPicker value={c.color} onChange={(color) => run(() => updateCategoryAction(c.id, { color }))} />
            {c.context === "personal" && (
              <Select
                aria-label={L.usageLabel}
                className="h-8 w-auto text-xs"
                value={c.usage}
                disabled={pending}
                onChange={(e) => run(() => setCategoryUsageAction(c.id, e.target.value))}
              >
                {USAGES.map((u) => (
                  <option key={u} value={u}>
                    {L.usages[u]}
                  </option>
                ))}
              </Select>
            )}
            <Button size="sm" variant="ghost" onClick={() => setEditing(true)}>
              {d.common.rename}
            </Button>
            {c.context === "academic" && (
              <Button
                size="sm"
                variant="ghost"
                disabled={pending}
                onClick={async () => {
                  const ok = await confirm({
                    title: L.makePersonalTitle(c.name),
                    message: L.makePersonalText,
                    confirmLabel: L.makePersonal,
                    cancelLabel: d.common.cancel,
                  });
                  if (ok) run(() => makeCategoryPersonalAction(c.id));
                }}
              >
                {L.makePersonal}
              </Button>
            )}
            <Button size="sm" variant="ghost" disabled={pending} onClick={() => run(() => archiveCategoryAction(c.id, !c.archived))}>
              {c.archived ? d.common.restore : d.common.archive}
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="text-danger"
              disabled={pending}
              onClick={async () => {
                const ok = await confirm({
                  title: L.deleteTitle(c.name),
                  message: L.deleteText,
                  confirmLabel: d.common.delete,
                  cancelLabel: d.common.cancel,
                  danger: true,
                });
                if (ok) run(() => deleteCategoryAction(c.id));
              }}
            >
              {d.common.delete}
            </Button>
          </div>
        )}
        {c.ranked && (
          <div className="flex w-full flex-wrap items-center gap-1.5 text-xs">
            <span className="text-text-2">{L.areasLabel}</span>
            {topicAreas.length === 0 ? (
              <span className="text-text-3">{L.noAreasYet}</span>
            ) : (
              topicAreas.map((a) => (
                <span key={a} className="rounded-full bg-accent-soft px-2 py-0.5 font-medium text-link">
                  {areas.find((x) => x.id === a)?.name ?? a}
                </span>
              ))
            )}
          </div>
        )}
      </header>

      <ul className="divide-y divide-border">
        {topics.map((t) => (
          <TopicRow key={t.id} topic={t} personal={!c.ranked} catalog={suggestions} areas={areas} pending={pending} run={run} />
        ))}
        {topics.length === 0 && (
          <li className="px-4 py-3 text-sm text-warn">
            {L.noTopics}
          </li>
        )}
      </ul>

      {!c.archived && (
        <form
          className="border-t border-border p-3"
          onSubmit={(e) => {
            e.preventDefault();
            if (!topicName.trim()) return;
            const needsArea = c.ranked && !exact;
            run(
              () => createTopicAction({ categoryId: c.id, name: topicName, areaId: needsArea ? topicArea || null : null }),
              () => {
                setTopicName("");
                setTopicArea("");
              },
            );
          }}
        >
          <div className="flex gap-2">
            <Input
              aria-label={L.newTopicLabel(c.name)}
              placeholder={L.newTopicPlaceholder}
              value={topicName}
              maxLength={80}
              list={c.ranked ? listId : undefined}
              onChange={(e) => setTopicName(e.target.value)}
            />
            <Button size="md" variant="secondary" type="submit" disabled={pending || !topicName.trim()} className="shrink-0">
              {L.addTopic}
            </Button>
          </div>
          <datalist id={listId}>
            {suggestions.map((s) => (
              <option key={s.id} value={s.name} />
            ))}
          </datalist>
          {topicName.trim() && c.ranked && (
            <div className="mt-1.5 space-y-1.5 px-1">
              <p className="text-xs text-text-3">{exact ? L.willLink(exact.name) : L.newCommunityTopic}</p>
              {!exact && (
                <Select
                  aria-label={L.topicAreaLabel}
                  className="h-8 w-auto min-w-56 text-xs"
                  value={topicArea}
                  onChange={(e) => setTopicArea(e.target.value)}
                >
                  <option value="">{L.topicAreaLabel}</option>
                  {areas.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name}
                    </option>
                  ))}
                </Select>
              )}
            </div>
          )}
        </form>
      )}
    </section>
  );
}

function TopicRow({
  topic: t,
  personal,
  catalog,
  areas,
  pending,
  run,
}: {
  topic: Topic;
  personal: boolean;
  catalog: CatalogTopic[];
  areas: Area[];
  pending: boolean;
  run: Run;
}) {
  const areaName = areas.find((a) => a.id === t.catalogTopic?.areaId)?.name;
  const [editing, setEditing] = useState(false);
  const confirm = useConfirm();
  const { t: d } = useI18n();
  const L = d.categories;
  const [linking, setLinking] = useState(false);
  const [name, setName] = useState(t.name);
  return (
    <li className={cx("px-4 py-2.5", t.archived && "opacity-60")}>
      <div className="flex flex-wrap items-center gap-3">
        {editing ? (
          <form
            className="flex flex-1 gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              run(() => updateTopicAction(t.id, { name }), () => setEditing(false));
            }}
          >
            <Input aria-label={L.topicName} value={name} maxLength={80} onChange={(e) => setName(e.target.value)} autoFocus />
            <Button size="sm" type="submit" disabled={pending}>
              {d.common.save}
            </Button>
            <Button size="sm" variant="ghost" type="button" onClick={() => setEditing(false)}>
              {d.common.cancel}
            </Button>
          </form>
        ) : (
          <>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm">
                {t.name} {t.archived && <span className="text-xs text-text-3">{L.archivedTopic}</span>}
              </p>
              {personal ? null : (
              <button
                type="button"
                onClick={() => setLinking((v) => !v)}
                aria-expanded={linking}
                className={cx(
                  "mt-0.5 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium",
                  t.catalogTopic ? "bg-accent-soft text-link" : "bg-surface-2 text-text-3",
                )}
              >
                {t.catalogTopic ? L.rankingBadge(t.catalogTopic.name, areaName) : L.customBadge}
              </button>
              )}
            </div>
            <span className="text-sm text-text-2 tabular">
              {formatDuration(t.totalSeconds)} · {d.common.sessions(t.sessions)}
            </span>
            <div className="flex gap-1">
              <Button size="sm" variant="ghost" onClick={() => setEditing(true)}>
                {d.common.rename}
              </Button>
              <Button size="sm" variant="ghost" disabled={pending} onClick={() => run(() => archiveTopicAction(t.id, !t.archived))}>
                {t.archived ? d.common.restore : d.common.archive}
              </Button>
              <Button
                size="sm"
                variant="ghost"
                className="text-danger"
                disabled={pending}
                onClick={() => {
                  void confirm({
                    title: L.deleteTopicTitle(t.name),
                    message: L.deleteTopicText,
                    confirmLabel: d.common.delete,
                    cancelLabel: d.common.cancel,
                    danger: true,
                  }).then((ok) => ok && run(() => deleteTopicAction(t.id)));
                }}
              >
                {d.common.delete}
              </Button>
            </div>
          </>
        )}
      </div>
      {linking && !personal && (
        <CatalogPicker
          catalog={catalog}
          current={t.catalogTopic?.id ?? null}
          initialQuery={t.catalogTopic ? "" : t.name}
          pending={pending}
          onPick={(id) => run(() => linkTopicAction(t.id, id), () => setLinking(false))}
        />
      )}
    </li>
  );
}

/** Busca no catálogo para vincular um tema. Vale para sessões futuras. */
function CatalogPicker({
  catalog,
  current,
  initialQuery,
  pending,
  onPick,
}: {
  catalog: CatalogTopic[];
  current: string | null;
  initialQuery: string;
  pending: boolean;
  onPick: (id: string | null) => void;
}) {
  const [q, setQ] = useState(initialQuery);
  const [level, setLevel] = useState<(typeof LEVELS)[number] | null>(null);
  const { t: d } = useI18n();
  const L = d.categories;
  const words = normalizeTerm(q).split(" ").filter(Boolean);
  // Encontra pelo nome do tema ou pelo curso (ex.: "medicina" traz Semiologia, Clínica Médica…).
  const score = (t: CatalogTopic) => {
    if (words.length === 0) return 1;
    const n = normalizeTerm(t.name);
    if (words.every((w) => n.startsWith(w) || n.includes(" " + w))) return 3;
    if (words.some((w) => n.includes(w))) return 2;
    if (t.courses.some((c) => words.every((w) => normalizeTerm(c).includes(w)))) return 1;
    return 0;
  };
  const matches = catalog
    .filter((t) => !level || t.levels.includes(level))
    .map((t) => ({ t, s: score(t) }))
    .filter((x) => x.s > 0)
    .sort((a, b) => b.s - a.s || a.t.name.localeCompare(b.t.name))
    .slice(0, 16)
    .map((x) => x.t);
  return (
    <div className="mt-2 rounded-lg border border-border bg-surface-2 p-3">
      <Input aria-label={L.searchCatalog} placeholder={L.searchCatalog} value={q} onChange={(e) => setQ(e.target.value)} />
      <div role="radiogroup" aria-label={L.levelFilter} className="mt-2 flex flex-wrap gap-1 text-xs">
        {[null, ...LEVELS].map((lv) => (
          <button
            key={lv ?? "all"}
            type="button"
            role="radio"
            aria-checked={level === lv}
            onClick={() => setLevel(lv)}
            className={cx("rounded-md px-2 py-1", level === lv ? "bg-accent-soft text-link" : "text-text-2 hover:text-text")}
          >
            {lv ? L.levels[lv] : L.allLevels}
          </button>
        ))}
      </div>
      <ul className="mt-2 flex flex-wrap gap-2">
        {matches.map((m) => (
          <li key={m.id}>
            <button
              type="button"
              disabled={pending}
              onClick={() => onPick(m.id)}
              className={cx(
                "rounded-full border px-3 py-1 text-xs",
                m.id === current ? "border-accent bg-accent-soft text-link" : "border-border bg-surface hover:border-accent",
              )}
            >
              {m.name}
              {(m.courses.length > 0 || m.levels.length > 0) && (
                <span className="ml-1 text-text-3">
                  · {m.courses.length > 0 ? m.courses.slice(0, 2).join(", ") : m.levels.map((lv) => L.levels[lv as (typeof LEVELS)[number]] ?? lv).join(", ")}
                </span>
              )}
            </button>
          </li>
        ))}
        {matches.length === 0 && <li className="text-xs text-text-3">{L.noCatalogMatch}</li>}
      </ul>
      <p className="mt-2 text-xs text-text-3">
        {L.linkHint}
        {current && (
          <>
            {" "}
            <button type="button" className="text-link underline" disabled={pending} onClick={() => onPick(null)}>
              {L.unlink}
            </button>
          </>
        )}
      </p>
    </div>
  );
}

function ColorPicker({ value, onChange }: { value: string; onChange: (c: string) => void }) {
  const [open, setOpen] = useState(false);
  const { t: d } = useI18n();
  return (
    <div className="relative">
      <Button size="sm" variant="ghost" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        {d.common.color}
      </Button>
      {open && (
        <div className="absolute right-0 z-10 mt-1 grid grid-cols-4 gap-2 rounded-lg border border-border bg-surface p-2 shadow-lg">
          {CATEGORY_COLORS.map((c) => (
            <button
              key={c}
              type="button"
              aria-label={d.categories.colorLabel(c)}
              aria-pressed={value === c}
              onClick={() => {
                onChange(c);
                setOpen(false);
              }}
              className={cx("h-7 w-7 rounded-full", value === c && "ring-2 ring-[var(--text)] ring-offset-2")}
              style={{ background: c }}
            />
          ))}
        </div>
      )}
    </div>
  );
}
