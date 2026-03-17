# Deployment op ZAD (assessments.rijksapp.nl)

## Architectuur

```
URL: https://assessments.rijksapp.nl
│
├── /                              → ZAD ingress → frontend (nginx:8080)
│   ├── /                          → Vue SPA
│   ├── /invulhulpen/              → standalone form
│   └── /.well-known/security.txt  → 302 → ncsc.nl
│
└── /api                           → ZAD ingress → api (node:3000)
                                     Fastify REST API
```

## Containers lokaal bouwen

Vereist: `sources/generated/` moet aanwezig zijn (draai eerst `python script/run_all.py`).

```bash
podman build -f containers/frontend/Containerfile -t frontend .
podman build -f containers/backend/Containerfile -t backend .

# Verificatie
podman run --rm frontend sh -c \
  "ls /usr/share/nginx/html/invulhulpen/ && cat /etc/nginx/nginx.conf"
```

## Database migraties

ZAD ondersteunt geen init containers of jobs. De backend container draait migraties automatisch bij het starten (`node dist/db/migrate.js && node dist/index.js`). Drizzle migraties zijn idempotent.

## Environment variabelen

### Frontend (runtime via `config.json`)

De frontend fetcht `/config.json` bij het laden. Dit bestand wordt bij container start gegenereerd via `envsubst` uit env vars. In development (Vite dev server) wordt teruggevallen op `VITE_*` env vars.

| Variabele               | Default                  | ZAD                           |
|-------------------------|--------------------------|-------------------------------|
| `OIDC_URL`              | `http://localhost:8080`  | Auto-inject door ZAD Keycloak |
| `OIDC_REALM`            | `assessment-boekhouding` | Auto-inject door ZAD Keycloak |
| `OIDC_PUBLIC_CLIENT_ID` | `boekhouding-frontend`   | Auto-inject door ZAD Keycloak |
| `STANDALONE_URL`        | `/invulhulpen/`          | Default is correct            |

### Backend (runtime)

| Variabele              | Default                      | ZAD                           |
|------------------------|------------------------------|-------------------------------|
| `DATABASE_SERVER_FULL` | `postgresql://...@localhost` | Auto-inject door ZAD          |
| `OIDC_URL`             | `http://localhost:8080`      | Auto-inject door ZAD Keycloak |
| `OIDC_REALM`           | `assessment-boekhouding`     | Auto-inject door ZAD Keycloak |
| `OIDC_CLIENT_ID`       | `boekhouding-frontend`       | Auto-inject door ZAD Keycloak |
| `PUBLIC_HOST`          | —                            | Auto-inject door ZAD (→ CORS) |
| `PORT`                 | `3000`                       | Default is correct            |
| `HOST`                 | `0.0.0.0`                    | Default is correct            |

### Niet nodig op ZAD

- `CORS_ORIGIN` — `PUBLIC_HOST` wordt automatisch gebruikt als fallback
- `API_URL` — alleen voor Vite dev server proxy
- `NODE_ENV` — optioneel, Fastify gebruikt het voor logging format

## CI/CD

### Workflows

| Workflow                  | Trigger                    | Wat het doet                    |
|---------------------------|----------------------------|---------------------------------|
| `build-containers.yaml`  | Push naar dev branch       | Bouwt frontend + backend → GHCR  |
| `build-standalone.yaml`  | Push naar `main`           | Bouwt standalone formulier       |
| `release-and-deploy.yaml`| Push naar `main`           | Release naar GitHub Pages        |
| `test.yaml`              | Push/PR naar `main`        | Type-check en tests              |

### GHCR images

Images staan onder `ghcr.io/minbzk/par-dpia-form/dev/`:

| Image      | Tags              |
|------------|-------------------|
| `frontend` | `<sha>`, `latest` |
| `backend`  | `<sha>`, `latest` |

## ZAD configuratie

| Component  | Image                                              | Poort | Pad    | Services                          |
|------------|----------------------------------------------------|-------|--------|-----------------------------------|
| `frontend` | `ghcr.io/minbzk/par-dpia-form/dev/frontend:latest` | 8080  | `/`    | `publish-on-web`                  |
| `api`      | `ghcr.io/minbzk/par-dpia-form/dev/backend:latest`  | 3000  | `/api` | `postgresql-database`, `keycloak` |

Configuratie via de ZAD Operations Manager UI.

## Nginx security headers

De frontend container configureert de volgende headers conform NCSC/BIO2 richtlijnen:

- `X-Content-Type-Options: nosniff`
- `X-Frame-Options: SAMEORIGIN`
- `Referrer-Policy: strict-origin-when-cross-origin`
- `Permissions-Policy: geolocation=(), microphone=(), camera=()`
- `Content-Security-Policy: default-src 'self'; ...` (incl. `https://keycloak.rijksapp.nl`)
- `Strict-Transport-Security: max-age=31536000`
- `server_tokens off` (verberg nginx versie)

Configuratie in `containers/frontend/nginx.conf` en `containers/frontend/default.conf`.
