# E-Lab Architecture

Untrusted student code execution. The governing rule: **student code never
runs in the FastAPI process, in a worker process, on the database host, or
anywhere near tenant data**. It runs in throwaway containers on the worker
host, and only there.

```
Browser ──▶ FastAPI ──▶ Redis queue ──▶ Worker ──▶ Isolated container
 (never        (never        (job id        (orchestrates,   (executes,
 executes)    executes)       only)          never executes)   then removed)
                                                     │
                                                     ▼
                                              Result store (Postgres)
```

## Execution flow

1. `POST /elab/runs` validates (language allowlist, source/stdin size caps,
   per-user concurrency + daily quotas, per-tenant daily quota) and stores a
   `queued` row with the SHA-256 of the source. Returns `202 { execution_id }`.
2. The worker claims the job, flips the row to `running`, and hands the
   source to the execution backend.
3. The backend runs the snippet in a fresh container with the source and
   stdin injected over the Docker API (no shared volumes), streams output
   with a hard cap, enforces the timeout, then **always removes** the
   container — success, failure, timeout, and crash paths alike.
4. The worker writes the terminal status (`completed`, `failed`, `timeout`,
   `cancelled`), stdout/stderr, exit code, stage and runtime back to the row,
   scrubs the source unless retention is enabled, and audit-logs the run.
5. Clients poll `GET /elab/runs/{id}` and may `DELETE` it to cancel.

## Container sandbox

Built by `container_config()` in `app/workers/elab_backend.py`; asserted by
`tests/test_elab_security.py::test_container_config_locks_down_everything`:

| Control | Value |
|---|---|
| Network | disabled |
| Memory | 256 MB hard cap (`mem_limit` = `memswap_limit`, no swap escape) |
| CPU | 0.5 core (`cpu_quota 50000 / period 100000`) |
| Processes | PID limit 64 (fork-bomb containment) |
| Filesystem | read-only root; `/work` tmpfs rw+exec 64 MB; `/tmp` tmpfs rw+noexec 16 MB |
| User | uid/gid 10000 (never root) |
| Capabilities | `cap_drop: ALL`, `no-new-privileges` |
| Mounts/ports/devices | none — no socket mount, no volumes, no sysctls |

Containers start as `sleep infinity` holders; the snippet is staged via
`put_archive` and run via `exec_run` so the worker can stream output and
kill on timeout/cancel. stdout and stderr are each capped at
`ELAB_MAX_OUTPUT_KB` (default 64 KB) with a truncation marker.

## Languages

| Language | Image | Phases |
|---|---|---|
| python | `schoolos/elab-python:1.0` | run |
| javascript | `schoolos/elab-node:1.0` | run |
| c | `schoolos/elab-gcc:1.0` | compile → run |
| cpp | `schoolos/elab-gcc:1.0` | compile → run |

Build with `elab/docker/build.sh`. The `stage` column (`compile` / `run`)
tells clients which phase failed for compiled languages.

## Failure semantics

- **Timeout**: watchdog kills the container after `ELAB_TIMEOUT_SECONDS`
  (default 5 s); the client can distinguish `timeout` from a nonzero exit.
- **Cancel**: `DELETE` flips queued runs immediately; for running runs it
  sets `cancel_requested` and the backend kills the container / process tree.
- **Backend unavailable** (no daemon, missing image, unknown backend name):
  the run fails closed with a `backend unavailable` marker. Unknown
  `ELAB_BACKEND` values resolve to Docker, which then fails closed the
  same way — there is no path that silently executes on the host.

## Local backend (dev/test only)

`ELAB_BACKEND=local` **and** `ELAB_ALLOW_INSECURE_LOCAL=true` together
enable a subprocess backend that runs Python snippets directly on the worker
host with RLIMITs and process-group kill. It exists so the frontend demo and
the unit suite run without Docker; it refuses every non-Python language and
logs a loud warning on every execution. Production must never set the flag.

## Multi-tenancy

- Students see only their own runs; teachers/admins see their tenant's runs
  (class scoping for teachers follows the existing enrollment rule).
- Cross-tenant access returns 404, same as a missing id.
- Quotas are enforced per user (concurrent + daily) and per tenant (daily);
  breaches return 429 `rate_limited`.

## Data retention

- The source SHA-256 is always kept (audit / dedup); outputs and audit rows
  are kept with the run.
- Source and stdin are scrubbed on completion unless `ELAB_RETAIN_SOURCE`
  is true. Retained sources are purged by an hourly worker job after
  `ELAB_SOURCE_RETENTION_DAYS` (default 30).
- Structured worker logs carry execution metadata only —
  never source code or stdin.

## Adversarial testing

- `tests/test_elab_security.py` — sandbox contract without a daemon:
  container config, fail-closed backends, quotas, cancel paths, scrubbing,
  purge, tenant isolation. Always runs.
- `tests/test_elab_docker.py` (`needs_docker`) — live adversarial matrix:
  infinite loop, fork bomb, memory hog, network egress, filesystem writes,
  process spray, root/capability/socket escape checks, output bomb, and
  mid-run container kill. Requires a daemon plus the execution images.
