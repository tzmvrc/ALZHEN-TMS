import test from "node:test";
import assert from "node:assert/strict";
import {ApiError} from "../src/services/api.service";
import {wholeTripBlockerMessage,wholeTripDeletionErrorMessage} from "../src/services/whole-trip-deletion-feedback";

const cases = [
  ["An image upload is incomplete.", "A receipt upload is incomplete. Please finish or recover it first."],
  ["Billing, payable or receivable records require accounting retention review.", "This trip has financial records that must be retained."],
  ["Legacy POD ownership or retention is unresolved.", "Attachment ownership needs review before this trip can be deleted."],
  ["Unregistered Storage objects require ownership review.", "Attachment ownership needs review before this trip can be deleted."],
  ["Attachment belongs to a committed deletion journal and cannot be reused.", "A data consistency check prevented deletion. Please contact an administrator."],
  ["Protected report conversion history prevents deletion.", "This trip cannot be deleted because some records are protected."],
  ["Whole-trip deletion is disabled in this backend runtime.", "Trip deletion is currently unavailable."],
];
for (const [reason, message] of cases) test(`concise blocker feedback: ${reason}`, () => {
  assert.equal(wholeTripBlockerMessage([reason]), message);
  assert.equal(wholeTripDeletionErrorMessage(new ApiError(reason,409)), message);
});
test("password, session, concurrency and unexpected errors remain distinct", () => {
  assert.equal(wholeTripDeletionErrorMessage(new ApiError("The current account password could not be verified.",403)),"Incorrect password. Please try again.");
  assert.match(wholeTripDeletionErrorMessage(new ApiError("Expired",401)), /sign in again/);
  assert.match(wholeTripDeletionErrorMessage(new ApiError("Limited",429)), /Too many attempts/);
  assert.match(wholeTripDeletionErrorMessage(new ApiError("Trip not found",409)), /selected trips have changed/);
  assert.equal(wholeTripDeletionErrorMessage(new Error("private raw internal error")), "Something went wrong while deleting the trip. Please try again.");
});

test("network failures are distinct from unexpected errors",()=>{assert.match(wholeTripDeletionErrorMessage(new TypeError("Failed to fetch")),/check your connection/);assert.match(wholeTripDeletionErrorMessage(new ApiError("Timeout",408)),/check your connection/);});
