/** Move the sheet horizontally without moving the page or its vertical position. */
export function scrollToTableColumn(viewport: HTMLElement, header: HTMLElement) {
  const style = getComputedStyle(header);
  if (style.position === "sticky" && (style.left !== "auto" || style.right !== "auto")) return;
  const left = viewport.scrollLeft + header.getBoundingClientRect().left - viewport.getBoundingClientRect().left - 48;
  viewport.scrollTo({ left: Math.max(0, left), behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth" });
}
