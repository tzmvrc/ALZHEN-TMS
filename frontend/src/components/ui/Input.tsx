// src/components/ui/Input.tsx
import type { InputHTMLAttributes } from "react";

type InputProps = InputHTMLAttributes<HTMLInputElement> & {
  label?: string;
};

export function Input({ label, className = "", ...props }: InputProps) {
  return (
    <label className="block">
      {label && (
        <span className="mb-1.5 block text-sm font-medium text-slate-700">
          {label}
        </span>
      )}
      <input
        className={`w-full rounded-xl border border-[#e4e9f0] bg-white px-4 py-3 text-sm text-[#0b2343] outline-none transition placeholder:text-[#718096] focus:border-[#0b2343] focus:ring-2 focus:ring-[#0b2343]/15 ${className}`}
        {...props}
      />
    </label>
  );
}
