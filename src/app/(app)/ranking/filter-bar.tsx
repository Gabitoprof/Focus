"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { Select } from "@/components/ui";
import { useI18n } from "@/i18n/client";

type Opt = { id: string; name: string; participants: number };

export function FilterBar({
  scope,
  options,
  value,
  base,
}: {
  scope: string;
  options: { minParticipants: number; hasTags: boolean; areas: Opt[]; topics: Opt[]; methods: { id: string; name: string }[] };
  value: { areaId?: string; topicId?: string; methodId?: string };
  base: Record<string, string>;
}) {
  const router = useRouter();
  const F = useI18n().t.ranking.filters;
  const go = (over: Record<string, string | undefined>) => {
    const p = new URLSearchParams(base);
    const merged = { area: value.areaId, tema: value.topicId, metodo: value.methodId, ...over };
    for (const [k, v] of Object.entries(merged)) if (v) p.set(k, v);
    router.push(`/ranking?${p}`);
  };
  const label = (o: Opt) =>
    o.participants < options.minParticipants ? `${o.name} (${o.participants}/${options.minParticipants})` : `${o.name} (${o.participants})`;

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        {scope === "filtro" && (
          <>
            <Select
              aria-label={F.area}
              className="h-9 w-auto min-w-48"
              value={value.areaId ?? ""}
              onChange={(e) => go({ area: e.target.value || undefined })}
            >
              <option value="">{F.allAreas}</option>
              {options.areas.map((a) => (
                <option key={a.id} value={a.id} disabled={a.participants < options.minParticipants}>
                  {label(a)}
                </option>
              ))}
            </Select>
            <Select
              aria-label={F.topic}
              className="h-9 w-auto min-w-48"
              value={value.topicId ?? ""}
              onChange={(e) => go({ tema: e.target.value || undefined })}
            >
              <option value="">{F.allTopics}</option>
              {options.topics.map((t) => (
                <option key={t.id} value={t.id} disabled={t.participants < options.minParticipants}>
                  {label(t)}
                </option>
              ))}
            </Select>
          </>
        )}
        <Select
          aria-label={F.method}
          className="h-9 w-auto min-w-44"
          value={value.methodId ?? ""}
          onChange={(e) => go({ metodo: e.target.value || undefined })}
        >
          <option value="">{F.allMethods}</option>
          {options.methods.map((m) => (
            <option key={m.id} value={m.id}>
              {m.name}
            </option>
          ))}
        </Select>
      </div>
      {!options.hasTags && (
        <p className="text-xs text-text-3">
          {F.fromTags}{" "}
          <Link href="/perfil" className="text-link underline">
            {F.chooseTags}
          </Link>
        </p>
      )}
      {options.hasTags && (
        <p className="text-xs text-text-3">
          {F.minHint(options.minParticipants)}
        </p>
      )}
    </div>
  );
}
