# Security Checklist

Living checklist for SchoolOS. Items marked [done] exist in this repo with
the pointer given; [ops] items are deployment-time responsibilities.

## Secrets management

- [done] No hard-coded secrets: all credentials come from environment
  (`SECRET_KEY`, `DATABASE_URL`, `REDIS_URL`, S3 keys, `SUPABASE_SERVICE_KEY`).
  `.env` is git-ignored; only `.env.example` (dev placeholders) is committed.
- [done] CI fails on committed secrets (gitleaks) and on HIGH/CRITICAL
  source findings (trivy fs).
- [done] Production refuses to boot with the dev secret (`ENV=prod` +
  default `SECRET_KEY` raises at startup).
- [ops] Prod/staging secrets live in a secret manager (Vault / cloud
  secret store), injected as env vars — never files, images, or chat.
- [ops] Rotate JWT signing keys, database passwords and storage keys on
  schedule and on personnel change; log reviews confirm no secret leakage.

## Application

- [done] Passwords hashed with bcrypt (12 rounds); tokens are short-lived
  JWT access (15 min) + rotating refresh.
- [done] Auth rate limits on sensitive routes (login 10/min) plus global
  Redis-backed rate limiting (429 with envelope errors).
- [done] Security headers on every response (`SecurityHeadersMiddleware`)
  and on the nginx frontend (defense in depth); HTTPS enforced at ingress.
- [done] Tenant isolation: per-request RLS session scope, object-level
  authorization, cross-tenant reads return 404.
- [done] Denied attempts (401/403) are audit-logged with actor/ip/UA.
- [done] Error responses never leak internals (tracebacks/SQL stay server-side).
- [done] `LOG_FORMAT=json` production logs carry no secrets, code, or stdin.

## E-Lab (untrusted code execution)

- [done] Student code runs ONLY in throwaway containers on elab workers:
  no network, capped mem/CPU/PIDs, read-only root, non-root, no caps.
- [done] Queue routing (`schoolos:jobs:elab` + `WORKER_QUEUES=elab`) keeps
  executions off general workers; only elab hosts mount the Docker socket.
- [done] Fail-closed: no daemon/image → `failed`, never host execution.
- [done] Quotas + rate limits per user and per tenant; source scrubbing
  with opt-in retention and purge.
- [ops] Elab nodes are dedicated and tainted; no tenant data on them.

## Supply chain & containers

- [done] Production images are multi-stage, minimal (no build tools), and
  run as non-root users (`appuser`, `nginx` on :8080).
- [done] CI gates: `pip-audit --strict` and `npm audit` (deps), trivy
  image scan (CRITICAL blocks), pinned lockfiles (`package-lock.json`).
- [done] Promote-by-digest: the digest CI tested is the digest deployed.
- [ops] Rebuild base images weekly and re-scan; patch or pin around newly disclosed base-image CVEs.

## Network & access

- [ops] TLS everywhere (CDN/ingress terminates, HSTS enabled); internal
  traffic on a private VPC; Postgres/Redis/storage reachable only from
  app subnets.
- [ops] Least privilege: distinct DB roles per service (migrations own DDL;
  app role is DML-only), per-bucket storage policies, no SSH to prod pods
  (exec via audited break-glass only).
- [ops] WAF + edge rate limits in front of the API; `/metrics` scraped on
  the private network only (never exposed publicly).

## Data protection & operations

- [ops] Encrypted backups + PITR, tested restores quarterly; encrypted
  volumes and object storage (SSE) by default.
- [ops] PII minimization: exports are tenant-scoped and audit-logged;
  define DPA/retention per customer contract.
- [ops] Incident runbooks linked from every alert (see MONITORING.md);
  post-incident reviews update this checklist.
