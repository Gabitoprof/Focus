"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { useI18n } from "@/i18n/client";
import { Button } from "./ui";

type ConfirmOptions = {
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  /** Ação destrutiva: botão de confirmação em vermelho. */
  danger?: boolean;
};

type Pending = ConfirmOptions & { resolve: (ok: boolean) => void };

const ConfirmContext = createContext<((o: ConfirmOptions) => Promise<boolean>) | null>(null);

/**
 * Caixa de confirmação da própria interface (substitui o `confirm()` nativo, que alguns
 * navegadores bloqueiam e que não segue a identidade visual).
 */
export function ConfirmProvider({ children }: { children: React.ReactNode }) {
  const [pending, setPending] = useState<Pending | null>(null);
  const { t } = useI18n();
  const dialogRef = useRef<HTMLDialogElement>(null);

  const confirm = useCallback(
    (o: ConfirmOptions) => new Promise<boolean>((resolve) => setPending({ ...o, resolve })),
    [],
  );

  useEffect(() => {
    const d = dialogRef.current;
    if (pending && d && !d.open) d.showModal();
  }, [pending]);

  const close = (ok: boolean) => {
    pending?.resolve(ok);
    dialogRef.current?.close();
    setPending(null);
  };

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      <dialog
        ref={dialogRef}
        aria-labelledby="confirm-title"
        aria-describedby="confirm-message"
        onCancel={(e) => {
          e.preventDefault();
          close(false);
        }}
        onClick={(e) => {
          // Clique fora da caixa (no fundo) cancela.
          if (e.target === dialogRef.current) close(false);
        }}
        className="m-auto w-[min(92vw,420px)] rounded-2xl border border-border bg-surface p-0 text-text shadow-2xl backdrop:bg-black/60"
      >
        {pending && (
          <div className="p-6">
            <h2 id="confirm-title" className="text-lg font-semibold">
              {pending.title}
            </h2>
            <p id="confirm-message" className="mt-2 text-sm text-text-2">
              {pending.message}
            </p>
            <div className="mt-6 flex justify-end gap-2">
              <Button variant="ghost" onClick={() => close(false)} autoFocus>
                {pending.cancelLabel ?? t.common.cancel}
              </Button>
              <Button
                variant={pending.danger ? "danger" : "primary"}
                className={pending.danger ? "border-danger bg-danger text-white hover:bg-danger hover:opacity-90" : undefined}
                onClick={() => close(true)}
              >
                {pending.confirmLabel ?? t.common.confirm}
              </Button>
            </div>
          </div>
        )}
      </dialog>
    </ConfirmContext.Provider>
  );
}

export function useConfirm() {
  const ctx = useContext(ConfirmContext);
  if (!ctx) throw new Error("useConfirm precisa estar dentro de <ConfirmProvider>.");
  return ctx;
}
