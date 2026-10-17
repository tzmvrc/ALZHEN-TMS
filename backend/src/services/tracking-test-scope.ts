import {ApiError} from "../utils/api-response.js";
import {isValidUuid} from "../utils/validation.js";

/** Optional local acceptance restriction, NOT an authorization substitute.
 * Unset preserves normal authorized tracking; a partial/invalid pair fails closed.
 * Never populate from a browser request. */
export function trackingTestScope(env:NodeJS.ProcessEnv=process.env){
 const profile=env.TRACKING_TEST_PROFILE_ID?.trim(),assignment=env.TRACKING_TEST_ASSIGNMENT_ID?.trim();
 if(!profile&&!assignment)return null;
 if(!profile||!assignment||!isValidUuid(profile)||!isValidUuid(assignment))throw new ApiError("Tracking test scope requires exact profile and assignment UUIDs.",503,"TRACKING_TEST_SCOPE_INVALID");
 return {profileId:profile,assignmentId:assignment};
}
export function assertTrackingTestScope(profileId:string,assignmentId?:string){
 const scope=trackingTestScope();
 if(scope&&(scope.profileId!==profileId||assignmentId!==undefined&&scope.assignmentId!==assignmentId))throw new ApiError("Location sharing is restricted to the designated test assignment.",403,"TRACKING_TEST_SCOPE_DENIED");
}
