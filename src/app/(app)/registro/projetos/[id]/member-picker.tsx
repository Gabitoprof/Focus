"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { assignToOrgProjectAction, searchOrgMembersAction } from "@/app/actions/organizations";
import { Alert, Button, Input, Select } from "@/components/ui";
import { useI18n } from "@/i18n/client";

type Found = {
  userId: string;
  displayName: string;
  area: string | null;
  enrollment: string | null;
  cpfLastDigits: string | null;
};

/**
 * Projeto de instituição/empresa: o gestor procura membros da organização (nome, CPF ou
 * matrícula; turma/área) e inclui direto, sem convite — o vínculo com a organização já foi aceito.
 */
export function OrgMemberPicker({ orgId, orgAlias, projectId, areas }: { orgId: string; orgAlias: string; projectId: string; areas: string[] }) {
  const { t } = useI18n();
  const M = t.memberSearch;
  const router = useRouter();
  const [pending, start] = useTransition();
  const [query, setQuery] = useState("");
  const [area, setArea] = useState("");
  const [found, setFound] = useState<Found[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [version, setVersion] = useState(0);

  useEffect(() => {
    let alive = true;
    const timer = setTimeout(async () => {
      const res = await searchOrgMembersAction(orgId, { query, area: area || null, excludeProjectId: projectId });
      if (!alive) return;
      if (res.ok) {
        setFound(res.data);
        setError(null);
      } else setError(res.error);
    }, 250);
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [orgId, projectId, query, area, version]);

  const add = (userId: string) =>
    start(async () => {
      const res = await assignToOrgProjectAction(orgId, projectId, userId);
      if (!res.ok) setError(res.error);
      else {
        setVersion((v) => v + 1);
        router.refresh();
      }
    });

  return (
    <div className="space-y-2 border-t border-border p-3">
      <p className="text-sm font-medium">{M.addTitle}</p>
      <p className="text-xs text-text-3">{M.addHint(orgAlias)}</p>
      <div className="flex flex-wrap gap-2">
        <Input
          aria-label={M.queryLabel}
          placeholder={M.queryPlaceholder}
          value={query}
          maxLength={80}
          onChange={(e) => setQuery(e.target.value)}
          className="min-w-40 flex-1"
        />
        {areas.length > 0 && (
          <Select aria-label={M.areaLabel} className="w-auto" value={area} onChange={(e) => setArea(e.target.value)}>
            <option value="">{M.allAreas}</option>
            {areas.map((a) => (
              <option key={a} value={a}>
                {a}
              </option>
            ))}
          </Select>
        )}
      </div>
      {error && <Alert>{error}</Alert>}
      {found && found.length === 0 && <p className="text-xs text-text-3">{M.none}</p>}
      {found && found.length > 0 && (
        <ul className="max-h-64 divide-y divide-border overflow-y-auto rounded-lg border border-border">
          {found.map((m) => (
            <li key={m.userId} className="flex items-center gap-2 px-3 py-2 text-sm">
              <div className="min-w-0 flex-1">
                <p className="truncate">{m.displayName}</p>
                <p className="text-xs text-text-3">
                  {[m.area, m.enrollment && M.enrollment(m.enrollment), m.cpfLastDigits && `CPF ${m.cpfLastDigits.includes("•") ? m.cpfLastDigits : `•••.•••.•••-${m.cpfLastDigits}`}`].filter(Boolean).join(" · ") || "—"}
                </p>
              </div>
              <Button size="sm" variant="secondary" disabled={pending} onClick={() => add(m.userId)}>
                {M.add}
              </Button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
