# Trip flow redesign — Phase 3: delivery locations

## Finding-by-finding verification

| # | Verified in the original code | Change |
|---|---|---|
| 1 | Real. `StoreAddressReview` rendered candidates only inside its closed review panel; the summary could ask for an address without exposing choices. | Candidates and their full addresses/geography now appear directly on the card. Summary badges and state-specific Choose address / Use this location / Retry lookup / Verify actions lead into the same review. |
| 2 | Real. Both map picking and coordinate inputs changed the point without checking the address text. | Added optional persisted `pin_address_mismatch`. Changing the point or address clears verification and flags the pair. An explicit address/pin acknowledgement is required before verification becomes available. Import commit rejects a flagged pair claiming verification, and follow-up writes skip flagged unverified pairs. This phase uses the permitted mismatch-warning approach, not reverse geocoding. |
| 3 | Real. Missing-province messages tested only `source.province`. | Effective geography uses supplied source values first, then decision values. Missing messages, candidate filtering, search and verification use those effective values. A stale missing-geography lookup message is suppressed once that field has been completed; Choose address can request a new lookup. |
| 4 | Real. The bulk effect skipped every matching `lookup.source_key`, including failures created by `failedTripLocation`. | Failed statuses are never treated as completed, including old drafts whose failures contain a source key. New failure results omit the completion key; failures are not stored in the destination-result cache. Retry lookup is visible on the card. Automatic passes retry failures when the existing effect legitimately restarts; there is no infinite retry loop. Provider cooldowns still apply. |
| 5 | Real. Frontend and backend catches discarded the failure reason; the destination service reduced everything to `lookup_failed`. | Added structured `error_code` and `retryable`, safe code-only diagnostic logging, and distinct `not_configured`, `rate_limited`, `network_error`, `not_found` and fallback `lookup_failed` statuses. Provider failure cooldowns retain the original diagnostic rather than replacing it with a generic outage. |
| 6 | Real. The source-reset effect depended on `disabled`, invalidating requests when controls were disabled. | Source/token changes invalidate ownership; query/geography changes supersede searches as appropriate. `disabled` does not invalidate an in-flight result. Result updates carry lookup metadata only and use the current callback, so they do not overwrite a subsequently selected/verified point. |
| 7 | Real. Search was button-only and blindly appended province/city/country. | Added approximately 300 ms autocomplete with up/down/enter/escape, loading/empty/error states and a listbox. Shared query construction appends missing geographic parts once, normalizing punctuation/spacing and city/province qualifiers. No client provider key is used. |
| 8 | The helper name was misleading, but its provider settings were already suitable: five results, a Philippines country filter, and no warehouse-specific coordinate bias. There was no warehouse-only search defect. | Warehouse callers and their endpoint remain unchanged. Delivery autocomplete uses the destination endpoint's new optional `q`, reuses the neutral provider service, and adds shared province/city filtering and ranking. Frontend result types now expose the provider's existing name/geography metadata. |
| 9 | Real in the automatic bulk lookup effect: one `for ... await` request at a time. | Three workers process pending destinations. Cards show Queued/Checking N of total, then clear their progress when complete. A queued destination is rechecked before fetching so manual completion does not cause another request. Backend provider throttling and commit ordering remain intact. |
| 10 | Real. Choosing an existing store copied coordinates but always set `verified:false`. | Explicit selection of a store with a verified, complete, valid coordinate pair now retains verification. A different record/point cannot replace a currently verified decision without the existing replacement acknowledgement. New geocoder suggestions still require separate user selection and explicit verification. The compatibility review wrapper uses the same rules. |
| 11 | Correct; not a bug. The destination signature already changes when applied CSV geography changes. The `detailsDirty`/active transition also restarts the effect after applying edits. | Preserved that mechanism. Successful unchanged lookups remain reusable. Failed ones no longer block subsequent legitimate passes. Quantity-only edits do not invalidate successful geography matches. |
| 12 | Mixed. Backend-only keys, Philippines filtering, provider parsing, bounded caches, request deduplication, quota/interval controls, and self-hosted Nominatim selection already existed. Failure classification and caching were defective. | Retained those protections; normalized provider/key configuration, distinguished malformed/missing configuration and provider failures, preserved original cooldown codes, filtered/ranked delivery results, and removed silent first-candidate assignment during commit preparation. Saved-store suggestions now require a unique customer match when a customer name is supplied. |

## Shared picker and behavior changes

`StoreAddressReview` is now the shared delivery picker used by editable CSV store cards, the legacy `ImportDestinationReview` compatibility wrapper, and the compact New trip store UI. It includes source-versus-chosen comparisons, explicit verification, a lazy inline map, manual address/coordinate fields, replacement acknowledgement, and Geoapify/OpenStreetMap attribution.

Suggestions never fill chosen fields in the bulk effect, card search, or backend commit preparation. Selecting a result sets the address, both coordinates, and geography in one patch, preserving supplied CSV geography; missing geography uses the selected result. A verified store-record selection is an explicit reuse of an already verified record, rather than automatic verification of a geocoder result.

`RoadRouteMap` already supported clicking coordinates but did not provide a draggable draft marker or frame a draft-only location. Its draft marker is now draggable when editing is enabled, draft-only maps center on the selected point, and clicking an existing marker does not also pick a coordinate. Tracking/route markers retain their existing behavior. Manual numeric fields remain available when a map cannot render.

The compact manual picker keeps review state with its stop while the form remains open. Its **Save location to store** action explicitly persists an existing selected store through the existing master-data PATCH endpoint. The UI states that this write survives closing/cancelling the trip. Merely searching/selecting a suggestion does not update a master record, and trip creation does not silently perform this extra write. Users must select/create a store with the existing relationship picker before saving its reviewed location; this phase does not automatically create stores.

Manual location saving requires explicit verification, rejects mismatch flags, protects an existing verified location unless replacement was acknowledged, and uses an `updated_at` comparison to reject a concurrent update between backend read and write. The acknowledgement is preserved through re-verification. A successful save invalidates matching destination suggestions and the existing master/relationship caches. Duplicate saves are disabled until the review changes. Store switching and conflicting form actions are guarded while this save is pending. A repeated stop whose old address differs from its refreshed store coordinates is flagged instead of inheriting a mixed verified pair.

The legacy destination-review UI delegates its address/map controls to the shared component, retaining customer/store selectors and destination identity checks. Its old separate collapsed panel is replaced by the shared card.

Existing CSV uncontrolled input keys/blur saves, draft persistence/recovery, source identities, cargo confirmation, duplicate/history handling, realtime subscriptions, and retry-safe import commits are unchanged. New fields are optional, so historical drafts remain readable. Old drafts are not retroactively scanned for unknown address/pin discrepancies.

## Backend contract and configuration

- `GET /trips/import/location` accepts optional `q` (up to 300 characters) alongside the existing source identity/geography parameters. Authentication and ADMIN/STAFF authorization are unchanged.
- The response keeps `message`, `candidates`, and `source`, with additive failure statuses and optional `error_code` / `retryable`. `not_found` means no acceptable candidate, including candidates filtered out for conflicting supplied geography.
- Missing/invalid provider credentials/configuration: `not_configured`; codes include `GEOCODING_NOT_CONFIGURED` and `GEOCODING_INVALID_KEY`.
- Provider 429/daily budget: `rate_limited`, with separate rate/budget codes. Network/timeouts: `network_error`. Other provider/parser/database failures: `lookup_failed`, with a diagnostic code.
- `LocationDecision.pin_address_mismatch?: boolean` is persisted inside existing draft JSON, not in a new database column.
- The existing master-data PATCH accepts opt-in `location_review:true`, `replace_verified`, and `pin_address_mismatch` for the new explicit manual action. These are request controls, not stored fields. Ordinary master-data callers retain their existing path. Existing actor/verification timestamps continue to be populated by the backend.

The repo loads backend environment configuration via `dotenv` in its Supabase configuration. `.env.example` already documents `GEOCODING_PROVIDER=geoapify`, `GEOAPIFY_API_KEY`, the default daily limit of 1000, and the default 600 ms interval. No secrets were read, changed, or sent to the client. Live credentials were not checked.

Geoapify retains `countrycode:ph`, English results and limit 5. There is no fabricated coordinate/proximity bias because the source supplies administrative geography, not a reliable map center. Delivery matching applies supplied province/city constraints and ranks structured matches; unfamiliar provider spellings may require manual review rather than guessed aliases.

Nominatim is an explicitly configured alternative, not an automatic public fallback. A self-hosted search URL is required; public OpenStreetMap endpoints remain rejected. Existing eight-second provider timeouts, process-local queues, minimum intervals, daily budgets, bounded caches, in-flight deduplication and outage/rate-limit cooldowns remain active. Three frontend workers do not override provider throttling. Quotas across replicas still depend on the provider/dashboard limits; no distributed limiter was introduced.

## Files changed

- Frontend components: `StoreAddressReview.tsx`, `ImportDestinationReview.tsx`, `ImportStoreCards.tsx`, `BulkTripImport.tsx`, `ImportLocationNotices.tsx`, `RoadRouteMap.tsx`, `AddTripForm.tsx`.
- Frontend services: `trip-location.service.ts`, `master-data.service.ts` (result type only; warehouse search is unchanged).
- Backend: `routes/trip.routes.ts`; services `location-search.service.ts`, `trip-location.logic.ts`, `trip-location.service.ts`, `trip-import.service.ts`, `master-data.service.ts`.
- Shared query/ranking utility: `packages/trip-import/location-query.js` and `.d.ts`.
- This changelog.

## Database requirements

No new columns, tables, functions, policies, SQL or migrations are required by these code changes. Location verification still relies on the app's existing `customer_stores` coordinate/verification/audit fields and `updated_at`, and the existing import/workflow database functions. If the previously required workflow migration is absent, the existing backend setup error is retained; it has not been applied here. Earlier proposed migrations remain unexecuted.

## Verification and Not verified

Only the permitted static TypeScript checks were run for frontend and backend. Remaining errors are the known unrelated `UserActivityHistory.tsx(17,613)` TS2322 and `report.service.ts(817,95)` Supabase parser/select TS2322. No Phase 3 type errors remain.

Not verified: live provider credentials/results/quotas, actual autocomplete timing/keyboard behavior, map rendering/dragging, mobile layout, network retry/cooldown behavior, concurrent database saves, import/recovery commits, and manual location saving. No tests were run or changed; no browser automation, manual browser checks, screenshots, builds, lint, servers, SQL or migrations were run. No dependencies were added. Reverse geocoding, public-provider fallback, later redesign phases, and database deployment were not implemented.
