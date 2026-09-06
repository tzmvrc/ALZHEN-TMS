import type { ButtonHTMLAttributes } from "react";

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary";
};

export function Button({
  variant = "primary",
  className = "",
  children,
  ...props
}: ButtonProps) {
  const styles =
    variant === "secondary"
      ? "border border-slate-700 bg-slate-800 text-slate-200 hover:bg-slate-700"
      : "bg-cyan-500 text-slate-950 hover:bg-cyan-400";

  return (
    <button
      className={`inline-flex items-center justify-center rounded-xl px-4 py-2.5 text-sm font-semibold transition focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:ring-offset-2 focus:ring-offset-slate-950 ${styles} ${className}`}
      {...props}>
      {children}
    </button>
  );
}
