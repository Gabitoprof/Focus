"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import {
  finishBreakAction,
  finishSessionAction,
  getTimerStateAction,
  pauseSessionAction,
  resumeSessionAction,
  startBreakAction,
  startSessionAction,
} from "@/app/actions/timer";
import type { ActionResult } from "@/app/actions/result";
import { subjectFromSelection } from "@/domain/contexts";
import { useI18n } from "@/i18n/client";
import type { TimerState } from "@/server/services/timer";

/**
 * Atalhos de teclado do cronômetro. Valem em qualquer tela da Focus (com a aba em foco):
 * na tela do Foque o próprio cronômetro executa a ação; nas outras, este componente executa
 * direto no servidor e mostra um aviso. As combinações ficam salvas neste navegador.
 */
export const SHORTCUT_ACTIONS = ["start", "pause", "break"] as const;
export type ShortcutAction = (typeof SHORTCUT_ACTIONS)[number];
export type Shortcuts = Record<ShortcutAction, string>;

export const DEFAULT_SHORTCUTS: Shortcuts = { start: "Alt+Shift+S", pause: "Alt+Shift+P", break: "Alt+Shift+I" };
const STORAGE_KEY = "focus:shortcuts";
const CHANGED = "focus:shortcuts-changed";
/** Evento que o cronômetro escuta; se ele tratar (preventDefault), o atalho global não age. */
export const SHORTCUT_EVENT = "focus:shortcut";
const PREF_KEY = "focus:selection";

const subscribe = (cb: () => void) => {
  window.addEventListener("storage", cb);
  window.addEventListener(CHANGED, cb);
  return () => {
    window.removeEventListener("storage", cb);
    window.removeEventListener(CHANGED, cb);
  };
};
const read = () => {
  try {
    return localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
};

export function useShortcuts(): [Shortcuts, (next: Shortcuts) => void] {
  const raw = useSyncExternalStore(subscribe, read, () => null);
  let value = DEFAULT_SHORTCUTS;
  try {
    const parsed = JSON.parse(raw ?? "null");
    if (parsed && typeof parsed === "object") value = { ...DEFAULT_SHORTCUTS, ...parsed };
  } catch {}
  const save = useCallback((next: Shortcuts) => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch {}
    window.dispatchEvent(new Event(CHANGED));
  }, []);
  return [value, save];
}

/** "Alt+Shift+S" a partir do evento (pela tecla física, então não depende do idioma do teclado). */
export function comboFromEvent(e: KeyboardEvent | React.KeyboardEvent): string | null {
  const code = e.code;
  if (!code || /^(Shift|Control|Alt|Meta|OS)(Left|Right)?$/.test(code)) return null;
  const key = code.startsWith("Key") ? code.slice(3) : code.startsWith("Digit") ? code.slice(5) : code === "Space" ? "Espaço" : code;
  const mods = [e.ctrlKey && "Ctrl", e.altKey && "Alt", e.shiftKey && "Shift", e.metaKey && "Meta"].filter(Boolean);
  return [...mods, key].join("+");
}

/** Precisa de Ctrl, Alt ou Meta (só Shift + letra atrapalharia quem está digitando). */
export const hasModifier = (combo: string) => /(^|\+)(Ctrl|Alt|Meta)\+/.test(combo);

type Sel = { categoryId: string; topicId: string; methodId: string; minutes: number; breakMinutes: number };
function readSelection(): Sel | null {
  try {
    return JSON.parse(localStorage.getItem(PREF_KEY) ?? "null");
  } catch {
    return null;
  }
}

/** Ouve os atalhos em toda a área logada. */
export function GlobalTimerShortcuts() {
  const [shortcuts] = useShortcuts();
  const router = useRouter();
  const { t } = useI18n();
  const T = t.study.shortcutToast;
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    if (!toast) return;
    const id = setTimeout(() => setToast(null), 3500);
    return () => clearTimeout(id);
  }, [toast]);

  useEffect(() => {
    const run = async (action: ShortcutAction) => {
      const res = await getTimerStateAction();
      if (!res.ok) return setToast(res.error);
      const s: TimerState = res.data;
      const sel = readSelection();
      const startInput = () => {
        const subject = sel ? subjectFromSelection(sel.categoryId, sel.topicId) : null;
        if (!subject || !sel) return null;
        return {
          ...(subject.kind === "project" ? { projectId: subject.projectId, taskId: subject.taskId } : { topicId: subject.topicId }),
          methodId: sel.methodId,
          plannedMinutes: sel.minutes,
        };
      };
      let call: (() => Promise<ActionResult<TimerState>>) | null = null;
      let done = "";
      if (action === "start") {
        if (s.session?.status === "paused") [call, done] = [() => resumeSessionAction(s.session!.id), T.resumed];
        else if (s.session) return setToast(T.alreadyRunning);
        else {
          const input = startInput();
          if (!input) return setToast(T.noTopic);
          if (s.break) [call, done] = [() => finishBreakAction(s.break!.id, input), T.backToStudy];
          else [call, done] = [() => startSessionAction(input), T.started];
        }
      } else if (action === "pause") {
        if (s.session?.status === "running") [call, done] = [() => pauseSessionAction(s.session!.id), T.paused];
        else if (s.session?.status === "paused") [call, done] = [() => resumeSessionAction(s.session!.id), T.resumed];
        else return setToast(T.nothing);
      } else {
        if (s.session) [call, done] = [() => finishSessionAction(s.session!.id, { startBreak: true, breakMinutes: sel?.breakMinutes }), T.breakStarted];
        else if (s.break) [call, done] = [() => finishBreakAction(s.break!.id), T.breakEnded];
        else if (s.lastSession?.canStartBreak) {
          const fixed = s.lastSession.nextBreak.fixedMinutes;
          [call, done] = [() => startBreakAction(fixed ?? sel?.breakMinutes ?? 5), T.breakStarted];
        } else return setToast(T.nothing);
      }
      const out = await call();
      setToast(out.ok ? done : out.error);
      if (out.ok) router.refresh();
    };

    const onKey = (e: KeyboardEvent) => {
      if (e.repeat) return;
      const combo = comboFromEvent(e);
      if (!combo) return;
      const action = SHORTCUT_ACTIONS.find((a) => shortcuts[a] === combo);
      if (!action) return;
      e.preventDefault();
      const ev = new CustomEvent(SHORTCUT_EVENT, { detail: { action }, cancelable: true });
      window.dispatchEvent(ev);
      if (!ev.defaultPrevented) void run(action).catch(() => setToast(t.common.offline));
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [shortcuts, router, T, t.common.offline]);

  return toast ? (
    <div role="status" className="fixed bottom-20 left-1/2 z-50 -translate-x-1/2 rounded-full border border-border bg-surface px-4 py-2 text-sm shadow-lg md:bottom-6">
      {toast}
    </div>
  ) : null;
}

/** Editor dos atalhos (fica em Configurações, na tela do Foque). */
export function ShortcutEditor() {
  const [shortcuts, save] = useShortcuts();
  const { t } = useI18n();
  const S = t.study;
  const [recording, setRecording] = useState<ShortcutAction | null>(null);
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="space-y-2">
      {SHORTCUT_ACTIONS.map((a) => {
        const dup = SHORTCUT_ACTIONS.some((o) => o !== a && shortcuts[o] === shortcuts[a]);
        return (
          <div key={a} className="flex items-center justify-between gap-2">
            <span className="text-sm">{S.shortcutActions[a]}</span>
            <button
              type="button"
              aria-label={S.shortcutChange(S.shortcutActions[a])}
              onClick={() => {
                setError(null);
                setRecording(recording === a ? null : a);
              }}
              onKeyDown={(e) => {
                if (recording !== a) return;
                e.preventDefault();
                e.stopPropagation();
                if (e.key === "Escape") return setRecording(null);
                const combo = comboFromEvent(e);
                if (!combo) return;
                if (!hasModifier(combo)) return setError(S.shortcutNeedsModifier);
                save({ ...shortcuts, [a]: combo });
                setRecording(null);
                setError(null);
              }}
              onBlur={() => recording === a && setRecording(null)}
              className={
                "min-w-28 rounded-md border px-2 py-1 font-mono text-xs " +
                (recording === a ? "border-accent bg-accent-soft text-link" : dup ? "border-danger text-danger" : "border-border bg-surface-2")
              }
            >
              {recording === a ? S.shortcutPress : shortcuts[a]}
            </button>
          </div>
        );
      })}
      {error && <p className="text-xs text-danger">{error}</p>}
      {SHORTCUT_ACTIONS.some((a) => SHORTCUT_ACTIONS.some((o) => o !== a && shortcuts[o] === shortcuts[a])) && (
        <p className="text-xs text-danger">{S.shortcutConflict}</p>
      )}
      <button type="button" className="text-xs text-link hover:underline" onClick={() => save(DEFAULT_SHORTCUTS)}>
        {S.shortcutReset}
      </button>
    </div>
  );
}
