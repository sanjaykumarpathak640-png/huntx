"use client";
import { forwardRef, useEffect } from "react";
import { Loader2, X } from "lucide-react";
import { cn } from "@/lib/utils";

/* ---------- Button ---------- */
type Variant = "primary" | "secondary" | "ghost" | "danger" | "outline" | "cyan";
const variants: Record<Variant, string> = {
  primary:
    "bg-neon text-ink-950 hover:bg-neon-glow shadow-[0_0_24px_-6px_rgba(57,255,136,.7)] font-semibold",
  cyan: "bg-cyan text-ink-950 hover:bg-cyan-soft shadow-[0_0_24px_-6px_rgba(34,211,238,.7)] font-semibold",
  secondary: "bg-white/[0.06] text-slate-100 hover:bg-white/[0.1] border border-white/10",
  outline: "border border-neon/40 text-neon hover:bg-neon/10",
  ghost: "text-slate-300 hover:bg-white/[0.06]",
  danger: "bg-danger/15 text-danger border border-danger/40 hover:bg-danger/25",
};
const sizes = { sm: "h-8 px-3 text-xs", md: "h-10 px-4 text-sm", lg: "h-12 px-6 text-base" };

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: keyof typeof sizes;
  loading?: boolean;
}
export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { className, variant = "secondary", size = "md", loading, disabled, children, ...props },
  ref,
) {
  return (
    <button
      ref={ref}
      disabled={disabled || loading}
      className={cn(
        "inline-flex select-none items-center justify-center gap-2 rounded-xl transition-all duration-150 active:scale-[.98] disabled:pointer-events-none disabled:opacity-40",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neon/60 focus-visible:ring-offset-2 focus-visible:ring-offset-ink-950",
        variants[variant],
        sizes[size],
        className,
      )}
      {...props}
    >
      {loading && <Loader2 className="h-4 w-4 animate-spin" />}
      {children}
    </button>
  );
});

/* ---------- Card ---------- */
export function Card({ className, children, ...p }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn("glass min-w-0 p-4 sm:p-5", className)} {...p}>
      {children}
    </div>
  );
}
export function CardHeader({ title, subtitle, icon, action }: { title: React.ReactNode; subtitle?: React.ReactNode; icon?: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div className="mb-4 flex items-start justify-between gap-3">
      <div className="flex items-start gap-3">
        {icon && <div className="mt-0.5 rounded-lg border border-white/10 bg-white/[0.04] p-2 text-neon">{icon}</div>}
        <div>
          <h3 className="font-display text-base font-semibold text-slate-100">{title}</h3>
          {subtitle && <p className="mt-0.5 text-xs text-slate-500">{subtitle}</p>}
        </div>
      </div>
      {action}
    </div>
  );
}

/* ---------- Badge ---------- */
type Tone = "neon" | "cyan" | "amber" | "danger" | "slate" | "violet";
const tones: Record<Tone, string> = {
  neon: "bg-neon/10 text-neon border-neon/30",
  cyan: "bg-cyan/10 text-cyan border-cyan/30",
  amber: "bg-amber/10 text-amber border-amber/30",
  danger: "bg-danger/10 text-danger border-danger/30",
  slate: "bg-white/5 text-slate-400 border-white/10",
  violet: "bg-violet-400/10 text-violet-300 border-violet-400/30",
};
export function Badge({ tone = "slate", className, children, dot }: { tone?: Tone; className?: string; children: React.ReactNode; dot?: boolean }) {
  return (
    <span className={cn("inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11px] font-medium", tones[tone], className)}>
      {dot && <span className="h-1.5 w-1.5 rounded-full bg-current" />}
      {children}
    </span>
  );
}

export const statusTone: Record<string, Tone> = {
  live: "neon",
  upcoming: "cyan",
  paused: "amber",
  ended: "slate",
  draft: "slate",
  active: "neon",
  finished: "cyan",
  disabled: "slate",
  disqualified: "danger",
  pending: "amber",
  approved: "neon",
  rejected: "danger",
  flagged: "danger",
  retake_requested: "violet",
  info: "cyan",
  success: "neon",
  warning: "amber",
  critical: "danger",
};

/* ---------- Inputs ---------- */
const fieldBase =
  "w-full rounded-xl border border-white/10 bg-ink-900/80 px-3.5 text-base sm:text-sm text-slate-100 placeholder:text-slate-600 transition focus:border-neon/50 focus:outline-none focus:ring-2 focus:ring-neon/20 disabled:opacity-50";

export const Input = forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(function Input({ className, ...p }, ref) {
  return <input ref={ref} className={cn(fieldBase, "h-11", className)} {...p} />;
});
export const Textarea = forwardRef<HTMLTextAreaElement, React.TextareaHTMLAttributes<HTMLTextAreaElement>>(function Textarea({ className, ...p }, ref) {
  return <textarea ref={ref} className={cn(fieldBase, "min-h-[90px] py-2.5", className)} {...p} />;
});
export const Select = forwardRef<HTMLSelectElement, React.SelectHTMLAttributes<HTMLSelectElement>>(function Select({ className, children, ...p }, ref) {
  return (
    <select ref={ref} className={cn(fieldBase, "h-11 appearance-none pr-8", className)} {...p}>
      {children}
    </select>
  );
});

export function Field({ label, hint, children, className }: { label: string; hint?: React.ReactNode; children: React.ReactNode; className?: string }) {
  return (
    <label className={cn("block", className)}>
      <span className="mb-1.5 block text-xs font-medium text-slate-400">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-[11px] text-slate-600">{hint}</span>}
    </label>
  );
}

export function Switch({ checked, onChange, label, description, disabled }: { checked: boolean; onChange: (v: boolean) => void; label?: string; description?: string; disabled?: boolean }) {
  return (
    <label className={cn("flex cursor-pointer items-start justify-between gap-4", disabled && "opacity-50")}>
      {(label || description) && (
        <span>
          {label && <span className="block text-sm text-slate-200">{label}</span>}
          {description && <span className="block text-xs text-slate-500">{description}</span>}
        </span>
      )}
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={cn(
          "relative mt-0.5 h-6 w-11 shrink-0 rounded-full border transition",
          checked ? "border-neon/50 bg-neon/30" : "border-white/10 bg-white/5",
        )}
      >
        <span className={cn("absolute top-0.5 h-4.5 h-[18px] w-[18px] rounded-full transition-all", checked ? "left-[22px] bg-neon" : "left-0.5 bg-slate-500")} />
      </button>
    </label>
  );
}

/* ---------- Modal ---------- */
export function Modal({
  open,
  onClose,
  title,
  children,
  wide,
  footer,
}: {
  open: boolean;
  onClose: () => void;
  title?: React.ReactNode;
  children: React.ReactNode;
  wide?: boolean;
  footer?: React.ReactNode;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[80] flex items-end justify-center bg-black/70 backdrop-blur-sm sm:items-center sm:p-4" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        onClick={(e) => e.stopPropagation()}
        className={cn(
          "glass-strong flex max-h-[92dvh] w-full animate-rise flex-col rounded-b-none sm:rounded-2xl",
          wide ? "sm:max-w-4xl" : "sm:max-w-lg",
        )}
      >
        <div className="flex items-center justify-between border-b border-white/5 px-5 py-4">
          <h2 className="font-display text-lg font-semibold text-slate-100">{title}</h2>
          <button onClick={onClose} aria-label="Close" className="rounded-lg p-1 text-slate-500 hover:bg-white/5 hover:text-slate-200">
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-5 py-4">{children}</div>
        {footer && <div className="flex justify-end gap-2 border-t border-white/5 px-5 py-3">{footer}</div>}
      </div>
    </div>
  );
}

/* ---------- Misc ---------- */
export function Stat({ label, value, sub, icon, accent = "text-slate-100", className }: { label: string; value: React.ReactNode; sub?: React.ReactNode; icon?: React.ReactNode; accent?: string; className?: string }) {
  return (
    <div className={cn("glass min-w-0 p-4", className)}>
      <div className="flex items-center justify-between">
        <span className="hud-label">{label}</span>
        {icon && <span className="text-slate-600">{icon}</span>}
      </div>
      <div className={cn("mt-2 font-display text-2xl font-semibold tabular-nums", accent)}>{value}</div>
      {sub && <div className="mt-0.5 text-xs text-slate-500">{sub}</div>}
    </div>
  );
}

export function Spinner({ className }: { className?: string }) {
  return <Loader2 className={cn("h-5 w-5 animate-spin text-neon", className)} />;
}

export function Empty({ icon, title, body, action }: { icon?: React.ReactNode; title: string; body?: string; action?: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-white/10 px-6 py-12 text-center">
      {icon && <div className="mb-3 text-slate-600">{icon}</div>}
      <p className="font-display text-sm font-semibold text-slate-300">{title}</p>
      {body && <p className="mt-1 max-w-sm text-xs text-slate-500">{body}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function Logo({ className }: { className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-2 font-display text-lg font-bold tracking-tight text-white", className)}>
      <svg viewBox="0 0 32 32" className="h-7 w-7" aria-hidden>
        <circle cx="16" cy="16" r="13" fill="none" stroke="#39ff88" strokeWidth="1.6" strokeDasharray="4 3" />
        <circle cx="16" cy="16" r="6" fill="none" stroke="#22d3ee" strokeWidth="1.6" />
        <path d="M16 1v8M16 23v8M1 16h8M23 16h8" stroke="#39ff88" strokeWidth="1.6" strokeLinecap="round" />
        <circle cx="16" cy="16" r="1.8" fill="#39ff88" />
      </svg>
      <span>
        Hunt<span className="text-neon">X</span>
      </span>
    </span>
  );
}
