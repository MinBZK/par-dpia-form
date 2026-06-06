---
name: Run Dev Stack
description: Use when asked to run, start, spin up, or test the app locally (boekhouding frontend/backend, standalone form, full stack). Launches the containerized dev environment (postgres + keycloak + backend + frontend + standalone) via podman and verifies it.
version: 0.1.0
---

# Run the dev stack

Launches the full local environment from `containers/compose.dev.yaml`:
postgres + keycloak + backend + frontend + standalone. Verified working on
macOS with **podman** (no Docker Desktop daemon).

## Services & ports

| Service | Host URL | Notes |
|---------|----------|-------|
| frontend (boekhouding) | http://localhost:5174 | Vite dev, live-reload via `src/` mount |
| standalone (zelfstandig invullen) | http://localhost:5176 | host 5176 → container 5175 |
| backend API | http://localhost:3000/api | health: `/api/health` |
| keycloak | http://localhost:8080 | realm `assessment-boekhouding`; admin `admin`/`admin` |
| postgres | localhost:5432 | `parassessment`/`parassessment`; shared by backend **and** keycloak |

**App logins** (frontend → "Inloggen"): `sam@example.com` / `welkom123`,
`noor@example.com` / `welkom123`.

## Step 1 — point at the podman socket

`docker compose` (the CLI plugin) talks to podman's docker-compatible socket.
Do **not** rely on `podman compose`: it derives the socket path from `$TMPDIR`,
which can resolve to a non-existent path. Find the real socket and export
`DOCKER_HOST` (shell state does not persist between tool calls — repeat the
export in every command):

```bash
SOCK=$(podman machine inspect --format '{{.ConnectionInfo.PodmanSocket.Path}}' 2>/dev/null)
[ -S "$SOCK" ] || SOCK=$(find /var/folders /tmp -name 'podman*api.sock' 2>/dev/null | head -1)
export DOCKER_HOST="unix://$SOCK"
docker ps   # should connect, not error
```

If podman isn't running: `podman machine start`.

## Step 2 — build & start

```bash
docker compose -f containers/compose.dev.yaml up -d --build \
  postgres keycloak backend frontend standalone
```

First build pulls keycloak/postgres and builds 3 node images (~minutes).
The backend image runs DB migrations on start (idempotent).

### Required: generate `sources/generated/*.json` on the host

The frontend and standalone services mount `../sources:/app/sources`, which
**shadows** the JSONs the image generated at build time. The standalone
imports `sources/generated/DPIA.json` statically in `main.ts`, so without
these files on the host its Vite build fails with
`Failed to resolve import ".../sources/generated/DPIA.json"`. Generate them
once (the standalone container has the python toolchain; the mount writes
straight to the host):

```bash
docker compose -f containers/compose.dev.yaml exec -T standalone sh -c '
mkdir -p /app/sources/generated && \
python3 /app/script/run_all.py --schema /app/schemas/assessment-definition.v2.schema.json --source /app/sources/prescan_dpia.yaml --begrippen-yaml /app/sources/begrippenkader_dpia.yaml --output-json /app/sources/generated/PreScanDPIA.json && \
python3 /app/script/run_all.py --schema /app/schemas/assessment-definition.v2.schema.json --source /app/sources/dpia.yaml --begrippen-yaml /app/sources/begrippenkader_dpia.yaml --output-json /app/sources/generated/DPIA.json
'
```

These land in `sources/generated/` (untracked); Vite HMR picks them up.

## Step 3 — verify (don't just launch)

```bash
curl -s -o /dev/null -w '%{http_code}\n' http://localhost:3000/api/health   # 200
curl -s -o /dev/null -w '%{http_code}\n' http://localhost:5174/              # 200
curl -s -o /dev/null -w '%{http_code}\n' http://localhost:5176/              # 200
curl -s -o /dev/null -w '%{http_code}\n' \
  http://localhost:8080/realms/assessment-boekhouding/.well-known/openid-configuration  # 200
```

Then load http://localhost:5174 in a browser and confirm the landing page
("Zelfstandig invullen" / "Samenwerken") renders — a blank frame means a
failed launch.

## Daily ops

```bash
docker compose -f containers/compose.dev.yaml logs -f backend
docker compose -f containers/compose.dev.yaml restart backend   # after backend code change (built image, no mount)
docker compose -f containers/compose.dev.yaml down              # stop
docker compose -f containers/compose.dev.yaml down -v           # stop + wipe DB volume
```

Frontend & standalone hot-reload (their `src/` is volume-mounted); the
**backend** runs as a built image without a mount, so rebuild + restart it
after backend changes.

## Gotcha: pnpm version in the Containerfiles

The Containerfiles pin pnpm by integrity hash
(`corepack prepare pnpm@10.32.1+sha512.<hash> --activate`). This is
deliberate: `pnpm@latest` (11.x) **hard-fails** the image build on ignored
build scripts (`ERR_PNPM_IGNORED_BUILDS`, e.g. `esbuild`), whereas 10.32.1
only warns. esbuild's binary ships via platform optional-deps, so the ignored
build script is harmless at runtime. Bump the pin with
`corepack use pnpm@<version>` (it writes the `+sha512.` hash) — don't revert
to `@latest`.
