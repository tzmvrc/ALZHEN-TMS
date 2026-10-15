Apply `2026_10_16_trip_receipt_ocr.sql` in the Supabase SQL editor before deploying
the updated backend and frontend. It requires the existing trip images,
driver trip updates, and transaction/archive migrations to have been applied.

The migration adds receipt classification and OCR/review metadata to
`trip_images`; images remain in the private `trip-images` bucket. Existing driver
receipt paths are classified using `driver_trip_updates`. A stop is backfilled
only when the saved DR number matches exactly one stop. No images are deleted.

The admin receipt APIs are `GET /trips/:id/receipts` and
`PATCH /trips/:id/receipts/:receiptId/ocr`. Saves require `expected_version`;
concurrent changes return HTTP 409. Only ADMIN and STAFF can access these routes.
The driver OCR endpoint requires the exact `receipt_id` returned by the POD
upload, an active assignment, an unarchived stop, and ownership of the receipt.
Late OCR never replaces text already saved by staff.

The migration adds existing watched tables to `supabase_realtime` and a staff
read policy for image metadata. Existing RLS policies on the trip and operational
tables must also allow ADMIN/STAFF SELECT for those subscriptions to deliver.

After deployment, verify with an assigned driver and an admin session:

1. Advance a stop and confirm the admin alert opens the same trip and stop.
2. Upload a receipt; confirm it appears under Delivery receipts and stays out of
   Trip photos. Confirm driver OCR arrives or use the admin scan fallback.
3. Edit text on the admin screen while another update arrives; the draft must
   remain intact. Review the receipt, then confirm delayed phone OCR cannot
   replace it.
4. Archive a dispatch and confirm the driver cannot upload or submit OCR for it.

OCR runs in the browser. Its first scan downloads the Tesseract worker/language
assets; receipt uploads continue even when recognition fails.
