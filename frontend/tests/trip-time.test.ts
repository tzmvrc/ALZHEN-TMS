import test from "node:test";
import assert from "node:assert/strict";
import {manilaDateTime,tripTimeDisplay,saveTripTime} from "../src/services/trip-time";
test("milestone times use Manila's 12-hour clock, including midnight and null",()=>{
 assert.equal(tripTimeDisplay("2026-10-16T00:05:00Z"),"8:05 AM");
 assert.equal(tripTimeDisplay("2026-10-16T04:30:00Z"),"12:30 PM");
 assert.equal(tripTimeDisplay("2026-10-16T06:32:00Z"),"2:32 PM");
 assert.equal(tripTimeDisplay("2026-10-16T15:45:00Z"),"11:45 PM");
 assert.equal(tripTimeDisplay(null),"");assert.equal(tripTimeDisplay(""),"");
});
test("time edits retain each event date across midnight and never infer a missing date",()=>{
 const start="2026-10-16T15:45:23.250Z",finish="2026-10-16T16:30:10.000Z";
 assert.equal(saveTripTime(start,"23:50"),"2026-10-16T15:50:23.250Z");
 assert.equal(saveTripTime(finish,"00:35"),"2026-10-16T16:35:10.000Z");
 assert.equal(manilaDateTime(saveTripTime(finish,"00:35")!),"2026-10-17T00:35");
 assert.equal(saveTripTime(undefined,"2026-10-17T00:35"),"2026-10-16T16:35:00.000Z");
 assert.equal(saveTripTime(start,""),null);assert.throws(()=>saveTripTime(undefined,"08:30"));assert.throws(()=>saveTripTime(start,"25:00"));assert.throws(()=>saveTripTime(undefined,"2026-02-30T08:00"));
});
