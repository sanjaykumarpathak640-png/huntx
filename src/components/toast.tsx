"use client";
import { createContext, useCallback, useContext, useState } from "react";
import { AlertTriangle, CheckCircle2, Info, X, XCircle } from "lucide-react";
import { cn } from "@/lib/utils";

type Kind = "info" | "success" | "warning" | "error";
interface Toast {
  id: number;
  kind: Kind;
  title: string;
  body?: string;
}
const Ctx = createContext<(t: Omit<Toast, "id">) => void>(() => {});

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const push = useCallback((t: Omit<Toast, "id">) => {
    const id = Date.now() + Math.random();
    setToasts((x) => [...x.slice(-4), { ...t, id }]);
    setTimeout(() => setToasts((x) => x.filter((y) => y.id !== id)), t.kind === "error" ? 7000 : 4500);
  }, []);
  const Icon = { info: Info, success: CheckCircle2, warning: AlertTriangle, error: XCircle };
  const tone = {
    info: "border-cyan/30 text-cyan",
    success: "border-neon/30 text-neon",
    warning: "border-amber/40 text-amber",
    error: "border-danger/40 text-danger",
  };
  return (
    <Ctx.Provider value={push}>
      {children}
      <div className="pointer-events-none fixed inset-x-0 top-3 z-[100] flex flex-col items-center gap-2 px-3 sm:items-end sm:pr-5">
        {toasts.map((t) => {
          const I = Icon[t.kind];
          return (
            <div
              key={t.id}
              role="status"
              className={cn(
                "glass-strong pointer-events-auto flex w-full max-w-sm animate-rise items-start gap-3 px-4 py-3",
                tone[t.kind],
              )}
            >
              <I className="mt-0.5 h-4 w-4 shrink-0" />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-slate-100">{t.title}</p>
                {t.body && <p className="mt-0.5 text-xs text-slate-400">{t.body}</p>}
              </div>
              <button
                aria-label="Dismiss"
                onClick={() => setToasts((x) => x.filter((y) => y.id !== t.id))}
                className="text-slate-500 hover:text-slate-300"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          );
        })}
      </div>
    </Ctx.Provider>
  );
}

export const useToast = () => useContext(Ctx);
