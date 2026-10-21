import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { ReportRowActionButton } from "../src/components/admin/ReportSpreadsheetShared.tsx";
import ReportImageGallery from "../src/components/admin/ReportImageGallery.tsx";

test("row actions are accessible icon-only buttons and preserve the caller's disabled state", () => {
  for (const action of ["edit", "delete"] as const) {
    const html = renderToStaticMarkup(createElement(ReportRowActionButton, { action, disabled: true, onClick: () => { throw new Error("render must never invoke an action"); } }));
    assert.match(html, /type="button"/);
    assert.match(html, /h-8 w-8/);
    assert.match(html, /rounded-full/);
    assert.match(html, /aria-label="(?:Edit selected row|Delete selected reports)"/);
    assert.match(html, /title="(?:Edit selected row|Delete selected reports)"/);
    assert.match(html, /disabled=""/);
    assert.match(html, /<svg[^>]*aria-hidden="true"/);
    assert.doesNotMatch(html, />Edit Row<|>Delete Row</);
  }
});

test("receipt gallery renders signed thumbnail preview buttons without creating public storage URLs", () => {
  const html = renderToStaticMarkup(createElement(ReportImageGallery, { images: [{ id: "receipt-a", file_name: "proof-a.png", signed_url: "https://example.invalid/signed/a?token=test" }, { id: "receipt-b", file_name: "proof-b.png", signed_url: "https://example.invalid/signed/b?token=test" }] }));
  assert.match(html, /aria-label="Preview proof-a.png"/);
  assert.match(html, /aria-label="Preview proof-b.png"/);
  assert.equal((html.match(/<button/g) ?? []).length, 2);
  assert.doesNotMatch(html, /storage\/v1\/object\/public/);
  assert.equal(renderToStaticMarkup(createElement(ReportImageGallery, { images: [] })), "");
});
