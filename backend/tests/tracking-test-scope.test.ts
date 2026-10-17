import test from "node:test";
import assert from "node:assert/strict";
import {trackingTestScope,assertTrackingTestScope} from "../src/services/tracking-test-scope.js";
const profile="00000000-0000-4000-8000-000000000001",assignment="00000000-0000-4000-8000-000000000002";
test("controlled tracking scope requires both UUIDs and rejects a different actor or assignment",()=>{
 assert.equal(trackingTestScope({}),null);
 for(const env of [{TRACKING_TEST_PROFILE_ID:profile},{TRACKING_TEST_ASSIGNMENT_ID:assignment},{TRACKING_TEST_PROFILE_ID:"invalid",TRACKING_TEST_ASSIGNMENT_ID:assignment}])assert.throws(()=>trackingTestScope(env),/exact profile/);
 const oldProfile=process.env.TRACKING_TEST_PROFILE_ID,oldAssignment=process.env.TRACKING_TEST_ASSIGNMENT_ID;
 try{
  process.env.TRACKING_TEST_PROFILE_ID=profile;process.env.TRACKING_TEST_ASSIGNMENT_ID=assignment;
  assert.deepEqual(trackingTestScope(),{profileId:profile,assignmentId:assignment});assertTrackingTestScope(profile,assignment);
  assert.throws(()=>assertTrackingTestScope(assignment,assignment),/restricted/);
  assert.throws(()=>assertTrackingTestScope(profile,profile),/restricted/);
 }finally{for(const [key,value] of Object.entries({TRACKING_TEST_PROFILE_ID:oldProfile,TRACKING_TEST_ASSIGNMENT_ID:oldAssignment})){if(value===undefined)delete process.env[key];else process.env[key]=value;}}
});
