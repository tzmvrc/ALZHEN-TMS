# API verification guide

This document captures the backend read-foundation verification for Alzhen TMS.

## Required environment variables

Create a local environment file based on the backend `.env.example` values:

```env
API_BASE_URL=http://localhost:5000
TEST_ADMIN_EMAIL=
TEST_ADMIN_PASSWORD=
TEST_TRUCKER_EMAIL=
TEST_TRUCKER_PASSWORD=
```

No credentials are checked into the repository.

## Start the backend

```bash
cd backend
npm install
npm run dev
```

Expected server URL:

```text
http://localhost:5000
```

## Run the verification script

```bash
cd backend
npm run verify:api
```

The script performs:

- `POST /api/auth/login`
- `GET /api/auth/me`
- `GET /api/reports/combined`
- `GET /api/reports/dispatch-monitoring`
- `GET /api/reports/dispatch`
- `GET /api/reports/trip-booking`
- `GET /api/reports/store-calling`
- `GET /api/trips`
- optional trucker restriction test when credentials are supplied

It prints PASS/FAIL/SKIP rows and masks sensitive values.

## Expected status codes

- unauthenticated protected route: `401`
- invalid token: `401`
- forbidden role: `403`
- valid but missing resource: `404`
- invalid user input: `400`
- valid successful read: `200`

## Report metadata contract

The read layer must expose real report metadata from the live Supabase views.

### Combined report

The metadata must include identifiers aligned to the live view contract, including:

- `trip_id`
- `trip_stop_id`
- `trip_line_item_id`

The migration for `trip_line_item_id` is prepared in:

- `backend/migrations/2026_09_27_add_trip_line_item_id_to_v_tms_combined.sql`

This migration is intentionally kept as a SQL Editor step because the current environment does not expose a safe direct DDL execution path from the workspace runtime.

## Migration status

Current status:

```text
Migration ready but not applied to the live Supabase database.
```

The SQL must be run in Supabase SQL Editor, and the live view must be rechecked after applying it.

## Notes

- Do not expose passwords or access tokens in logs.
- Do not run CRUD or editing workflows until the read API contract is validated.
- Do not add unsupported database tables or redesign the reporting model.
