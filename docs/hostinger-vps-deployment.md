# Hostinger KVM 2 deployment preparation

Prepared October 17, 2026. **Nothing has been purchased or deployed.** These are
operator instructions for a future approved deployment, not commands run on a VPS.
Supabase remains the existing Cloud database/Auth/Storage/Realtime service. Do not
create a local PostgreSQL server or reapply existing migrations.

## Architecture and boundaries

Internet -> Caddy HTTPS proxy -> static frontend and Express backend. Only ports
80/443 are published. Socket.IO uses `/socket.io` on the same HTTPS origin; `/api`
is forwarded without stripping its prefix. SPA fallback preserves `/trips/:tripId`.
Caddy manages certificates and renewals. No Docker socket is mounted.

The backend connects to Supabase and Mapbox over outbound HTTPS. The PDF worker
uses `network_mode: none`: no TCP interface beyond loopback, no DNS/provider access,
no database/Auth/Storage credentials. The backend sends already authorized PDF
bytes through `/run/pdf/renderer.sock` on a dedicated volume. That volume is the
worker's only persistent writable mount and is read-only in the backend container.
No documents are written there. Only these two containers mount it, with UID1000.

The worker reuses the actual PDF.js/native canvas child renderer. Its optional
`/ocr` socket endpoint runs offline Tesseract English against rendered PNGs. The
current application still uses browser Tesseract for its OCR review flow; this
deployment does not silently switch providers or auto-approve documents. The
optional socket OCR endpoint is not exposed as a public HTTP API.

All application containers run non-root with a read-only root, all capabilities
dropped, no-new-privileges, bounded tmpfs, PID/CPU/memory limits and restart policies.
The proxy uses the container network namespace's unprivileged-port sysctl to bind
80/443 as UID1000. Default Docker seccomp/AppArmor must remain enabled. A separate
container is a meaningful boundary, but still shares the host kernel: keep the
host/kernel/images patched and do not run privileged containers.

## Resource plan: 8 GB / 2 vCPU

Hostinger currently lists KVM2 with 2 vCPU and 8GB; confirm the purchased plan rather
than assuming this document changes its limits.

| Service | Memory ceiling | CPU ceiling | PID ceiling |
| --- | --- | --- | --- |
| Backend | 1536 MiB | 0.75 | 128 |
| PDF/OCR worker | 1536 MiB | 1.00 | 64 |
| Static frontend | 128 MiB | 0.10 | 64 |
| HTTPS proxy | 256 MiB | 0.15 | 64 |

The service ceilings total ~3.4GiB and 2 vCPU. Reserve at least 2GiB for Ubuntu,
Docker, caches and monitoring; remaining headroom covers builds and spikes. Build
one image at a time (`COMPOSE_PARALLEL_LIMIT=1`), preferably in CI. These are initial
limits, not measured production capacity. PDF jobs are one at a time, without an
unbounded queue; busy/error responses retain the user's current receipt/draft.
Use encrypted host swap only if operationally needed; do not depend on swap for OCR.

## 1. Ubuntu initialization (requires deployment approval)

Use a supported Ubuntu LTS image (e.g.24.04), amd64, with SSH key access. Record the
VPS IP and a recovery-console procedure in Hostinger hPanel. Create a named sudo
operator, verify a second SSH session works, then disable password/root SSH login.
Do not lock out the initial session before testing the replacement. Apply updates:

```sh
sudo apt-get update
sudo apt-get upgrade
sudo apt-get install -y ca-certificates curl ufw unattended-upgrades
sudo timedatectl set-timezone UTC
```

Application display remains Asia/Manila; timestamp storage is unaffected. Enable
security updates and plan reboots. Do not install an unneeded database or control
panel on this host.

## 2. Docker Engine and Compose plugin

Use Docker's official Ubuntu repository. On a fresh supported Ubuntu server:

```sh
sudo install -m 0755 -d /etc/apt/keyrings
sudo curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
sudo chmod a+r /etc/apt/keyrings/docker.asc
. /etc/os-release
sudo tee /etc/apt/sources.list.d/docker.sources >/dev/null <<EOF
Types: deb
URIs: https://download.docker.com/linux/ubuntu
Suites: $VERSION_CODENAME
Components: stable
Architectures: $(dpkg --print-architecture)
Signed-By: /etc/apt/keyrings/docker.asc
EOF
sudo apt-get update
sudo apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
sudo systemctl enable --now docker
sudo docker version
sudo docker compose version
```

Use `sudo docker` or a deliberately authorized operator. Membership in the Docker
group is effectively root access. Never expose Docker's remote API publicly.
Before rollout pin the Node24 and Caddy2 base tags in the Dockerfiles to verified
release digests and retain that release manifest; no unverified digest is supplied.
The containers use Debian glibc Node images on the Ubuntu host, avoiding Alpine/musl
native canvas incompatibilities. Native Linux compatibility still needs a real build.

## 3. Firewall, domain and TLS

In the Hostinger firewall permit SSH only from operator addresses and permit public
TCP80/443. Apply equivalent host rules after confirming your SSH source address:

```sh
sudo ufw allow from YOUR_ADMIN_IP to any port 22 proto tcp
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw enable
sudo ufw status verbose
```

Docker-published ports can bypass UFW. This Compose file publishes ONLY80/443;
verify public exposure from a separate machine and use the provider firewall too.
Do not publish backend5000, frontend8080, Docker, Redis or the PDF socket.

Set the chosen subdomain A record to the VPS IPv4. Set AAAA only if IPv6 routing and
firewall are configured; remove stale AAAA records. Initially use direct DNS while
verifying ACME, and coordinate any CDN proxy afterward. No DNS changes are authorized
by this preparation task. Caddy requires reachable80/443 and persists certificates
in `caddy_data`; preserve that volume to avoid unnecessary issuance/rate limits.

## 4. Release and environment files

Place a reviewed release in `/opt/alzhen` without copying workstation `.env`,
`node_modules`, logs or client documents. The current worktree is uncommitted; do
not silently deploy a different Git HEAD or discard changes. Approve an exact
release artifact first. From the release root:

```sh
mkdir -p deployment/secrets
chmod 700 deployment/secrets
cp deployment/.env.example deployment/.env
cp deployment/backend.env.example deployment/secrets/backend.env
chmod 600 deployment/.env deployment/secrets/backend.env
```

Edit locally with a secure editor; never paste credentials into chat, CLI arguments,
logs or screenshots. Both files/directories are Git-ignored. `.dockerignore` excludes
all real environment files, keys and secrets from build contexts.

- `deployment/.env`: actual APP_DOMAIN, ACME_EMAIL, immutable RELEASE_TAG, public
  Supabase URL/anon key, origin-restricted public Mapbox rendering token. These VITE
  build inputs are intentionally browser-visible; changing them requires rebuild.
- `deployment/secrets/backend.env`: matching Supabase URL/anon key and private
  service-role key; optional private MAPBOX_DIRECTIONS_TOKEN. No VITE_ secret keys.
  Gemini may remain blank; do not enable paid processing while billing is blocked.
- Compose sets exact HTTPS CORS/SOCKET origins, proxy trust1, port5000, one backend
  process and the private worker socket. Public client API and socket URLs use the
  chosen HTTPS domain. Configure Supabase Auth Site URL/allowed redirects separately
  after approval, preserving local development entries and session policies.
- Keep TRACKING_ENABLED=false and POD_PDF_ENABLED=false in deployment/.env.
  POD_REVIEW_ENABLED=true is preserved because its migration is already applied.
  Do not put competing flag values into backend.env: Compose environment wins.

REST CORS rejects unlisted browser origins. JWT/role/app-session checks remain the
authorization boundary, including Socket.IO handshake checks. Backend is reachable
only behind the proxy. One process does not require Redis. Do not scale backend
replicas until WEB_CONCURRENCY and a secured shared Redis adapter are configured;
the existing database change bridge is retained.

Mapbox Directions uses its own private backend token; no frontend fallback. Check
account access/billing and restrictions before separately approved route validation.
Browser URL-restricted rendering tokens may reject server-origin Directions requests.
Retain 30/minute shared claim budget, concurrency2, hourly route cache and bounded
retry/lease semantics. Normal GPS changes must not recalculate every route.

Local readiness finding: the currently configured backend Directions value is
identical to the existing frontend public `pk` rendering token. It is already in
browser assets by design as that public rendering token; no new secret-scoped token
was discovered there. Do not copy this reuse into the production backend. Configure
a separate server-appropriate token and verify its Directions authorization under
approved test scope. Local env files were not changed. The credential scan found no
Supabase service-role or Gemini private value in frontend assets/deployment files.

## 5. Validate, build and start (future approved deployment only)

Never print the fully resolved Compose configuration: it can include backend keys.
Use quiet validation, then sequential builds:

```sh
sudo docker compose --env-file deployment/.env -f deployment/compose.yaml config --quiet
sudo env COMPOSE_PARALLEL_LIMIT=1 docker compose --env-file deployment/.env -f deployment/compose.yaml build
sudo docker compose --env-file deployment/.env -f deployment/compose.yaml up -d --wait
sudo docker compose --env-file deployment/.env -f deployment/compose.yaml ps
curl --fail https://YOUR_DOMAIN/api/health
```

Record image IDs and release tag. Check redirect/certificate, `/login`, direct
`/trips/:tripId` refresh, read-only report navigation, socket reconnect and authorized
Trucker restrictions. Health endpoints check process/socket availability, not all
Supabase permissions, OCR quality or external provider authorization.

## 6. Mandatory worker verification before PDF activation

The following checks use no Storage, database, real POD or paid API:

```sh
sudo docker compose --env-file deployment/.env -f deployment/compose.yaml exec pdf-worker id
sudo docker compose --env-file deployment/.env -f deployment/compose.yaml exec pdf-worker tesseract --list-langs
sudo docker compose --env-file deployment/.env -f deployment/compose.yaml exec pdf-worker node smoke-pdf.cjs
```

The smoke command generates a synthetic PDF, renders it with native canvas, performs
actual offline English OCR, checks expected text and rejects malformed input. It does
not upload anything. Verify `eng` is installed. Then inspect only nonsecret fields:

```sh
worker_id=$(sudo docker compose --env-file deployment/.env -f deployment/compose.yaml ps -q pdf-worker)
sudo docker inspect "$worker_id" --format '{{.HostConfig.NetworkMode}} {{.HostConfig.ReadonlyRootfs}} {{.HostConfig.Memory}} {{.HostConfig.NanoCpus}} {{.HostConfig.PidsLimit}}'
sudo docker compose --env-file deployment/.env -f deployment/compose.yaml exec pdf-worker sh -c 'test ! -e /app/.env && test -z "${SUPABASE_SERVICE_ROLE_KEY:-}" && test ! -S /var/run/docker.sock'
```

Expected: none / true / 1610612736 / 1000000000 /64. Verify the worker cannot
create files in `/app`, has only loopback network interfaces, and mounts only its
socket volume plus bounded tmpfs. Do not inspect/dump backend environment values.
Use synthetic fixtures to test oversized, encrypted, malformed, >10-page and
cancelled requests, worker restart and timeout recovery. Container OOM/restart and
native canvas behavior must be tested on Linux before declaring isolation verified.

Limits: 5MiB originals,10 pages,24million pixels,20MiB rasters,28MiB protocol,
15s render child,192MiB child V8 heap plus1536MiB container memory, one worker job
at a time,64PIDs,96MiB tmpfs. OCR has20s/page,45s total and128KiB aggregate text.
Raster/recognition failures do not replace an existing receipt or approve a POD.
Worker receives no app credentials and cannot access backend filesystem or process
namespace. No host Docker socket, host PID namespace or privileged mode is allowed.

Only after Linux isolation and functional checks pass, approve a designated private
synthetic PDF upload/review test and enable POD_PDF_ENABLED=true/recreate backend.
Keep Gemini disabled. Tracking requires configured/verified private credentials and
separate approval for driver/assignment GPS and any paid Directions acceptance call.
Browser GPS is opt-in and cannot be guaranteed while a phone is locked or closed.

## 7. Logs and monitoring

- Docker `local` log driver rotates each container at10MiB x3 files; these operational
  logs persist with the container until recreation. Retain/export required incident
  logs before updates. Proxy access logs have a persistent `proxy_logs` volume,
 10MiB rotation/5 archives, and URI/auth/cookie/session/location header redaction.
  Do not log document bodies, signed URLs, passwords or provider-token URLs.
- Backend currently writes operational stdout/stderr; it has no new configurable
  structured log-level adapter. Proxy CADDY_LOG_LEVEL is configurable. Review error
  logs for sensitive data before forwarding them to any external service.
- Monitor `docker stats`, container restart counts/health, host `free -h`, `df -h`,
  certificate expiry, disk/log growth and HTTP5xx. Alert before disk80% and sustained
  worker saturation. An unhealthy status alone does not restart a living container;
  alert and investigate. Process exit/OOM uses unless-stopped restart policy.
- Restrict monitoring/admin tools to VPN/SSH; do not publish Docker metrics publicly.
  Track `/api/tracking/metrics` only through authorized Admin/Staff when enabled.

## 8. Updates and rollback

Retain previous image tags/digests and encrypted environment snapshots. Build a new
immutable RELEASE_TAG and run tests before changing live services. Rebuild only the
required services. `up -d --wait` is a small single-VPS rolling replacement, not a
zero-downtime deployment guarantee. Schedule updates and communicate interruptions.

Rollback by restoring the prior RELEASE_TAG/public build config and executing
`up -d --no-build --wait` with the same Compose command prefix. Confirm old images
are retained. Disable TRACKING_ENABLED/POD_PDF_ENABLED in deployment/.env and recreate
backend to stop those paths; flags are loaded at process start. Do not roll back
Supabase schema or remove existing private documents. Never use `down -v` or
indiscriminate Docker/volume pruning. Existing applied migrations are not rerun here.

## 9. Backups and recovery

Supabase holds operational data and original receipts. Confirm the actual Cloud
backup/PITR entitlement and retention; database backups do not by themselves restore
Storage objects. Maintain separately approved private object backups and a tested
restore procedure. Do not export production data as part of deployment preparation.

Back up encrypted backend/Compose env files, exact release artifacts/image manifests,
Caddy certificate/config volumes and any operational logs required by policy to an
off-host destination. Keep encryption keys outside the VPS and restrict restore
access. Socket volume contains no business data and need not be backed up. No
client documents belong in Docker log/socket volumes. VPS snapshots complement,
but do not replace, Cloud database/object backups and off-host configuration copies.
Define RPO/RTO with the client, document rebuild steps and exercise a disposable
restore before relying on backups. Do not put plaintext secret archives in Git.

Recovery: provision patched Ubuntu, install Docker, restore the reviewed images and
encrypted configuration, restore Caddy volumes, confirm external Supabase access,
start with both new flags false, then perform authorized read-only checks. Re-enable
PDF/tracking only after their independent acceptance gates pass again.

## Local evidence / unresolved gates

Docker is unavailable on the preparation workstation. No image build, Compose engine
validation, Linux cgroup/egress enforcement, ACME issuance or actual container OCR
has been performed here. Local application/native renderer/protocol tests and static
configuration validation are separate evidence, not a container acceptance claim.
Known existing Vite chunk warnings, ReceiptReviewCard lint baseline and proxy-addr
dependency advisory remain release-review items; do not auto-upgrade unrelated code.

Optional static YAML/policy validation (no secrets read, no environment resolution):
run `python deployment/validate-config.py` in a disposable environment containing
PyYAML6.0.3. This is not a Compose engine validator. Native Windows PDF rendering,
Unix-socket/named-pipe protocol fixtures and production no-fallback/CORS tests pass.
Backend153/153 and frontend73/73 tests pass; both TypeScript/builds and targeted
new/changed module lint pass. Container health/smoke scripts pass Node syntax checks.
Real container Tesseract, image builds, Caddy adaptation/HTTPS, cgroup enforcement
and egress/filesystem isolation remain mandatory Linux acceptance checks.

Requires user approval: purchase/provisioning, access to the target host, DNS/Auth
configuration changes, deployment of an exact release, controlled production test
scope, provider spend and later feature activation. No new Supabase migration is
required by this deployment design.

## Primary references

- https://docs.docker.com/engine/install/ubuntu/
- https://docs.docker.com/engine/network/packet-filtering-firewalls/
- https://caddyserver.com/docs/automatic-https
- https://caddyserver.com/docs/caddyfile/directives/reverse_proxy
- https://support.hostinger.com/en/articles/6976044-parameters-and-limits-of-hosting-plans-in-hostinger
- https://docs.mapbox.com/accounts/guides/tokens/
