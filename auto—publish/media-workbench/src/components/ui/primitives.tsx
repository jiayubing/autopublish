import React from "react";

function cx(...values: Array<string | false | null | undefined>) {
  return values.filter(Boolean).join(" ");
}

type SurfaceProps = React.HTMLAttributes<HTMLDivElement>;

export function Surface({ className, ...props }: SurfaceProps) {
  return (
    <div
      className={cx(
        "rounded-xl border border-slate-200/80 bg-white shadow-[0_10px_30px_rgba(15,23,42,0.05)]",
        className,
      )}
      {...props}
    />
  );
}

type ButtonTone =
  | "primary"
  | "secondary"
  | "success"
  | "warning"
  | "danger"
  | "ghost";

type ButtonSize = "sm" | "md";

const BUTTON_TONES: Record<ButtonTone, string> = {
  primary:
    "border-blue-600 bg-blue-600 text-white hover:border-blue-700 hover:bg-blue-700 focus-visible:ring-blue-500/30",
  secondary:
    "border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:bg-slate-50 focus-visible:ring-slate-400/20",
  success:
    "border-emerald-600 bg-emerald-600 text-white hover:border-emerald-700 hover:bg-emerald-700 focus-visible:ring-emerald-500/25",
  warning:
    "border-amber-200 bg-amber-50 text-amber-800 hover:border-amber-300 hover:bg-amber-100 focus-visible:ring-amber-500/20",
  danger:
    "border-rose-200 bg-rose-50 text-rose-700 hover:border-rose-300 hover:bg-rose-100 focus-visible:ring-rose-500/20",
  ghost:
    "border-transparent bg-transparent text-slate-600 hover:bg-slate-100 hover:text-slate-900 focus-visible:ring-slate-400/20",
};

const BUTTON_SIZES: Record<ButtonSize, string> = {
  sm: "h-8 px-2.5 text-xs",
  md: "h-9 px-3 text-xs",
};

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  tone?: ButtonTone;
  size?: ButtonSize;
}

export function Button({
  tone = "secondary",
  size = "md",
  className,
  type = "button",
  ...props
}: ButtonProps) {
  return (
    <button
      type={type}
      className={cx(
        "inline-flex items-center justify-center gap-1.5 rounded-lg border font-semibold transition-colors focus-visible:outline-none focus-visible:ring-4 disabled:cursor-not-allowed disabled:opacity-40",
        BUTTON_TONES[tone],
        BUTTON_SIZES[size],
        className,
      )}
      {...props}
    />
  );
}

type StatusTone =
  | "neutral"
  | "info"
  | "success"
  | "warning"
  | "danger";

const STATUS_TONES: Record<StatusTone, string> = {
  neutral: "border-slate-200 bg-slate-100 text-slate-600",
  info: "border-blue-100 bg-blue-50 text-blue-700",
  success: "border-emerald-100 bg-emerald-50 text-emerald-700",
  warning: "border-amber-100 bg-amber-50 text-amber-700",
  danger: "border-rose-100 bg-rose-50 text-rose-700",
};

export interface StatusBadgeProps
  extends React.HTMLAttributes<HTMLSpanElement> {
  tone?: StatusTone;
}

export function StatusBadge({
  tone = "neutral",
  className,
  ...props
}: StatusBadgeProps) {
  return (
    <span
      className={cx(
        "inline-flex min-h-6 items-center gap-1 rounded-full border px-2.5 py-1 text-[11px] font-semibold leading-none",
        STATUS_TONES[tone],
        className,
      )}
      {...props}
    />
  );
}
