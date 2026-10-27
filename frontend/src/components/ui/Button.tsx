// src/components/ui/Button.tsx
import type { ButtonHTMLAttributes } from "react";

type ButtonVariant = "primary" | "secondary" | "ghost";

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
};

const variants: Record<ButtonVariant, string> = {
  primary: "bg-[#0b2343] text-white enabled:hover:bg-[#17385f] enabled:active:bg-[#081b33]",
  secondary:
    "border border-[#e9edf4] bg-white text-[#1d5f94] enabled:hover:bg-[#e6f0f9] enabled:active:bg-[#d5e7f6]",
  ghost: "text-[#54677b] enabled:hover:bg-[#e6f0f9]",
};

export function Button({
  variant = "primary",
  className = "",
  children,
  ...props
}: ButtonProps) {
  return (
    <button
      className={`inline-flex min-h-10 items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-medium transition focus:outline-none focus:ring-2 focus:ring-[#2678b9] focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 ${variants[variant]} ${className}`}
      {...props}
    >
      {children}
    </button>
  );
}
