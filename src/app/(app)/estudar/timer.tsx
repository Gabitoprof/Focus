"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { createTopicAction } from "@/app/actions/categories";
import {
  finishBreakAction,
  finishSessionAction,
  getTimerStateAction,
  heartbeatAction,
  pauseSessionAction,
  resumeSessionAction,
  startBreakAction,
  startSessionAction,
} from "@/app/actions/timer";
import { updateProfileAction } from "@/app/actions/profile";
import type { ActionResult } from "@/app/actions/result";
import { SHORTCUT_EVENT, ShortcutEditor, type ShortcutAction } from "@/components/timer-shortcuts";
import { Alert, Button, Input, Label, Select, cx } from "@/components/ui";
import type { MethodRules } from "@/domain/methods";
import { projectKey, subjectFromSelection } from "@/domain/contexts";
import { formatClock, formatDuration } from "@/domain/time";
import { useI18n } from "@/i18n/client";
import type { TimerState } from "@/server/services/timer";

type Method = { id: string; name: string; description: string; rules: MethodRules };
/** Grupo do cronômetro: categoria de estudo (Estude) ou projeto ("p:<id>", com tarefas). */
type Category = { id: string; name: string; color: string; kind: "study" | "project"; topics: { id: string; name: string }[] };

type Selection = { categoryId: string; topicId: string; methodId: string; minutes: number; breakMinutes: number };

const PREF_KEY = "focus:selection";
const NEW_TOPIC = "__novo_tema__";
const MUTE_KEY = "focus:alarm-muted";
const HEARTBEAT_MS = 60_000;

// ---------------------------------------------------------------------------
// Relógio: Web Worker (não é limitado como timers da aba em segundo plano)
// ---------------------------------------------------------------------------

function useTicker() {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    let worker: Worker | null = null;
    let fallback: ReturnType<typeof setInterval> | null = null;
    try {
      const src = "setInterval(() => postMessage(0), 250);";
      const url = URL.createObjectURL(new Blob([src], { type: "text/javascript" }));
      worker = new Worker(url);
      worker.onmessage = () => setNow(Date.now());
      URL.revokeObjectURL(url);
    } catch {
      fallback = setInterval(() => setNow(Date.now()), 250);
    }
    return () => {
      worker?.terminate();
      if (fallback) clearInterval(fallback);
    };
  }, []);
  return now;
}

// ---------------------------------------------------------------------------
// Áudio
// ---------------------------------------------------------------------------

/**
 * Alarme com dois modos: toque único (teste) e contínuo (loop durante o tempo excedente).
 * Sem o MP3, usa um bipe sintetizado repetido.
 */
function useAlarm(url: string, volume: number) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const ctxRef = useRef<AudioContext | null>(null);
  const beepTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const volumeRef = useRef(volume);
  const [blocked, setBlocked] = useState(false);

  useEffect(() => {
    const a = new Audio(url);
    a.preload = "auto";
    audioRef.current = a;
    return () => {
      a.pause();
      audioRef.current = null;
    };
  }, [url]);
  useEffect(() => {
    volumeRef.current = volume;
    if (audioRef.current) audioRef.current.volume = volume / 100;
  }, [volume]);

  const beep = useCallback(() => {
    try {
      ctxRef.current ??= new AudioContext();
      const ctx = ctxRef.current;
      void ctx.resume();
      const gain = ctx.createGain();
      gain.gain.value = (volumeRef.current / 100) * 0.3;
      gain.connect(ctx.destination);
      [0, 0.35, 0.7].forEach((t) => {
        const o = ctx.createOscillator();
        o.frequency.value = 880;
        o.connect(gain);
        o.start(ctx.currentTime + t);
        o.stop(ctx.currentTime + t + 0.2);
      });
    } catch {
      /* sem suporte a áudio */
    }
  }, []);

  const stop = useCallback(() => {
    const a = audioRef.current;
    if (a) {
      a.pause();
      a.loop = false;
      a.currentTime = 0;
    }
    if (beepTimer.current) {
      clearInterval(beepTimer.current);
      beepTimer.current = null;
    }
  }, []);

  const play = useCallback(
    async (loop: boolean) => {
      const a = audioRef.current;
      try {
        if (!a) throw new Error("sem áudio");
        a.loop = loop;
        a.currentTime = 0;
        a.volume = volumeRef.current / 100;
        await a.play();
        setBlocked(false);
      } catch (e) {
        // Navegador bloqueou o som (ex.: página recarregada sem clique do usuário).
        if (e instanceof DOMException && e.name === "NotAllowedError") {
          setBlocked(true);
          return;
        }
        beep();
        if (loop && !beepTimer.current) beepTimer.current = setInterval(beep, 2000);
      }
    },
    [beep],
  );

  return { play, stop, blocked };
}

/** Sessão/intervalo cujo alarme o usuário silenciou (sobrevive à recarga da página). */
function readMuted(): string | null {
  try {
    return localStorage.getItem(MUTE_KEY);
  } catch {
    return null;
  }
}
function writeMuted(id: string | null) {
  try {
    if (id) localStorage.setItem(MUTE_KEY, id);
    else localStorage.removeItem(MUTE_KEY);
  } catch {
    /* armazenamento indisponível */
  }
}

// ---------------------------------------------------------------------------

/** Seleção inicial: última sessão, depois preferências locais, depois o primeiro tema. */
function initialSelection(
  state: TimerState,
  methods: Method[],
  categories: Category[],
  preferProjectId?: string,
): Selection {
  const preferred = preferProjectId ? categories.find((c) => c.id === projectKey(preferProjectId)) : undefined;
  const firstCat = preferred ?? categories[0];
  const base: Selection = {
    categoryId: firstCat?.id ?? "",
    topicId: firstCat?.topics[0]?.id ?? "",
    methodId: methods[0]?.id ?? "",
    minutes: 30,
    breakMinutes: 5,
  };
  let saved: Partial<Selection> | null = null;
  try {
    saved = JSON.parse(localStorage.getItem(PREF_KEY) ?? "null");
  } catch {
    /* armazenamento indisponível */
  }
  const valid = (categoryId?: string, topicId?: string) =>
    categories.some((c) => c.id === categoryId && c.topics.some((t) => t.id === topicId));
  const last = state.lastSession;
  const pick = preferred
    ? null
    : last && valid(last.categoryId, last.topicId)
      ? last
      : saved && valid(saved.categoryId, saved.topicId)
        ? saved
        : null;
  const methodId = last?.methodId ?? saved?.methodId;
  return {
    categoryId: pick?.categoryId ?? base.categoryId,
    topicId: pick?.topicId ?? base.topicId,
    methodId: methodId && methods.some((m) => m.id === methodId) ? methodId : base.methodId,
    minutes: saved?.minutes ?? base.minutes,
    breakMinutes: saved?.breakMinutes ?? base.breakMinutes,
  };
}

export function Timer({
  initialState,
  methods,
  categories,
  alarmUrl,
  initialVolume,
  preferProjectId,
}: {
  initialState: TimerState;
  methods: Method[];
  categories: Category[];
  alarmUrl: string;
  initialVolume: number;
  preferProjectId?: string;
}) {
  const [state, setState] = useState(initialState);
  const [offset, setOffset] = useState(() => Date.parse(initialState.serverNow) - Date.now());
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [volume, setVolume] = useState(initialVolume);
  const clientNow = useTicker();
  const now = clientNow + offset;
  const alarm = useAlarm(alarmUrl, volume);
  const [mutedId, setMutedId] = useState<string | null>(readMuted);

  const [sel, setSel] = useState<Selection>(() =>
    initialSelection(initialState, methods, categories, preferProjectId),
  );
  const [addingTopic, setAddingTopic] = useState(false);
  const { t } = useI18n();
  const methodName = (id: string, fallback: string) => t.methods[id]?.name ?? fallback;
  const router = useRouter();
  const currentTopics = categories.find((c) => c.id === sel.categoryId)?.topics ?? [];
  const kind: Category["kind"] = sel.categoryId.startsWith("p:") ? "project" : "study";
  const kinds = (["study", "project"] as const).filter((k) => categories.some((c) => c.kind === k));
  const groups = categories.filter((c) => c.kind === kind);
  useEffect(() => {
    try {
      localStorage.setItem(PREF_KEY, JSON.stringify(sel));
    } catch {
      /* ignorado */
    }
  }, [sel]);

  const apply = useCallback((res: ActionResult<TimerState>) => {
    if (res.ok) {
      setState(res.data);
      setOffset(Date.parse(res.data.serverNow) - Date.now());
      setError(null);
    } else {
      setError(res.error);
    }
  }, []);

  const act = useCallback(
    async (fn: () => Promise<ActionResult<TimerState>>) => {
      if (pending) return;
      setPending(true);
      try {
        apply(await fn());
      } catch {
        setError(t.common.offline);
      } finally {
        setPending(false);
      }
    },
    [apply, pending, t.common.offline],
  );

  // Ressincroniza ao voltar para a aba.
  useEffect(() => {
    const onVis = () => {
      if (document.visibilityState === "visible") getTimerStateAction().then(apply).catch(() => {});
    };
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, [apply]);

  // Heartbeat enquanto a sessão está em andamento.
  const runningId = state.session?.status === "running" ? state.session.id : null;
  const lastBeat = useRef(0);
  useEffect(() => {
    if (!runningId) return;
    if (clientNow - lastBeat.current >= HEARTBEAT_MS) {
      lastBeat.current = clientNow;
      heartbeatAction(runningId)
        .then((res) => {
          // Só atualiza se a sessão mudou no servidor (ex.: encerrada em outro dispositivo).
          if (res.ok && res.data.session?.id !== runningId) apply(res);
        })
        .catch(() => {});
    }
  }, [clientNow, runningId, apply]);

  // ----- cálculos de tempo (a partir dos timestamps do servidor) -----
  const session = state.session;
  const brk = state.break;
  const elapsed = session
    ? session.closedActiveSeconds +
      (session.openSegmentStartedAt ? Math.max(0, (now - Date.parse(session.openSegmentStartedAt)) / 1000) : 0)
    : brk
      ? Math.max(0, (now - Date.parse(brk.startedAt)) / 1000)
      : 0;
  const planned = session?.plannedSeconds ?? brk?.plannedSeconds ?? 0;
  const remaining = planned - elapsed;
  const overtime = remaining <= 0 && (session || brk) ? -remaining : 0;
  const activeId = session?.id ?? brk?.id ?? null;

  const mode: "idle" | "study" | "overtime" | "paused" | "break" | "break_over" = session
    ? session.status === "paused"
      ? "paused"
      : remaining <= 0
        ? "overtime"
        : "study"
    : brk
      ? remaining <= 0
        ? "break_over"
        : "break"
      : "idle";

  // Alarme contínuo enquanto houver tempo excedente (estudo ou intervalo), até o usuário
  // agir (pausar, finalizar, iniciar/encerrar intervalo) ou silenciar.
  const inOvertime = mode === "overtime" || mode === "break_over";
  const ringing = inOvertime && activeId !== null && mutedId !== activeId;
  const { play: playAlarm, stop: stopAlarm } = alarm;
  useEffect(() => {
    if (!ringing) return;
    void playAlarm(true);
    return () => stopAlarm();
  }, [ringing, activeId, playAlarm, stopAlarm]);

  function setMuted(id: string | null) {
    writeMuted(id);
    setMutedId(id);
  }

  useEffect(() => {
    document.title =
      mode === "idle"
        ? t.study.tabTitle.idle
        : `${overtime > 0 ? "+" + formatClock(overtime) : formatClock(remaining)} · ${t.study.tabTitle[mode]}`;
  }, [mode, remaining, overtime, t]);

  const method = methods.find((m) => m.id === sel.methodId) ?? methods[0];
  const startInput = () => {
    const subject = subjectFromSelection(sel.categoryId, sel.topicId);
    return {
      ...(subject?.kind === "project"
        ? { projectId: subject.projectId, taskId: subject.taskId }
        : { topicId: subject?.topicId ?? "" }),
      methodId: sel.methodId,
      plannedMinutes: method?.rules.study.fixedMinutes ?? sel.minutes,
    };
  };

  const saveVolume = useRef<ReturnType<typeof setTimeout> | null>(null);
  function onVolume(v: number) {
    setVolume(v);
    if (saveVolume.current) clearTimeout(saveVolume.current);
    saveVolume.current = setTimeout(() => void updateProfileAction({ alarmVolume: v }), 600);
  }

  const breakInfo = state.lastSession?.nextBreak;
  const toleranceLeft = brk ? Math.max(0, brk.toleranceSeconds - overtime) : 0;
  const [settingsOpen, setSettingsOpen] = useState(false);

  // Atalhos de teclado (Configurações): nesta tela, o cronômetro executa com a seleção atual.
  const onShortcut = useRef<(a: ShortcutAction) => boolean>(() => false);
  useEffect(() => {
    onShortcut.current = (a) => {
      if (pending) return true;
      if (a === "start") {
        if (mode === "idle" && sel.topicId) void act(() => startSessionAction(startInput()));
        else if (mode === "paused" && session) void act(() => resumeSessionAction(session.id));
        else if ((mode === "break" || mode === "break_over") && brk && sel.topicId) void act(() => finishBreakAction(brk.id, startInput()));
        return true;
      }
      if (a === "pause") {
        if ((mode === "study" || mode === "overtime") && session) void act(() => pauseSessionAction(session.id));
        else if (mode === "paused" && session) void act(() => resumeSessionAction(session.id));
        return true;
      }
      if ((mode === "study" || mode === "overtime" || mode === "paused") && session)
        void act(() => finishSessionAction(session.id, { startBreak: true, breakMinutes: sel.breakMinutes }));
      else if ((mode === "break" || mode === "break_over") && brk) void act(() => finishBreakAction(brk.id));
      else if (mode === "idle" && state.lastSession?.canStartBreak && breakInfo)
        void act(() => startBreakAction(breakInfo.fixedMinutes ?? sel.breakMinutes));
      return true;
    };
  });
  useEffect(() => {
    const handler = (e: Event) => {
      const action = (e as CustomEvent<{ action: ShortcutAction }>).detail?.action;
      if (action && onShortcut.current(action)) e.preventDefault();
    };
    window.addEventListener(SHORTCUT_EVENT, handler);
    return () => window.removeEventListener(SHORTCUT_EVENT, handler);
  }, []);

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
      <section aria-label={t.study.timerLabel} className="rounded-xl border border-border bg-surface p-6 sm:p-8">
        <StatusBadge mode={mode} />
        {session && (
          <p className="mt-3 text-sm text-text-2">
            <span className="mr-1.5 inline-block h-2.5 w-2.5 rounded-full align-middle" style={{ background: session.category.color }} />
            {session.category.name} · <span className="font-medium text-text">{session.topic.name}</span> ·{" "}
            {methodName(session.method.id, session.method.name)}
            {session.method.id === "pomodoro_classic" && ` · ${t.study.cycle(session.cycleIndex, 4)}`}
          </p>
        )}
        {brk && (
          <p className="mt-3 text-sm text-text-2">
            {t.study.breakInfo(brk.kind === "long", Math.round(brk.plannedSeconds / 60))}
          </p>
        )}

        <ClockRing
          mode={mode}
          progress={planned ? Math.min(1, elapsed / planned) : 0}
          main={mode === "idle" ? formatClock((method?.rules.study.fixedMinutes ?? sel.minutes) * 60) : overtime > 0 ? formatClock(overtime) : formatClock(remaining)}
          prefix={overtime > 0 ? "+" : ""}
          caption={
            mode === "overtime"
              ? t.study.captionOvertime(formatDuration(elapsed))
              : mode === "break_over"
                ? toleranceLeft > 0
                  ? t.study.captionBreakTolerance(Math.ceil(toleranceLeft), brk!.penaltyXp)
                  : t.study.captionBreakOver(brk!.penaltyXp)
                : mode === "idle"
                  ? t.study.captionIdle
                  : mode === "paused"
                    ? t.study.captionPaused
                    : session
                      ? t.study.captionRemaining(formatDuration(elapsed))
                      : t.study.captionBreak
          }
        />

        {error && (
          <div className="mx-auto mt-4 max-w-md">
            <Alert>{error}</Alert>
          </div>
        )}

        <div className="mt-6 flex flex-wrap justify-center gap-3">
          {mode === "idle" && (
            <Button size="lg" disabled={pending || !sel.topicId} onClick={() => act(() => startSessionAction(startInput()))}>
              {t.study.start}
            </Button>
          )}
          {(mode === "study" || mode === "overtime") && session && (
            <>
              <Button size="lg" variant="secondary" disabled={pending} onClick={() => act(() => pauseSessionAction(session.id))}>
                {t.study.pause}
              </Button>
              <Button
                size="lg"
                disabled={pending}
                onClick={() => act(() => finishSessionAction(session.id, { startBreak: true, breakMinutes: sel.breakMinutes }))}
              >
                {t.study.startBreak}
              </Button>
              <Button size="lg" variant="secondary" disabled={pending} onClick={() => act(() => finishSessionAction(session.id))}>
                {t.study.finish}
              </Button>
            </>
          )}
          {mode === "paused" && session && (
            <>
              <Button size="lg" disabled={pending} onClick={() => act(() => resumeSessionAction(session.id))}>
                {t.study.resume}
              </Button>
              <Button size="lg" variant="secondary" disabled={pending} onClick={() => act(() => finishSessionAction(session.id))}>
                {t.study.finish}
              </Button>
            </>
          )}
          {(mode === "break" || mode === "break_over") && brk && (
            <>
              <Button size="lg" disabled={pending || !sel.topicId} onClick={() => act(() => finishBreakAction(brk.id, startInput()))}>
                {t.study.backToStudy}
              </Button>
              <Button size="lg" variant="secondary" disabled={pending} onClick={() => act(() => finishBreakAction(brk.id))}>
                {mode === "break" ? t.study.endBreakEarly : t.study.endBreak}
              </Button>
            </>
          )}
          {ringing && (
            <Button size="lg" variant="ghost" onClick={() => setMuted(activeId)}>
              {t.study.mute}
            </Button>
          )}
          {inOvertime && !ringing && (
            <Button size="lg" variant="ghost" onClick={() => setMuted(null)}>
              {t.study.playAgain}
            </Button>
          )}
        </div>

        {ringing && alarm.blocked && (
          <div className="mx-auto mt-4 flex max-w-md flex-wrap items-center justify-center gap-3">
            <Alert tone="warn">{t.study.audioBlocked}</Alert>
            <Button size="sm" onClick={() => void playAlarm(true)}>
              {t.study.enableAlarm}
            </Button>
          </div>
        )}

        {mode === "idle" && state.lastSession && <LastSessionCard last={state.lastSession} lastBreak={state.lastBreak} />}
        {mode === "idle" && state.lastSession?.canStartBreak && breakInfo && (
          <div className="mx-auto mt-4 flex max-w-md flex-wrap items-end justify-center gap-3 rounded-lg bg-surface-2 p-4">
            {breakInfo.fixedMinutes == null ? (
              <div className="w-32">
                <Label htmlFor="break-min">{t.study.breakMinutes}</Label>
                <MinutesInput id="break-min" value={sel.breakMinutes} min={breakInfo.min} max={breakInfo.max} onChange={(v) => setSel((s) => ({ ...s, breakMinutes: v }))} />
              </div>
            ) : (
              <p className="text-sm font-medium text-text-2">{t.study.fixedBreak(breakInfo.kind === "long", breakInfo.fixedMinutes)}</p>
            )}
            <Button disabled={pending} variant="secondary" onClick={() => act(() => startBreakAction(breakInfo.fixedMinutes ?? sel.breakMinutes))}>
              {t.study.startBreak}
            </Button>
          </div>
        )}
      </section>

      <aside className="space-y-4">
        <div className="rounded-xl border border-border bg-surface p-5">
          <h2 className="mb-4 font-semibold">{mode === "idle" ? t.study.configure : brk ? t.study.nextSession : t.study.currentSession}</h2>
          <fieldset disabled={!!session} className="space-y-4 disabled:opacity-60">
            {kinds.length > 1 && (
              <div role="radiogroup" aria-label={t.study.kindGroup} className="grid grid-cols-2 gap-1 rounded-lg bg-surface-2 p-1">
                {kinds.map((k) => (
                  <button
                    key={k}
                    type="button"
                    role="radio"
                    aria-checked={kind === k}
                    onClick={() => {
                      if (kind === k) return;
                      const c = categories.find((x) => x.kind === k);
                      if (c) setSel((s) => ({ ...s, categoryId: c.id, topicId: c.topics[0]?.id ?? "" }));
                    }}
                    className={cx(
                      "rounded-md px-2 py-1.5 text-sm font-medium",
                      kind === k ? "bg-surface text-text shadow-sm" : "text-text-2 hover:text-text",
                    )}
                  >
                    {k === "study" ? t.categories.modes.study : t.categories.modes.projects}
                  </button>
                ))}
              </div>
            )}
            <div>
              <Label htmlFor="cat">{kind === "project" ? t.study.project : t.study.category}</Label>
              <Select
                id="cat"
                value={sel.categoryId}
                onChange={(e) => {
                  const c = categories.find((x) => x.id === e.target.value);
                  setSel((s) => ({ ...s, categoryId: e.target.value, topicId: c?.topics[0]?.id ?? "" }));
                }}
              >
                {groups.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </Select>
            </div>
            <div>
              <Label htmlFor="topic">{kind === "project" ? t.study.task : t.study.topic}</Label>
              {kind === "project" ? (
                <Select id="topic" value={sel.topicId} onChange={(e) => setSel((s) => ({ ...s, topicId: e.target.value }))}>
                  {currentTopics.map((tp) => (
                    <option key={tp.id} value={tp.id}>
                      {tp.name}
                    </option>
                  ))}
                </Select>
              ) : currentTopics.length > 0 && !addingTopic ? (
                <Select
                  id="topic"
                  value={sel.topicId}
                  onChange={(e) => {
                    if (e.target.value === NEW_TOPIC) setAddingTopic(true);
                    else setSel((s) => ({ ...s, topicId: e.target.value }));
                  }}
                >
                  {currentTopics.map((tp) => (
                    <option key={tp.id} value={tp.id}>
                      {tp.name}
                    </option>
                  ))}
                  <option value={NEW_TOPIC}>{t.study.newTopicOption}</option>
                </Select>
              ) : (
                <QuickTopic
                  categoryId={sel.categoryId}
                  first={currentTopics.length === 0}
                  onCancel={currentTopics.length > 0 ? () => setAddingTopic(false) : undefined}
                  onCreated={(topicId) => {
                    setAddingTopic(false);
                    setSel((s) => ({ ...s, topicId }));
                    router.refresh();
                  }}
                />
              )}
            </div>
            <div>
              <span className="mb-1.5 block text-sm font-medium text-text-2">{t.study.method}</span>
              <div role="radiogroup" aria-label={t.study.methodGroup} className="space-y-2">
                {methods.map((m) => (
                  <button
                    key={m.id}
                    type="button"
                    role="radio"
                    aria-checked={sel.methodId === m.id}
                    onClick={() =>
                      setSel((s) => ({
                        ...s,
                        methodId: m.id,
                        minutes: m.rules.study.fixedMinutes ?? (m.rules.study.presets.includes(s.minutes) ? s.minutes : m.rules.study.presets[0]),
                        breakMinutes: m.rules.break.fixedMinutes ?? m.rules.break.presets[0],
                      }))
                    }
                    className={cx(
                      "w-full rounded-lg border p-3 text-left text-sm transition",
                      sel.methodId === m.id ? "border-accent bg-accent-soft" : "border-border hover:bg-surface-2",
                    )}
                  >
                    <span className="font-medium">{methodName(m.id, m.name)}</span>
                    <span className="mt-0.5 block text-xs text-text-2">{t.methods[m.id]?.description ?? m.description}</span>
                  </button>
                ))}
              </div>
            </div>
            {method && method.rules.study.fixedMinutes == null && (
              <div>
                <Label htmlFor="minutes">{t.study.studyMinutes}</Label>
                <div className="mb-2 flex flex-wrap gap-2">
                  {method.rules.study.presets.map((p) => (
                    <button
                      key={p}
                      type="button"
                      onClick={() => setSel((s) => ({ ...s, minutes: p }))}
                      className={cx("h-8 rounded-md border px-3 text-sm", sel.minutes === p ? "border-accent bg-accent-soft text-link" : "border-border")}
                    >
                      {p}
                    </button>
                  ))}
                </div>
                <MinutesInput id="minutes" value={sel.minutes} min={method.rules.study.minMinutes} max={method.rules.study.maxMinutes} onChange={(v) => setSel((s) => ({ ...s, minutes: v }))} />
                <p className="mt-1 text-xs text-text-3">
                  {t.study.xpRange(method.rules.xp.minEligibleMinutes, method.rules.xp.maxEligibleMinutes)}
                </p>
              </div>
            )}
            {method && method.rules.break.fixedMinutes == null && (
              <div>
                <Label htmlFor="break">{t.study.breakDuration}</Label>
                <MinutesInput id="break" value={sel.breakMinutes} min={method.rules.break.minMinutes} max={method.rules.break.maxMinutes} onChange={(v) => setSel((s) => ({ ...s, breakMinutes: v }))} />
              </div>
            )}
          </fieldset>
        </div>

        {/* Configurações: alarme e atalhos de teclado. */}
        <div className="rounded-xl border border-border bg-surface">
          <button
            type="button"
            aria-expanded={settingsOpen}
            onClick={() => setSettingsOpen((v) => !v)}
            className="flex w-full items-center justify-between gap-2 px-5 py-4 text-left font-semibold"
          >
            <span className="flex items-center gap-2">
              <svg aria-hidden viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="3" />
                <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1Z" />
              </svg>
              {t.study.settings}
            </span>
            <span aria-hidden className="text-text-3">{settingsOpen ? "−" : "+"}</span>
          </button>
          {settingsOpen && (
            <div className="space-y-5 border-t border-border px-5 py-4">
              <section>
                <h3 className="mb-2 text-sm font-semibold">{t.study.alarm}</h3>
                <Label htmlFor="volume">{t.study.volume(volume)}</Label>
                <input id="volume" type="range" min={0} max={100} value={volume} onChange={(e) => onVolume(Number(e.target.value))} className="w-full accent-[var(--accent)]" />
                <Button variant="secondary" size="sm" className="mt-3" onClick={() => void (ringing ? playAlarm(true) : playAlarm(false))}>
                  {t.study.testAudio}
                </Button>
              </section>
              <section>
                <h3 className="mb-1 text-sm font-semibold">{t.study.shortcutsTitle}</h3>
                <p className="mb-3 text-xs text-text-3">{t.study.shortcutsHint}</p>
                <ShortcutEditor />
              </section>
            </div>
          )}
        </div>
      </aside>
    </div>
  );
}

/** Cria um tema na categoria selecionada sem sair do cronômetro. */
function QuickTopic({
  categoryId,
  first,
  onCreated,
  onCancel,
}: {
  categoryId: string;
  first: boolean;
  onCreated: (topicId: string) => void;
  onCancel?: () => void;
}) {
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const { t } = useI18n();
  return (
    <form
      className="space-y-2"
      onSubmit={(e) => {
        e.preventDefault();
        if (!name.trim() || !categoryId) return;
        start(async () => {
          const res = await createTopicAction({ categoryId, name });
          if (res.ok && res.data) {
            setName("");
            onCreated(res.data.id);
          } else if (!res.ok) setError(res.error);
        });
      }}
    >
      {first && <p className="text-xs text-text-2">{t.study.quickTopicFirst}</p>}
      <div className="flex gap-2">
        <Input
          id="topic"
          autoFocus
          placeholder={t.study.quickTopicPlaceholder}
          value={name}
          maxLength={80}
          onChange={(e) => setName(e.target.value)}
        />
        <Button type="submit" size="md" disabled={pending || !name.trim()} className="shrink-0">
          {t.common.create}
        </Button>
      </div>
      {error && <p className="text-xs text-danger">{error}</p>}
      {onCancel && (
        <button type="button" className="text-xs text-text-2 underline" onClick={onCancel}>
          {t.common.cancel}
        </button>
      )}
    </form>
  );
}

function MinutesInput({ id, value, min, max, onChange }: { id: string; value: number; min: number; max: number; onChange: (v: number) => void }) {
  return (
    <input
      id={id}
      type="number"
      inputMode="numeric"
      min={min}
      max={max}
      value={Number.isFinite(value) ? value : ""}
      onChange={(e) => onChange(Math.max(min, Math.min(max, Math.round(Number(e.target.value) || min))))}
      className="h-10 w-full rounded-lg border border-border bg-surface px-3 text-sm tabular"
    />
  );
}

function StatusBadge({ mode }: { mode: "idle" | "study" | "overtime" | "paused" | "break" | "break_over" }) {
  const { t } = useI18n();
  const cls: Record<typeof mode, string> = {
    idle: "bg-surface-2 text-text-2",
    study: "bg-accent-soft text-link",
    overtime: "bg-warn-soft text-warn",
    paused: "bg-surface-2 text-text-2",
    break: "bg-good-soft text-good",
    break_over: "bg-danger-soft text-danger",
  };
  const s = { label: t.study.status[mode], cls: cls[mode] };
  return (
    <span role="status" className={cx("inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold", s.cls)}>
      <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-current" />
      {s.label}
    </span>
  );
}

function ClockRing({ mode, progress, main, prefix, caption }: { mode: string; progress: number; main: string; prefix: string; caption: string }) {
  const r = 120;
  const c = 2 * Math.PI * r;
  const color =
    mode === "overtime" ? "var(--warn)" : mode === "break" ? "var(--break)" : mode === "break_over" ? "var(--danger)" : mode === "paused" ? "var(--text-3)" : "var(--accent)";
  return (
    <div className="relative mx-auto mt-6 aspect-square w-full max-w-[300px]">
      <svg viewBox="0 0 280 280" className="h-full w-full -rotate-90" aria-hidden>
        <circle cx="140" cy="140" r={r} fill="none" stroke="var(--surface-2)" strokeWidth="12" />
        <circle
          cx="140"
          cy="140"
          r={r}
          fill="none"
          stroke={color}
          strokeWidth="12"
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - progress)}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
        <span className="tabular font-mono text-5xl font-semibold sm:text-6xl" aria-live="off">
          {prefix}
          {main}
        </span>
        <span className="mt-2 max-w-[200px] text-xs text-text-2">{caption}</span>
      </div>
    </div>
  );
}

function LastSessionCard({ last, lastBreak }: { last: NonNullable<TimerState["lastSession"]>; lastBreak: TimerState["lastBreak"] }) {
  const breakAfter = lastBreak && Date.parse(lastBreak.endedAt) >= Date.parse(last.endedAt) ? lastBreak : null;
  const { t } = useI18n();
  return (
    <div className="mx-auto mt-6 max-w-md space-y-2">
      <div className="rounded-lg border border-border p-4 text-sm">
        <p className="font-medium">
          {last.status === "abandoned" ? t.study.lastAuto : t.study.last}:{" "}
          <span className="tabular">{t.study.studied(formatDuration(last.activeSeconds))}</span>
          {last.overtimeSeconds > 0 && <span className="text-text-2"> {t.study.includingOvertime(formatDuration(last.overtimeSeconds))}</span>}
        </p>
        {last.pausedSeconds > 0 && (
          <p className="mt-1 text-text-2 tabular">{t.study.paused(formatDuration(last.pausedSeconds))}</p>
        )}
        <p className="mt-1 text-text-2">
          {last.xpAwarded > 0 ? t.study.xpEarned(last.xpAwarded) : last.completed ? t.study.outOfRange : t.study.notCompleted}
        </p>
      </div>
      {breakAfter && breakAfter.penaltyXp > 0 && (
        <Alert tone="warn">{t.study.breakPenalty(formatClock(breakAfter.overrunSeconds), breakAfter.penaltyXp)}</Alert>
      )}
    </div>
  );
}
