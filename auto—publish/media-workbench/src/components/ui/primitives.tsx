import React from "react";

function classes(...values: Array<string | false | null | undefined>) {
  return values.filter(Boolean).join(" ");
}

type SurfaceProps = React.HTMLAttributes<HTMLDivElement> & {
  tone?: "default" | "muted" | "inset";
};

export function Surface({
  tone = "default",
  className,
  ...props
}: SurfaceProps) {
  return (
    <div
      {...props}
      className={classes(
        "ui-surface",
        tone === "muted" && "ui-surface-muted",
        tone === "inset" && "ui-surface-inset",
        className,
      )}
    />
  );
}

type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "ghost" | "danger";
  size?: "sm" | "md";
};

export function Button({
  variant = "secondary",
  size = "md",
  className,
  type = "button",
  ...props
}: ButtonProps) {
  return (
    <button
      {...props}
      type={type}
      className={classes(
        "ui-button",
        `ui-button-${variant}`,
        size === "sm" && "ui-button-sm",
        className,
      )}
    />
  );
}

type FieldProps = React.InputHTMLAttributes<HTMLInputElement> & {
  label?: string;
  hint?: string;
};

export function Field({ label, hint, className, id, ...props }: FieldProps) {
  return (
    <label className="ui-field-shell" htmlFor={id}>
      {label ? <span className="ui-field-label">{label}</span> : null}
      <input {...props} id={id} className={classes("ui-field", className)} />
      {hint ? <span className="ui-field-hint">{hint}</span> : null}
    </label>
  );
}

type StatusTone = "neutral" | "info" | "success" | "warning" | "danger";

type StatusBadgeProps = React.HTMLAttributes<HTMLSpanElement> & {
  tone?: StatusTone;
};

export function StatusBadge({
  tone = "neutral",
  className,
  ...props
}: StatusBadgeProps) {
  return (
    <span
      {...props}
      className={classes("ui-status", `ui-status-${tone}`, className)}
    />
  );
}

type PageHeaderProps = {
  title: React.ReactNode;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  className?: string;
};

export function PageHeader({
  title,
  description,
  actions,
  className,
}: PageHeaderProps) {
  return (
    <div className={classes("ui-page-header", className)}>
      <div className="min-w-0">
        <h2 className="ui-page-title">{title}</h2>
        {description ? (
          <p className="ui-page-description">{description}</p>
        ) : null}
      </div>
      {actions ? <div className="ui-page-actions">{actions}</div> : null}
    </div>
  );
}
