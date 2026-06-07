# Deployment op ZAD (invulhulpen.rijksapp.nl)

De applicatie draait op ZAD onder het hoofddomein **invulhulpen.rijksapp.nl**.
Het oude domein **assessments.rijksapp.nl** is een HTTP 301-redirect naar het
nieuwe domein (een aparte `haproxy-redirect`-deployment), zodat bestaande links
blijven werken.

## Architectuur

```
URL: https://invulhulpen.rijksapp.nl
│
├── /                              → ZAD ingress → frontend (nginx:8080)
│   ├── /                          → Vue SPA
│   ├── /invulhulpen/              → standalone form
│   └── /.well-known/security.txt  → 302 → ncsc.nl
│
└── /api                           → ZAD ingress → api (node:3000)
                                     Fastify REST API

URL: https://assessments.rijksapp.nl   (legacy)
└── *                              → 301 → https://invulhulpen.rijksapp.nl
```

De app is host-agnostisch: de frontend roept de API same-origin/relatief aan
(`/api/...`), Keycloak-redirects worden afgeleid van `window.location.origin` en
de Content-Security-Policy is host-relatief.

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

## Domein en authenticatie: door ZAD beheerd

Het webadres (domein) van een deployment stel je in via de ZAD Operations
Manager: project details → deployments → deployment kiezen → blok
*Deployment: <naam>* → **Webadres**.

Op basis van dat webadres regelt ZAD de rest automatisch bij elke reconcile;
er hoeven nergens URL's met de hand gezet te worden:

- **Keycloak**: ZAD beheert per deployment een eigen client (`{project}-{deployment}`
  + een `-public` client voor `keycloak-js`). De `redirectUris` (`https://<host>/*`)
  en `webOrigins` worden afgeleid van het webadres en automatisch bijgewerkt
  zodra ze afwijken. Bij een domeinwissel worden de oude entries dus vervangen.
- **`PUBLIC_HOST`**: wordt afgeleid van het webadres en bepaalt zowel de CORS-origin
  (`config.cors.origin`) als de OpenAPI `contact.url` (`config.publicUrl`).
- **OIDC-variabelen** (`OIDC_URL`, `OIDC_REALM`, `OIDC_PUBLIC_CLIENT_ID`, ...) worden
  door ZAD Keycloak geïnjecteerd.

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

| Variabele              | Default                      | ZAD                                       |
|------------------------|------------------------------|-------------------------------------------|
| `DATABASE_SERVER_FULL` | `postgresql://...@localhost` | Auto-inject door ZAD                      |
| `OIDC_URL`             | `http://localhost:8080`      | Auto-inject door ZAD Keycloak             |
| `OIDC_REALM`           | `assessment-boekhouding`     | Auto-inject door ZAD Keycloak             |
| `OIDC_CLIENT_ID`       | `boekhouding-frontend`       | Auto-inject door ZAD Keycloak             |
| `PUBLIC_HOST`          | —                            | Auto-inject (volgt webadres → CORS + OpenAPI `contact.url`) |
| `PORT`                 | `3000`                       | Default is correct                        |
| `HOST`                 | `0.0.0.0`                    | Default is correct                        |
| `TRUST_PROXY`          | — (uit)                      | Zet op `1` (één OpenShift-router-hop) zodat `req.ip` het echte client-IP is en per-IP rate-limiting werkt. Nooit `true`. |
| `EXPOSE_API_DOCS`      | — (uit)                      | Laat uit in productie (Swagger UI + `/api/openapi.json` zijn dan niet bereikbaar). Zet op `true` voor dev/staging. |

### Niet nodig op ZAD

- `CORS_ORIGIN` — `PUBLIC_HOST` wordt automatisch gebruikt als fallback. Zet dit
  alleen handmatig (komma-gescheiden) als de app tijdelijk via meerdere hostnames
  bereikbaar moet zijn.
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

De deploy-workflow zet uitsluitend de container-*images* van de componenten
(`[{name, image}]` via `zad-actions/deploy`). Domeinen, redirects en env-vars
worden in de ZAD Operations Manager beheerd, niet in de workflow.

### GHCR images

Images staan onder `ghcr.io/minbzk/par-dpia-form/dev/`:

| Image      | Tags              |
|------------|-------------------|
| `frontend` | `<sha>`, `latest` |
| `backend`  | `<sha>`, `latest` |

## ZAD configuratie

De productie-deployment bestaat uit twee componenten:

| Component  | Image                                              | Poort | Pad    | Domein                    | Services                          |
|------------|----------------------------------------------------|-------|--------|---------------------------|-----------------------------------|
| `frontend` | `ghcr.io/minbzk/par-dpia-form/dev/frontend:latest` | 8080  | `/`    | `invulhulpen.rijksapp.nl` | `publish-on-web`                  |
| `api`      | `ghcr.io/minbzk/par-dpia-form/dev/backend:latest`  | 3000  | `/api` | `invulhulpen.rijksapp.nl` | `publish-on-web`, `postgresql-database`, `keycloak` |

Configuratie via de ZAD Operations Manager UI.

De 301-redirect van het oude domein `assessments.rijksapp.nl` is **optioneel** en
**geen onderdeel van de productie-deployment**: het is een losse, eigen
ZAD-deployment met één `haproxy-redirect`-component die los van productie beheerd
en verwijderd kan worden.

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
