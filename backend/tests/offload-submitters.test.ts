import {splitOffloadDetails} from "../src/services/offload-details.logic.js";
import test from "node:test";
import assert from "node:assert/strict";
import {offloadSubmitterId,validateBackloadOffloadInput} from "../src/services/operations-report.logic.js";
test("Offload attribution uses original creation/submission identity, never delegate, driver or current editor",()=>{
 for(const role of ["ADMIN","STAFF","TRUCKER"]){
  const profileId="00000000-0000-4000-8000-000000000001",actor={role,profileId};
  const created=splitOffloadDetails({},actor,true);assert.equal(created.metadata.created_by,profileId);assert.equal(created.metadata.submitted_by,profileId);
  for(const field of ["created_by","submitted_by"]){const edited=splitOffloadDetails({[field]:"00000000-0000-4000-8000-000000000002"},actor,false);assert.throws(()=>validateBackloadOffloadInput(edited.body));}
 }
 const row={created_by:"creator",submitted_by:"submitter",reported_by:"delegate",driver_id:"driver",updated_by:"editor"};
 assert.equal(offloadSubmitterId(row),"creator");assert.equal(offloadSubmitterId({...row,created_by:null}),"submitter");assert.equal(offloadSubmitterId({...row,created_by:null,submitted_by:null}),null);
});

test("new cargo reports require reason regardless of boxes/comments and reject creator spoofing",()=>{
 const trip_id="00000000-0000-4000-8000-000000000001";
 for(const reason of [undefined,null,""," "]){assert.throws(()=>validateBackloadOffloadInput({trip_id,reason,comments:"Only a comment",number_of_boxes:1},true,true),/reason/);}
 assert.throws(()=>validateBackloadOffloadInput({trip_id,reason:"x".repeat(2001)},true,true),/2,000/);
 for(const field of ["created_by","submitted_by","submitted_at","event_type"]){assert.throws(()=>validateBackloadOffloadInput({trip_id,reason:"Valid",[field]:trip_id},true,true),/Unsupported/);}
 assert.equal(validateBackloadOffloadInput({trip_id,reason:"Line one\nLine two"},true,true).fields.reason,"Line one\nLine two");
});
