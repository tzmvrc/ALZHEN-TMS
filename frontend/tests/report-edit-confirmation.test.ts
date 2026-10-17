import assert from "node:assert/strict";
import test from "node:test";
import { confirmReportCellWrite } from "../src/services/report-edit-confirmation.ts";

test("Saved requires the exact physical record, parent scope and canonical edited field", () => {
  const target = {sourceEntity:"stop" as const,tripId:"trip-a",stopId:"stop-2"};
  assert.equal(confirmReportCellWrite({id:"stop-2",trip_id:"trip-a",quantity:0},target,"quantity"),0);
  assert.equal(confirmReportCellWrite({id:"stop-2",trip_id:"trip-a",remarks:null},target,"remarks"),null);
  assert.equal(confirmReportCellWrite({id:"stop-2",trip_id:"trip-a",dispatch_number:"NORMALIZED"},target,"dispatch_number"),"NORMALIZED");
  for (const record of [
    {},{id:"stop-1",trip_id:"trip-a",quantity:5},
    {id:"stop-2",trip_id:"trip-b",quantity:5},
    {id:"stop-2",trip_id:"trip-a"},
    {id:"stop-2",trip_id:"trip-a",quantity:undefined},
  ]) assert.throws(()=>confirmReportCellWrite(record,target,"quantity"),/draft is retained/);
  assert.throws(()=>confirmReportCellWrite({id:"item-2",trip_id:"trip-a",trip_stop_id:"stop-1",cbm:2},
    {...target,sourceEntity:"lineItem",lineItemId:"item-2"},"cbm"),/different stop/);
  const numeric = {id:"stop-2",trip_id:"trip-a",quantity:"0.000"};
  assert.equal(confirmReportCellWrite(numeric,target,"quantity",{value:0,editor:"number"}),"0.000");
  assert.throws(()=>confirmReportCellWrite(numeric,target,"quantity",{value:null,editor:"number"}),/requested value/);
  assert.throws(()=>confirmReportCellWrite({id:"stop-2",trip_id:"trip-a",remarks:"OLD"},target,"remarks",{value:"NEW",editor:"text"}),/requested value/);
  assert.equal(confirmReportCellWrite({id:"stop-2",trip_id:"trip-a",arrival_time:"2026-10-16T08:00:00+00:00"},target,"arrival_time",{value:"2026-10-16T08:00:00.000Z",editor:"datetime"}),"2026-10-16T08:00:00+00:00");
  assert.equal(confirmReportCellWrite({id:"stop-2",trip_id:"trip-a",date_assigned:"2026-10-16T00:00:00+00:00"},target,"date_assigned",{value:"2026-10-16",editor:"date"}),"2026-10-16T00:00:00+00:00");
});

test("trip, assignment, billing and store-call writes confirm their own source identity", () => {
  const targets = [
    {sourceEntity:"trip" as const,tripId:"trip-a",id:"trip-a"},
    {sourceEntity:"assignment" as const,tripId:"trip-a",assignmentId:"assignment-a",id:"assignment-a"},
    {sourceEntity:"billing" as const,tripId:"trip-a",billingId:"billing-a",id:"billing-a"},
    {sourceEntity:"storeCall" as const,storeCallId:"call-a",id:"call-a"},
  ];
  for (const target of targets) {
    assert.equal(confirmReportCellWrite({id:target.id,trip_id:"trip-a",remarks:"Saved"},target,"remarks"),"Saved");
    assert.throws(()=>confirmReportCellWrite({id:"unrelated",trip_id:"trip-a",remarks:"Saved"},target,"remarks"),/did not confirm/);
  }
});

test("loading Saved requires the canonical loading report, trip and timestamp", () => {
  const target = {sourceEntity: "loadingReport" as const, loadingReportId: "loading-a", tripId: "trip-a"};
  const saved = {id: "loading-a", trip_id: "trip-a", loading_start_at: "2026-10-16T15:50:23.250+00:00"};
  assert.equal(confirmReportCellWrite(saved, target, "loading_start_at", {value: "2026-10-16T15:50:23.250Z", editor: "datetime"}), saved.loading_start_at);
  assert.throws(() => confirmReportCellWrite({...saved, id: "stop-a"}, target, "loading_start_at"), /draft is retained/);
  assert.throws(() => confirmReportCellWrite({...saved, trip_id: "trip-b"}, target, "loading_start_at"), /different trip/);
  assert.throws(() => confirmReportCellWrite(saved, target, "loading_finished_at"), /draft is retained/);
});
