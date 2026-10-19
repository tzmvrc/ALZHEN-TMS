import test from "node:test";
import assert from "node:assert/strict";
import {createElement} from "react";
import {renderToStaticMarkup} from "react-dom/server";
import WholeTripDeletionDialog from "../src/components/admin/WholeTripDeletionDialog";

for (const [name, tripIds, label] of [
  ["single parent deduplicates stop rows", ["trip-a", "trip-a"], "Delete Entire Trip"],
  ["multiple parents", ["trip-a", "trip-b"], "Delete Selected Trips"],
] as const) {
  test(`compact whole-trip dialog: ${name}`, () => {
    const html = renderToStaticMarkup(createElement(WholeTripDeletionDialog, {
      token: "isolated", tripIds: [...tripIds], selectedRowCount: 8,
      onClose() {}, onDeleted() {},
    }));
    assert.equal(html.split(`>${label}<`).length - 1, 2, "matching title and confirmation");
    assert.match(html, /This action cannot be undone\./);
    assert.match(html, /type="password"/);
    assert.match(html, /including transmittals, reports, PODs, receipts, and attachments/);
    assert.doesNotMatch(html, /<dl|<details|selected rows|unique trips|ownership|trip-a|trip-b|trip_stops|Calculating dependent/);
    assert.match(html, /disabled=""/);
  });
}
