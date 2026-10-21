import type { CSSProperties } from "react";
export type FieldCategory = "EXCEL" | "ADMIN" | "DRIVER";
export const FIELD_CATEGORIES: Record<FieldCategory, { label: string; background: string; color: string; darkBackground: string; darkColor: string }> = {
  EXCEL: { label: "Excel / client data", background: "#DBEAFE", color: "#1E40AF", darkBackground: "#172f55", darkColor: "#bfdbfe" },
  ADMIN: { label: "Admin / staff assignments", background: "#F3E8FF", color: "#6B21A8", darkBackground: "#36204b", darkColor: "#e9d5ff" },
  DRIVER: { label: "Driver updates", background: "#DCFCE7", color: "#166534", darkBackground: "#143a29", darkColor: "#bbf7d0" },
};
export function categoryHeaderStyle(category?: FieldCategory): CSSProperties {
  if (!category) return {};
  const item = FIELD_CATEGORIES[category];
  return { "--field-category-light-background": item.background, "--field-category-light-color": item.color, "--field-category-dark-background": item.darkBackground, "--field-category-dark-color": item.darkColor, backgroundColor: "var(--field-category-background, var(--field-category-light-background))", color: "var(--field-category-color, var(--field-category-light-color))", textTransform: "none" } as CSSProperties;
}
