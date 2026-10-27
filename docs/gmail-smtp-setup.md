# Temporary Gmail SMTP for operational reports

The existing private operational report outbox supports `EMAIL_PROVIDER=gmail` and `EMAIL_PROVIDER=resend`. If omitted, the provider remains Resend. No database migration is required: provider identity is stored in the existing private `content` JSON, with acceptance in the existing status/message-ID fields. Backload, Offload and Demurrage keep their existing saved-report queue triggers, recipient subscriptions, HTML/plain-text templates, PDF/logo attachments and asynchronous worker lifecycle.

## Manual setup and test

No dependency installation, tests, builds, migrations, SMTP connections or email sends were run during implementation. Actual backend `.env` credentials were not edited.

1. Install the newly declared backend dependencies yourself: run `npm install` from `backend`. Nodemailer and its TypeScript declarations are pinned in `package.json` and `package-lock.json`. The selected Nodemailer version requires Node.js 20 or newer; this repository already declares Node.js 24.
2. In Admin Settings → Operational Report Emails, temporarily disable **Automatic operational report notifications** and save before switching providers. This pauses formal report jobs while you test; explicit Admin test emails still work. Do not create or modify delivery reports merely to test SMTP.
3. Enable Google two-step verification and obtain a Google App Password for the sending account. Workspace/account policies may prevent App Password use. Use the App Password, never the normal Google login password.
4. Set these values in the backend `.env` only, replacing the placeholders locally:

   ```dotenv
   EMAIL_PROVIDER=gmail
   SMTP_HOST=smtp.gmail.com
   SMTP_PORT=465
   SMTP_SECURE=true
   SMTP_USER=your-sending-account@gmail.com
   SMTP_APP_PASSWORD=your-google-app-password
   SMTP_FROM_NAME="ALZHEN TMS"
   ```

   Keep all existing `RESEND_*` values intact. `RESEND_EMAIL_ENABLED` applies to Resend; Gmail is selected explicitly by `EMAIL_PROVIDER=gmail`. The database automatic-notification toggle still controls formal report emails. Credentials must never be placed in `VITE_*` variables, source code, recipient configuration or browser storage.

5. Restart your backend using its usual local development command so it loads the environment and new dependencies. The SMTP worker starts only after the backend listener binds. Refresh Admin Settings and confirm **Provider: Gmail SMTP**, the sending address, and configured status. Invalid host/port/TLS or missing credentials show configuration instructions without exposing the password.
6. Enter a recipient address you control in **Test recipient**, then click **Send test email** once. Gmail does not inherit Resend's testing-domain recipient restrictions. The recipient starts empty for Gmail so you choose it explicitly.
7. Watch recent history progress from Pending to Sending to **SMTP accepted - delivery unconfirmed**, or an actionable failure/retry state. Refresh history if the Realtime connection is unavailable. Check Gmail Sent and the recipient inbox/spam folder yourself; SMTP acceptance does not prove inbox delivery. The test uses the existing template, inline logo and report PDF without creating a real operational report.
8. After the test succeeds, configure intended recipients/report types and re-enable automatic notifications when you intend real formal report emails to resume.

To switch back, set `EMAIL_PROVIDER=resend`, retain the existing `RESEND_API_KEY`, `RESEND_FROM_EMAIL` and `RESEND_EMAIL_ENABLED` configuration, and restart the backend. The Admin screen shows the selected provider and each history entry retains its own provider label.

## Retry and duplicate prevention

- The existing unique report/recipient jobs, request idempotency keys, durable leased claims and attachment snapshots remain in use. Gmail receives one envelope recipient per job and the authenticated account is always the sender.
- A stable SMTP Message-ID helps investigation/threading, but is **not** an exactly-once delivery guarantee. SMTP does not provide Resend's provider idempotency API.
- Explicit SMTP temporary rejections use exponential retry with at least a 15-minute delay. A reported daily quota defers retry for at least 24 hours. Manual retry cannot bypass these cooldowns.
- Authentication/configuration errors block the job until the configuration is fixed and an Admin retries. Explicit permanent SMTP rejections fail without an automatic retry loop. Error messages are sanitized; raw SMTP responses, credentials and authentication exchanges are never logged or exposed.
- A timeout/broken connection with uncertain acceptance, a failed acceptance acknowledgement, or recovery of an in-flight SMTP job after restart moves to **Provider confirmation required**. Automatic and manual resending are held because Gmail may already have accepted it. Check Gmail Sent and recipient evidence before considering any separate follow-up. Do not create another test request just to work around an uncertain outcome.
- Existing jobs stay bound to their sending provider. Switching providers never automatically resends an uncertain job. An explicit Admin retry can rebind a definitely rejected or unattempted job; private metadata records the prior provider/error, actor and change time. Previously accepted jobs cannot be retried through this action.
- Gmail acceptance stores `provider_status=SMTP_ACCEPTED`, a Message-ID and acceptance time. It never sets a confirmed-delivery timestamp and is never passed to the Resend status API. Existing Resend delivery reconciliation is retained when Resend is selected.

## Files changed

- `backend/.env.example`
- `backend/package.json`
- `backend/package-lock.json`
- `backend/src/services/gmail-smtp.service.ts`
- `backend/src/services/operational-email.service.ts`
- `frontend/src/components/admin/OperationalEmailSettings.tsx`
- `docs/gmail-smtp-setup.md`

Reference: [Nodemailer SMTP configuration](https://nodemailer.com/smtp) and [SMTP error handling](https://nodemailer.com/errors).
