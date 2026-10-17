"use client";

import { useState, useTransition } from "react";
import { setProfileTagsAction } from "@/app/actions/catalog";
import { Alert, Button, Card, Input, cx } from "@/components/ui";
import { normalizeTerm } from "@/domain/catalog";
import { useI18n } from "@/i18n/client";

type Option = { id: string; name: string };

export function TagsForm({
  areas,
  catalog,
  goals,
  initial,
  limits,
}: {
  areas: Option[];
  catalog: (Option & { areaId: string | null })[];
  goals: { id: string; label: string }[];
  initial: { areaIds: string[]; topicIds: string[]; goalIds: string[] };
  limits: { areas: number; topics: number; goals: number };
}) {
  const { t: d } = useI18n();
  const T = d.tags;
  const [areaIds, setAreaIds] = useState(initial.areaIds);
  const [topicIds, setTopicIds] = useState(initial.topicIds);
  const [goalIds, setGoalIds] = useState(initial.goalIds);
  const [q, setQ] = useState("");
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ tone: "good" | "danger"; text: string } | null>(null);

  const toggle = (list: string[], set: (v: string[]) => void, id: string, max: number) => {
    if (list.includes(id)) set(list.filter((x) => x !== id));
    else if (list.length < max) set([...list, id]);
  };

  const words = normalizeTerm(q).split(" ").filter(Boolean);
  const results = words.length
    ? catalog
        .filter((t) => !topicIds.includes(t.id) && words.every((w) => normalizeTerm(t.name).includes(w)))
        .slice(0, 8)
    : // Sem busca: sugere temas das áreas escolhidas.
      catalog.filter((t) => !topicIds.includes(t.id) && t.areaId && areaIds.includes(t.areaId)).slice(0, 8);

  return (
    <Card>
      <h2 className="font-semibold">{T.title}</h2>
      <p className="mt-1 text-sm text-text-2">{T.description}</p>

      <form
        className="mt-5 space-y-6"
        onSubmit={(e) => {
          e.preventDefault();
          start(async () => {
            const res = await setProfileTagsAction({ areaIds, catalogTopicIds: topicIds, goalIds });
            setMsg(res.ok ? { tone: "good", text: T.saved } : { tone: "danger", text: res.error });
          });
        }}
      >
        {msg && <Alert tone={msg.tone}>{msg.text}</Alert>}

        <fieldset>
          <legend className="text-sm font-medium">
            {T.areas} <span className="font-normal text-text-3">({areaIds.length}/{limits.areas})</span>
          </legend>
          <ChipGroup
            options={areas.map((a) => ({ id: a.id, label: a.name }))}
            selected={areaIds}
            max={limits.areas}
            onToggle={(id) => toggle(areaIds, setAreaIds, id, limits.areas)}
          />
        </fieldset>

        <fieldset>
          <legend className="text-sm font-medium">
            {T.topics} <span className="font-normal text-text-3">({topicIds.length}/{limits.topics})</span>
          </legend>
          {topicIds.length > 0 && (
            <ul className="mt-2 flex flex-wrap gap-2">
              {topicIds.map((id) => {
                const t = catalog.find((c) => c.id === id);
                return (
                  <li key={id}>
                    <button
                      type="button"
                      onClick={() => setTopicIds(topicIds.filter((x) => x !== id))}
                      className="rounded-full bg-accent px-3 py-1 text-xs font-medium text-accent-ink"
                      aria-label={T.remove(t?.name ?? "")}
                    >
                      {t?.name ?? "Tema"} ×
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
          <Input
            className="mt-3"
            aria-label={T.search}
            placeholder={T.searchPlaceholder}
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
          <ul className="mt-2 flex flex-wrap gap-2">
            {results.map((t) => (
              <li key={t.id}>
                <button
                  type="button"
                  disabled={topicIds.length >= limits.topics}
                  onClick={() => setTopicIds([...topicIds, t.id])}
                  className="rounded-full border border-border px-3 py-1 text-xs hover:border-accent disabled:opacity-50"
                >
                  + {t.name}
                </button>
              </li>
            ))}
            {words.length > 0 && results.length === 0 && (
              <li className="text-xs text-text-3">
                {T.noMatch}
              </li>
            )}
          </ul>
        </fieldset>

        <fieldset>
          <legend className="text-sm font-medium">
            {T.goals} <span className="font-normal text-text-3">({goalIds.length}/{limits.goals})</span>
          </legend>
          <ChipGroup
            options={goals}
            selected={goalIds}
            max={limits.goals}
            onToggle={(id) => toggle(goalIds, setGoalIds, id, limits.goals)}
          />
        </fieldset>

        <Button type="submit" disabled={pending}>
          {pending ? d.common.saving : T.save}
        </Button>
      </form>
    </Card>
  );
}

function ChipGroup({
  options,
  selected,
  max,
  onToggle,
}: {
  options: { id: string; label: string }[];
  selected: string[];
  max: number;
  onToggle: (id: string) => void;
}) {
  return (
    <div className="mt-2 flex flex-wrap gap-2">
      {options.map((o) => {
        const on = selected.includes(o.id);
        return (
          <button
            key={o.id}
            type="button"
            aria-pressed={on}
            disabled={!on && selected.length >= max}
            onClick={() => onToggle(o.id)}
            className={cx(
              "rounded-full border px-3 py-1.5 text-xs font-medium transition disabled:opacity-40",
              on ? "border-accent bg-accent text-accent-ink" : "border-border hover:border-accent",
            )}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}
