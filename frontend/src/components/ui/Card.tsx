// src/components/ui/Card.tsx
import type { HTMLAttributes } from "react";

export function Card({
  className = "",
  children,
  ...props
}: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={`rounded-[18px] border border-[#e9edf4] bg-white p-5 shadow-[0_5px_20px_-18px_rgba(23,36,59,0.18)] ${className}`}
      {...props}
    >
      {children}
    </div>
  );
}
