import test from "node:test";
import assert from "node:assert/strict";
import {coordinateDraft} from "../src/services/coordinate-draft.ts";
test("coordinate draft preserves latitude/longitude order, permits zero and rejects blank/invalid/bounds",()=>{
 assert.deepEqual(coordinateDraft("10.5","123.2"),{latitude:10.5,longitude:123.2});assert.deepEqual(coordinateDraft("0","0"),{latitude:0,longitude:0});
 for(const [lat,lng] of [["","123"],["10"," "],["123","10"],["10","181"],["NaN","10"],["Infinity","10"]])assert.equal(coordinateDraft(lat,lng),null);
});
