import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { TableSkeleton } from "../src/components/admin/DashboardPrimitives.tsx";
test("shared spreadsheet skeleton retains column proportions, toolbar and loading semantics", () => {
  const html = renderToStaticMarkup(createElement(TableSkeleton, { columns: 4, rows: 3, columnWidths: [44, 180, 380, 160], showToolbar: true }));
  assert.match(html, /aria-label="Loading report table"/); assert.match(html, /aria-busy="true"/);
  assert.equal((html.match(/<col /g) ?? []).length, 4);
  assert.equal((html.match(/<td /g) ?? []).length, 12);
  assert.match(html, /width:44px/); assert.match(html, /width:380px/);
  assert.match(html, /animate-pulse/); assert.doesNotMatch(html, /<input/);
});
