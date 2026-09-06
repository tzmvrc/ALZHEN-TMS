import type { HTMLAttributes } from "react";

export function Card({
  className = "",
  children,
  ...props
}: HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={`rounded-2xl p-6 shadow-md ${className}`} {...props}>
      {children}
    </div>
  );
}
