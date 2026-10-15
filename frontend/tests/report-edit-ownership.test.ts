import assert from "node:assert/strict";
import test from "node:test";
import { getReportEditDefinition } from "../src/services/report-editing.config.ts";
import { getReportRowIdentity } from "../src/services/report-row-identity.ts";

test("report identifiers target each physical stop after sorting and filtering; assignment remains shared", () => {
  const rows = [1, 2, 3].map((stop) => ({ trip_id: "trip-a", trip_stop_id: `stop-${stop}`, trip_line_item_id: `item-${stop}`, assignment_id: "assignment-a", transaction_number: `TX-${stop}`, dispatch_number: `DSP-${stop}` }));
  for (const report of ["combined", "dispatch-monitoring", "dispatch", "trip-booking"] as const) {
    for (const row of [...rows].reverse().filter((row) => row.trip_stop_id !== "stop-1")) {
      for (const field of ["transaction_number", "dispatch_number"]) {
        const target = getReportEditDefinition(report, field, row)!;
        assert.equal(target.sourceEntity, "stop");
        assert.equal(row[target.recordIdField], row.trip_stop_id);
      }
      if (report === "combined" || report === "dispatch-monitoring") {
        for (const field of ["transaction_dr_number", "transaction_quantity", "transaction_total_cbm", "transmittal_ref"]) {
          const target = getReportEditDefinition(report, field, row)!;
          assert.equal(target.sourceEntity, "stop");
          assert.equal(row[target.recordIdField], row.trip_stop_id);
        }
      }
      assert.equal(getReportEditDefinition(report, "driver_name", row)?.sourceEntity, "assignment");
      assert.equal(getReportEditDefinition(report, "plate_number", row)?.recordIdField, "assignment_id");
    }
    assert.equal(new Set(rows.map((row) => getReportRowIdentity(report, row))).size, 3);
    assert.equal(getReportEditDefinition(report, "transaction_number", { trip_id: "trip-a", trip_stop_id: null })?.sourceEntity, "trip");
  }
});
