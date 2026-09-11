import type {
  ButtonHTMLAttributes,
  InputHTMLAttributes,
  ReactNode,
} from "react";

/**
 * The handful of primitives every screen uses. Deliberately small: consistent
 * focus rings, 44px touch targets and 16px inputs (so iOS does not zoom on
 * focus) matter more on a judge's phone than a component library does.
 */

type Variant = "primary" | "secondary" | "ghost";

const VARIANTS: Record<Variant, string> = {
  primary: "bg-ink text-paper hover:bg-ink/85",
  secondary: "border border-line bg-white text-ink hover:bg-paper-2",
  ghost: "text-ink-2 hover:text-ink hover:bg-paper-2",
};

export function buttonClass(variant: Variant = "primary", extra = ""): string {
  return [
    "inline-flex h-11 items-center justify-center gap-2 rounded-lg px-4 text-sm font-medium",
    "transition-colors disabled:pointer-events-none disabled:opacity-50",
    "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink",
    VARIANTS[variant],
    extra,
  ].join(" ");
}

export function Button({
  variant = "primary",
  className = "",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant }) {
  return <button className={buttonClass(variant, className)} {...props} />;
}

export function Input({ className = "", ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={[
        "h-11 w-full rounded-lg border border-line bg-white px-3 text-base text-ink",
        "placeholder:text-ink-3 focus:border-ink focus:outline-none",
        className,
      ].join(" ")}
      {...props}
    />
  );
}

export function Field({
  label,
  htmlFor,
  hint,
  children,
}: {
  label: string;
  htmlFor: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={htmlFor} className="text-sm font-medium text-ink">
        {label}
      </label>
      {children}
      {hint ? <p className="text-xs text-ink-3">{hint}</p> : null}
    </div>
  );
}

const TONES = {
  error: "border-danger/20 bg-danger-soft text-danger",
  info: "border-line bg-paper-2 text-ink-2",
  success: "border-success/20 bg-success-soft text-success",
} as const;

export function Alert({ tone = "info", children }: { tone?: keyof typeof TONES; children: ReactNode }) {
  return (
    <div role={tone === "error" ? "alert" : "status"} className={`rounded-lg border px-3 py-2.5 text-sm ${TONES[tone]}`}>
      {children}
    </div>
  );
}

export function Card({ className = "", children }: { className?: string; children: ReactNode }) {
  return <div className={`rounded-xl border border-line bg-white ${className}`}>{children}</div>;
}

export function Wordmark({ className = "" }: { className?: string }) {
  return (
    <span className={`font-semibold tracking-tight ${className}`}>
      Syllabus<span className="text-accent">→</span>
    </span>
  );
}
