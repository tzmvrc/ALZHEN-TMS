import test from "node:test";
import assert from "node:assert/strict";
import { configuredCellValue } from "../src/services/configured-cell-input.ts";
import { operationalExportRows } from "../src/services/operational-export.ts";
import { trackerRowKey } from "../src/services/transmittal-tracker.service.ts";
import { getReportRowIdentity } from "../src/services/report-row-identity.ts";
import { getReportEditDefinition } from "../src/services/report-editing.config.ts";
import {reportCellFormatFor} from "../src/components/admin/ReportSpreadsheetUtils.ts";
import {projectTransmittalSheetRows} from "../src/services/transmittal-tracker-export.logic.ts";

test("convoy display keys distinguish assignments, while edits retain exact physical scope",()=>{
  const rows=["truck-a","truck-b"].map(assignment_id=>({trip_id:"trip",trip_stop_id:"stop",store_call_id:"call",assignment_id}));
  assert.notEqual(getReportRowIdentity("store-calling",rows[0]),getReportRowIdentity("store-calling",rows[1]));
  assert.notEqual(trackerRowKey(rows[0]),trackerRowKey(rows[1]));
  for(const sheet of ["combined","dispatch-monitoring","dispatch","trip-booking"] as const){
    assert.equal(getReportEditDefinition(sheet,"dispatch_number",rows[0])?.recordIdField,"trip_id");
    assert.equal(getReportEditDefinition(sheet,"stop_dispatch_reference",rows[0])?.recordIdField,"trip_stop_id");
    assert.equal(getReportEditDefinition(sheet,"driver_name",rows[0])?.recordIdField,"assignment_id");
    assert.equal(getReportEditDefinition(sheet,"issue_reason",rows[0])?.sourceField,"spreadsheet_issue_reason");
    assert.equal(getReportEditDefinition(sheet,"issue_report_type",rows[0])?.sourceField,"spreadsheet_issue_type");
  }
});
test("custom column input modes validate without changing authoritative source types",()=>{
  assert.equal(configuredCellValue("1.25",{type:"NUMBER"},""),"1.25");
  assert.throws(()=>configuredCellValue("Infinity",{type:"NUMBER"},""));
  assert.throws(()=>configuredCellValue("2026-02-30",{type:"DATE"},""));
  assert.equal(configuredCellValue("2026-10-21",{type:"DATE"},""),"2026-10-21");
  const input={type:"DROPDOWN" as const,options:[{value:"ONE",label:"First",color:null,active:true},{value:"OLD",label:"Historical",color:null,active:false}]};
  assert.equal(configuredCellValue("First",input,""),"ONE");
  assert.equal(configuredCellValue("OLD",input,"OLD"),"OLD");
  assert.throws(()=>configuredCellValue("OLD",input,""));
  assert.equal(configuredCellValue("",input,"ONE"),"");
});
test("authoritative exports count additive source values once without mutating convoy rows",()=>{
  const rows=[{trip_id:"trip",trip_stop_id:"stop",trip_line_item_id:"item",assignment_id:"a",quantity:10,cbm:80,trip_total_cbm:80,assigned_cbm:50},{trip_id:"trip",trip_stop_id:"stop",trip_line_item_id:"item",assignment_id:"b",quantity:10,cbm:80,trip_total_cbm:80,assigned_cbm:30}];
  const result=operationalExportRows(rows);
  assert.equal(result.length,2);assert.equal(result[1].quantity,null);assert.equal(result[1].cbm,null);assert.equal(result[1].trip_total_cbm,null);
  assert.equal(result[1].assigned_cbm,30);assert.equal(rows[1].quantity,10);
});
test("convoy cells inherit earlier physical-row formatting without overriding assignment-specific settings",()=>{
 const assignment="00000000-0000-4000-8000-000000000040",base="report:trip:trip:stop:stop",column="remarks";
 const formats={[`${base}\0${column}`]:{bold:true,color:"#112233"},[`${base}:assignment:${assignment}\0${column}`]:{bold:false}};
 assert.deepEqual(reportCellFormatFor(formats,`${base}:assignment:${assignment}\0${column}`),{bold:false,color:"#112233"});
 assert.deepEqual(reportCellFormatFor({"stop\0remarks":{italic:true}},`stop~${assignment}\0remarks`),{italic:true});
});
test("prepared transmittals count physical delivery stops once and list all convoy plates",()=>{
 const rows=[{trip_id:"trip",trip_stop_id:"stop",assignment_id:"a",plate_number:"PLATE-A",driver_name:"Driver A",transmittal_ref:"REF"},{trip_id:"trip",trip_stop_id:"stop",assignment_id:"b",plate_number:"PLATE-B",driver_name:"Driver B",transmittal_ref:"REF"}];
 const projected=projectTransmittalSheetRows(rows,"REF");assert.equal(projected.length,1);assert.equal(projected[0].plate_number,"PLATE-A, PLATE-B");assert.equal(projected[0].assignment_id,null);assert.equal(rows.length,2);assert.equal(rows[0].assignment_id,"a");
});
