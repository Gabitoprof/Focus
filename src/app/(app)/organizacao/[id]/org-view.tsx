"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import {
  assignToOrgProjectAction,
  createOrgProjectAction,
  inviteOrgMemberAction,
  removeOrgMemberAction,
  searchOrgMembersAction,
  updateOrgMemberAction,
} from "@/app/actions/organizations";
import type { ActionResult } from "@/app/actions/result";
import { useConfirm } from "@/components/confirm";
import { Alert, Button, Card, Input, Label, Select, cx } from "@/components/ui";
import type { OrgRole, OrganizationKind } from "@/domain/organizations";
import { formatDuration } from "@/domain/time";
import { useI18n } from "@/i18n/client";
import { Progress } from "../../registro/projects-board";

type Member = {
  userId: string;
  role: OrgRole;
  area: string | null;
  status: "invited" | "requested" | "active";
  displayName: string;
  publicCode: string | null;
  isViewer: boolean;
};
type Org = {
  id: string;
  kind: OrganizationKind;
  alias: string;
  legalName: string;
  cnpj: string;
  role: OrgRole;
  canManage: boolean;
  isOwner: boolean;
  members: Member[];
  areas: string[];
  ranking: (Member & { seconds: number })[];
  projects: {
    id: string;
    name: string;
    color: string;
    status: string;
    targetMinutes: number | null;
    dueDate: string | null;
    ownerUserId: string;
    memberIds: string[];
    seconds: number;
    movedOut: boolean;
    movedBy: string | null;
  }[];
};

export function OrgView({ org, period, area }: { org: Org; period: "semana" | "mes" | "tudo"; area: string | null }) {
  const { t } = useI18n();
  const O = t.org;
  const P = t.projects;
  const router = useRouter();
  const confirm = useConfirm();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [invite, setInvite] = useState({ code: "", role: "member", area: "" });
  const [project, setProject] = useState({ name: "", hours: "", dueDate: "" });
  const [assign, setAssign] = useState<Record<string, string>>({});
  // Filtro de membros: turma/área, nome e CPF (o CPF é conferido no servidor, pelo HMAC).
  const [filter, setFilter] = useState({ area: "", name: "", cpf: "" });
  const [cpfMatch, setCpfMatch] = useState<{ cpf: string; ids: Set<string> } | null>(null);
  const cpfDigits = filter.cpf.replace(/\D/g, "");
  useEffect(() => {
    if (!org.canManage || cpfDigits.length !== 11) return;
    let alive = true;
    searchOrgMembersAction(org.id, { query: cpfDigits }).then((res) => {
      if (alive) setCpfMatch({ cpf: cpfDigits, ids: new Set(res.ok ? res.data.map((m) => m.userId) : []) });
    });
    return () => {
      alive = false;
    };
  }, [org.id, org.canManage, cpfDigits]);
  const norm = (v: string) => v.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();
  const filtering = Boolean(filter.area || filter.name.trim() || cpfDigits.length === 11);
  const shownMembers = org.members.filter(
    (m) =>
      (!filter.area || m.area === filter.area) &&
      (!filter.name.trim() || norm(m.displayName).includes(norm(filter.name.trim()))) &&
      (cpfDigits.length !== 11 || (cpfMatch?.cpf === cpfDigits && cpfMatch.ids.has(m.userId))),
  );

  const run = (fn: () => Promise<ActionResult<unknown>>, after?: () => void) =>
    start(async () => {
      const res = await fn();
      if (!res.ok) setError(res.error);
      else {
        setError(null);
        after?.();
        router.refresh();
      }
    });

  const active = org.members.filter((m) => m.status === "active");
  const ranking = (area ? org.ranking.filter((r) => r.area === area) : org.ranking).map((r, i) => ({ ...r, position: i + 1 }));
  const qs = (over: { periodo?: string; area?: string | null }) => {
    const p = new URLSearchParams();
    p.set("periodo", over.periodo ?? period);
    const a = over.area === undefined ? area : over.area;
    if (a) p.set("area", a);
    return `?${p}`;
  };

  return (
    <div className="space-y-5">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">{org.alias}</h1>
        <p className="text-sm text-text-2">
          {O.kinds[org.kind]} · {org.legalName} · CNPJ {org.cnpj} · {O.roles[org.role]}
        </p>
        <p className="mt-1 text-xs text-text-3">{O.privacyNote}</p>
      </header>

      {error && <Alert>{error}</Alert>}

      <div className="grid gap-5 lg:grid-cols-[1.3fr_1fr]">
        <div className="space-y-5">
          {/* Ranking interno */}
          <Card className="p-0">
            <div className="flex flex-wrap items-center gap-2 border-b border-border px-4 py-3">
              <h2 className="mr-auto font-semibold">{org.kind === "company" ? O.companyRanking : O.institutionRanking}</h2>
              <nav className="flex gap-1 text-xs">
                {(["semana", "mes", "tudo"] as const).map((k) => (
                  <Link
                    key={k}
                    href={qs({ periodo: k })}
                    aria-current={period === k ? "page" : undefined}
                    className={cx("rounded-md px-2 py-1", period === k ? "bg-accent-soft text-link" : "text-text-2 hover:text-text")}
                  >
                    {P.periods[k]}
                  </Link>
                ))}
              </nav>
            </div>
            {org.areas.length > 0 && (
              <nav className="flex flex-wrap gap-1 border-b border-border px-4 py-2 text-xs" aria-label={O.areaFilter}>
                <Link href={qs({ area: null })} className={cx("rounded-md px-2 py-1", !area ? "bg-accent-soft text-link" : "text-text-2")}>
                  {O.allAreas}
                </Link>
                {org.areas.map((a) => (
                  <Link key={a} href={qs({ area: a })} className={cx("rounded-md px-2 py-1", area === a ? "bg-accent-soft text-link" : "text-text-2")}>
                    {a}
                  </Link>
                ))}
              </nav>
            )}
            <ol className="divide-y divide-border">
              {ranking.map((r) => (
                <li key={r.userId} className={cx("flex items-center gap-3 px-4 py-2.5 text-sm", r.isViewer && "bg-accent-soft/50")}>
                  <span className="w-6 font-semibold tabular">{r.position}</span>
                  <span className="min-w-0 flex-1 truncate">
                    {r.displayName}
                    {r.area && <span className="text-text-3"> · {r.area}</span>}
                  </span>
                  <span className="font-medium tabular">{formatDuration(r.seconds)}</span>
                </li>
              ))}
            </ol>
            <p className="px-4 py-2 text-xs text-text-3">{O.rankingHint}</p>
          </Card>

          {/* Projetos da organização */}
          <Card className="p-0">
            <h2 className="border-b border-border px-4 py-3 font-semibold">{O.projects}</h2>
            <ul className="divide-y divide-border">
              {org.projects.length === 0 && <li className="px-4 py-3 text-sm text-text-2">{O.noProjects}</li>}
              {org.projects.map((p) => {
                const canAssign = org.isOwner || p.ownerUserId === active.find((m) => m.isViewer)?.userId;
                const candidates = active.filter((m) => !p.memberIds.includes(m.userId));
                return (
                  <li key={p.id} className="space-y-2 px-4 py-3">
                    <div className="flex items-center gap-2">
                      <span aria-hidden className="h-3 w-3 rounded-full" style={{ background: p.color }} />
                      {p.movedOut ? (
                        <span className="font-medium text-text-3 line-through" title={O.movedBy(p.movedBy ?? "—")}>
                          {p.name}
                        </span>
                      ) : (
                        <Link href={`/registro/projetos/${p.id}`} className="font-medium hover:underline">
                          {p.name}
                        </Link>
                      )}
                      {p.movedOut && <span className="text-xs text-text-3">{O.movedBy(p.movedBy ?? "—")}</span>}
                      <span className="ml-auto text-xs text-text-2 tabular">
                        {formatDuration(p.seconds)}
                        {p.targetMinutes ? ` ${P.ofTarget(formatDuration(p.targetMinutes * 60))}` : ""} · {P.membersCount(p.memberIds.length)}
                      </span>
                    </div>
                    <Progress seconds={p.seconds} targetMinutes={p.targetMinutes} label={P.progress} />
                    {org.canManage && canAssign && !p.movedOut && candidates.length > 0 && (
                      <form
                        className="flex gap-2"
                        onSubmit={(e) => {
                          e.preventDefault();
                          const who = assign[p.id];
                          if (who) run(() => assignToOrgProjectAction(org.id, p.id, who), () => setAssign((s) => ({ ...s, [p.id]: "" })));
                        }}
                      >
                        <Select
                          aria-label={O.assignLabel(p.name)}
                          className="h-8 text-xs"
                          value={assign[p.id] ?? ""}
                          onChange={(e) => setAssign((s) => ({ ...s, [p.id]: e.target.value }))}
                        >
                          <option value="">{O.assignPlaceholder}</option>
                          {candidates.map((m) => (
                            <option key={m.userId} value={m.userId}>
                              {m.displayName}
                              {m.area ? ` · ${m.area}` : ""}
                            </option>
                          ))}
                        </Select>
                        <Button size="sm" variant="secondary" type="submit" disabled={pending || !assign[p.id]}>
                          {O.assign}
                        </Button>
                      </form>
                    )}
                  </li>
                );
              })}
            </ul>
            {org.canManage && (
              <form
                className="grid gap-2 border-t border-border p-3 sm:grid-cols-[1fr_110px_150px_auto]"
                onSubmit={(e) => {
                  e.preventDefault();
                  if (!project.name.trim()) return;
                  run(
                    () =>
                      createOrgProjectAction(org.id, {
                        name: project.name,
                        targetHours: project.hours.trim() ? Number(project.hours.replace(",", ".")) : null,
                        dueDate: project.dueDate || null,
                      }),
                    () => setProject({ name: "", hours: "", dueDate: "" }),
                  );
                }}
              >
                <Input aria-label={P.newName} placeholder={P.newName} value={project.name} maxLength={80} onChange={(e) => setProject((s) => ({ ...s, name: e.target.value }))} />
                <Input aria-label={P.targetHours} placeholder={P.targetHours} inputMode="decimal" value={project.hours} onChange={(e) => setProject((s) => ({ ...s, hours: e.target.value }))} />
                <Input aria-label={P.dueDate} type="date" value={project.dueDate} onChange={(e) => setProject((s) => ({ ...s, dueDate: e.target.value }))} />
                <Button type="submit" disabled={pending || !project.name.trim()}>
                  {P.create}
                </Button>
              </form>
            )}
          </Card>
        </div>

        {/* Membros */}
        <Card className="h-fit p-0">
          <h2 className="border-b border-border px-4 py-3 font-semibold">
            {O.members} <span className="text-sm font-normal text-text-3">({filtering ? `${shownMembers.length}/${org.members.length}` : org.members.length})</span>
          </h2>
          <div className="grid gap-2 border-b border-border p-3" role="search" aria-label={t.memberSearch.filterLabel}>
            {org.areas.length > 0 && (
              <Select aria-label={t.memberSearch.areaLabel} value={filter.area} onChange={(e) => setFilter((f) => ({ ...f, area: e.target.value }))}>
                <option value="">{t.memberSearch.allAreas}</option>
                {org.areas.map((a) => (
                  <option key={a} value={a}>
                    {a}
                  </option>
                ))}
              </Select>
            )}
            <Input aria-label={t.memberSearch.nameLabel} placeholder={t.memberSearch.nameLabel} value={filter.name} maxLength={80} onChange={(e) => setFilter((f) => ({ ...f, name: e.target.value }))} />
            {org.canManage && (
              <Input
                aria-label="CPF"
                placeholder="CPF"
                inputMode="numeric"
                value={filter.cpf}
                maxLength={14}
                onChange={(e) => setFilter((f) => ({ ...f, cpf: e.target.value }))}
              />
            )}
            {filtering && (
              <Button size="sm" variant="ghost" type="button" onClick={() => setFilter({ area: "", name: "", cpf: "" })}>
                {t.memberSearch.clear}
              </Button>
            )}
          </div>
          {filtering && shownMembers.length === 0 && <p className="px-4 py-3 text-sm text-text-3">{t.memberSearch.none}</p>}
          <ul className="max-h-[32rem] divide-y divide-border overflow-y-auto">
            {shownMembers.map((m) => (
              <li key={m.userId} className="flex flex-wrap items-center gap-2 px-4 py-2.5 text-sm">
                <div className="min-w-40 flex-1">
                  <p className="truncate">
                    {m.displayName}
                    {m.isViewer && <span className="text-text-2"> ({P.you})</span>}
                  </p>
                  <p className="text-xs text-text-3">
                    {m.publicCode} · {m.status === "invited" ? P.pendingInvite : O.roles[m.role]}
                  </p>
                </div>
                {org.canManage && m.role !== "owner" && (org.isOwner || m.role === "member") ? (
                  <Input
                    aria-label={O.areaOf(m.displayName)}
                    className="h-8 w-28 text-xs"
                    defaultValue={m.area ?? ""}
                    placeholder={O.areaPlaceholder}
                    maxLength={60}
                    onBlur={(e) => {
                      if ((e.target.value.trim() || null) !== m.area) run(() => updateOrgMemberAction(org.id, m.userId, { area: e.target.value }));
                    }}
                  />
                ) : (
                  m.area && <span className="text-xs text-text-2">{m.area}</span>
                )}
                {org.isOwner && m.role !== "owner" && m.status === "active" && (
                  <Select
                    aria-label={O.roleOf(m.displayName)}
                    className="h-8 w-auto text-xs"
                    value={m.role}
                    disabled={pending}
                    onChange={(e) => run(() => updateOrgMemberAction(org.id, m.userId, { role: e.target.value }))}
                  >
                    <option value="member">{O.roles.member}</option>
                    <option value="manager">{O.roles.manager}</option>
                  </Select>
                )}
                {m.role !== "owner" && (m.isViewer || (org.canManage && (org.isOwner || m.role === "member"))) && (
                  <Button
                    size="sm"
                    variant="ghost"
                    className="text-danger"
                    disabled={pending}
                    onClick={async () => {
                      const ok = await confirm({
                        title: m.isViewer ? O.leaveTitle : O.removeTitle(m.displayName),
                        message: O.removeText,
                        confirmLabel: m.isViewer ? P.leave : P.remove,
                        cancelLabel: t.common.cancel,
                        danger: true,
                      });
                      if (ok) run(() => removeOrgMemberAction(org.id, m.userId), m.isViewer ? () => router.push("/organizacao") : undefined);
                    }}
                  >
                    {m.isViewer ? P.leave : P.remove}
                  </Button>
                )}
              </li>
            ))}
          </ul>
          {org.canManage && (
            <form
              className="space-y-2 border-t border-border p-3"
              onSubmit={(e) => {
                e.preventDefault();
                if (!invite.code.trim()) return;
                run(
                  () => inviteOrgMemberAction(org.id, { publicCode: invite.code, role: invite.role, area: invite.area || null }),
                  () => setInvite({ code: "", role: "member", area: "" }),
                );
              }}
            >
              <Label htmlFor="org-invite">{O.inviteLabel}</Label>
              <Input id="org-invite" placeholder="FCS-XXXXXXXX" value={invite.code} maxLength={20} onChange={(e) => setInvite((s) => ({ ...s, code: e.target.value }))} />
              <div className="flex gap-2">
                {org.isOwner && (
                  <Select aria-label={O.roleLabel} className="w-auto" value={invite.role} onChange={(e) => setInvite((s) => ({ ...s, role: e.target.value }))}>
                    <option value="member">{O.roles.member}</option>
                    <option value="manager">{O.roles.manager}</option>
                  </Select>
                )}
                <Input aria-label={O.areaPlaceholder} placeholder={O.areaPlaceholder} value={invite.area} maxLength={60} onChange={(e) => setInvite((s) => ({ ...s, area: e.target.value }))} />
                <Button type="submit" variant="secondary" disabled={pending || !invite.code.trim()} className="shrink-0">
                  {P.invite}
                </Button>
              </div>
              <p className="text-xs text-text-3">{O.inviteHint(org.kind)}</p>
            </form>
          )}
        </Card>
      </div>
    </div>
  );
}
