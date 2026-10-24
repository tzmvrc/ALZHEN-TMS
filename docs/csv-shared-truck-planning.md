# Shared trucks across PH source references

The CSV loader previously used each PH truck reference as a trip-group boundary. The cargo allocator already permits multiple DRs and stops on one truck, but those separate planning groups prevented it from considering their cargo together.

New CSV files and XLSX worksheets now start as one shared planning group each. PH references remain unchanged on every source row. Truck selection and exact CBM capacity determine allocation; a different PH reference does not require another physical truck. Deliberate grouping by PH reference or dispatch/trip remains available in Column mapping.

Older unsaved drafts with automatic PH groups show **Combine PH groups** in Complete details. Its confirmation explains that group-specific truck plans and trip settings are reset; source rows, quantities, CBM, PH references, address decisions and recovery approvals remain. The CSV must be rechecked before choosing shared trucks. Old group plans, capacity summaries and ephemeral allocation sessions are removed so they cannot affect the new plan. Recorded batches cannot be regrouped through this action.

## Source-file inspection

Read-only analysis of the user's local request files found:

| File | Product rows | PH references | Stops | Total CBM |
| --- | ---: | ---: | ---: | ---: |
| CDO trip request 1.csv | 23 | 1 | 5 | 5.1923 |
| CDO trip request 2.csv | 37 | 3 | 11 | 37.7556 |
| Cebu trip request 1.csv | 56 | 1 | 4 | 29.688 |
| Cebu trip request 2.csv | 44 | 1 | 1 | 85.4828 |

One of CDO request 2's PH references contains only one product. A Playwright run using that actual file and mocked APIs verified all 37 source rows and 11 stops allocated to one simulated 40-CBM truck. All three PH references and all source values were retained. No live records were created or imported.

## Changes and validation

- `tripImportFiles.ts`: file-level default grouping and pure helpers for explicit grouping/legacy PH detection.
- `BulkTripImport.tsx`: Combine PH groups action, reviewed reset/recheck flow and recorded-batch guard.
- `SmartImportMapping.tsx`: explicit optional PH splitting and shared-plan guidance.
- `import-trip-grouping.test.ts`: defaults, original-cell preservation, manual/dispatch grouping, and cross-stop allocation/capacity checks.
- `trip-source-import.test.ts`: verifies regrouping preserves backend source identities, document hashes, fingerprints and original product values.
- `csv-shared-trucks.browser.js`: fresh imports, legacy regroup/cancel, stale-plan cleanup, source preservation and recorded-batch protection; runs with a synthetic six-reference/six-stop file or a provided local CSV.

Focused tests passed: 35 tests, with one optional local-file fixture skipped by its existing environment check. The actual CDO file was separately tested through Playwright. Existing Step 3 browser checks also passed at 1000/1280/1600px, including optional addresses. The allocation algorithm and backend save contracts were unchanged. TypeScript checking still reports the previously observed errors in untouched `ReportDataView.tsx:1297` and `UserActivityHistory.tsx:17`.
