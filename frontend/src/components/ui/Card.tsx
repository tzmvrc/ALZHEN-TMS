// src/components/ui/Card.tsx
import type { HTMLAttributes } from "react";

export function Card({
  className = "",
  children,
  ...props
}: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={`rounded-2xl bg-white p-5 shadow-sm ${className}`}
      {...props}
    >
      {children}
    </div>
  );
}