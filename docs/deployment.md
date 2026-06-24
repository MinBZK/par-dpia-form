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
│   ├── /zonder-account/           → standalone form
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
  "ls /usr/share/nginx/html/zonder-account/ && cat /etc/nginx/nginx.conf"
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
| `OIDC_REALM`            | `invulhulpen` | Auto-inject door ZAD Keycloak |
| `OIDC_PUBLIC_CLIENT_ID` | `boekhouding-frontend`   | Auto-inject door ZAD Keycloak |
| `STANDALONE_URL`        | `/zonder-account/`          | Default is correct            |

### Backend (runtime)

| Variabele              | Default                      | ZAD                                       |
|------------------------|------------------------------|-------------------------------------------|
| `DATABASE_SERVER_FULL` | `postgresql://...@localhost` | Auto-inject door ZAD                      |
| `OIDC_URL`             | `http://localhost:8080`      | Auto-inject door ZAD Keycloak             |
| `OIDC_REALM`           | `invulhulpen`     | Auto-inject door ZAD Keycloak             |
| `OIDC_CLIENT_ID`       | `boekhouding-frontend`       | Auto-inject door ZAD Keycloak             |
| `PUBLIC_HOST`          | —                            | Auto-inject (volgt webadres → CORS + OpenAPI `contact.url`) |
| `PORT`                 | `3000`                       | Default is correct                        |
| `HOST`                 | `0.0.0.0`                    | Default is correct                        |
| `TRUST_PROXY`          | `1` (één hop)                | Default klopt voor ZAD (één OpenShift-router-hop) → `req.ip` is het echte client-IP voor per-IP rate-limiting. Alleen overschrijven voor andere topologie (CIDR) of `0` om uit te zetten. Nooit `true`. |
| `EXPOSE_API_DOCS`      | — (uit)                      | Laat uit in productie (Swagger UI + `/api/openapi.json` zijn dan niet bereikbaar). Zet op `true` voor dev/staging. |
| `WEB_CONCURRENCY`      | `1` (clustering uit)         | Aantal worker-processen. Laat op 1 (app is I/O-bound); verhogen **alleen** samen met een lagere `DB_POOL_MAX` — zie connectiebudget. Geclampt op `[1, 64]`. |
| `DB_POOL_MAX`          | `9`                          | Postgres-poolgrootte **per worker**. Geclampt op `[1, 20]` (de per-user cap). Zie connectiebudget. |
| `DB_CONNECT_TIMEOUT`   | `10` (s)                     | Default is correct. |
| `DB_IDLE_TIMEOUT`      | `30` (s)                     | Default is correct. |
| `DB_STATEMENT_TIMEOUT` | `15` (s)                     | Max queryduur voordat Postgres de query afbreekt — fail-fast i.p.v. een pooled connectie onbeperkt vasthouden. |
| `DB_IDLE_IN_TX_TIMEOUT`| `15` (s)                     | Max idle-in-transaction voordat de sessie wordt afgebroken (geeft een blokkerende connectie terug aan de pool). |
| `RATE_LIMIT_MAX`       | `300`                        | Verzoeken per IP per minuut (cluster-breed). Onder clustering deelt het entrypoint dit door het aantal workers; de in-memory store is per worker, dus de cluster-brede limiet is een benadering. |

### Connectiebudget (RIG-Postgres 20-cap)

De gedeelde RIG-Postgres capt **elke project-DB-user op 20 connecties totaal** (na een incident waarbij één project alle slots opslokte en Keycloak brak). Dat budget geldt over **álle pods, replica's én workers samen**:

```
pods × WEB_CONCURRENCY × DB_POOL_MAX  ≤  20
```

Een **rolling deploy** draait kort 2 pods (oude + surge), dus de default `2 × 1 × 9 = 18` zit krap onder 20. **Verhoog `replicas`, `maxSurge` of `WEB_CONCURRENCY` nooit zonder `DB_POOL_MAX` navenant te verlagen** — anders worden nieuwe DB-connecties geweigerd (HTTP 500). De backend logt bij startup een `WARN` als de waarden in deze pod het budget al dreigen te overschrijden. Voor echte schaal hoort een **connection pooler (PgBouncer)** vóór de DB, niet een grotere per-worker-pool.

### Niet nodig op ZAD

- `CORS_ORIGIN` — `PUBLIC_HOST` wordt automatisch gebruikt als fallback. Zet dit
  alleen handmatig (komma-gescheiden) als de app tijdelijk via meerdere hostnames
  bereikbaar moet zijn.
- `API_URL` — alleen voor Vite dev server proxy
- `NODE_ENV` — optioneel, Fastify gebruikt het voor logging format

## CI/CD

### Omgevingen

| Omgeving   | ZAD-deployment | Bijgewerkt door                                                     |
|------------|----------------|---------------------------------------------------------------------|
| Preview    | `pr-<nummer>`  | Elke PR naar `main` (kloon van `acceptatie`); opgeruimd bij sluiten |
| Acceptatie | `acceptatie`   | Elke push naar `main`                                               |
| Productie  | `productie`    | CalVer-tag (`vYYYY.M.D[.MICRO]`), via image-promotie                |

### Workflows

| Workflow                   | Trigger                                | Wat het doet                                                      |
|----------------------------|----------------------------------------|-------------------------------------------------------------------|
| `test.yaml`                | Push naar `main`, elke PR              | Type-checks, tests en coverage (100%-drempel)                     |
| `pre-commit.yaml`          | Push naar `main`, elke PR              | Linting via pre-commit                                            |
| `deploy-preview.yaml`      | PR naar `main`                         | Preview-deployment op ZAD, kloon van `acceptatie`                 |
| `deploy-acceptatie.yaml`   | Push naar `main`                       | Bouwt images → GHCR en werkt ZAD-deployment `acceptatie` bij      |
| `release.yaml`             | CalVer-tag                             | Valideert tag, maakt GitHub-release met changelog-notes, **start daarna `deploy-productie`**, en hangt het standalone formulier (offline single-file) als release-asset aan |
| `deploy-productie.yaml`    | Gestart door `release.yaml` (of handmatig) | Promoot de acceptatie-images naar de CalVer-tag (geen rebuild) en werkt ZAD-deployment `productie` bij |
| `build-standalone.yaml`    | Push/PR naar `main`                    | Bouwt standalone formulier (artifact)                             |

De deploy-workflows zetten uitsluitend de container-*images* van de componenten
(`[{name, image}]` via `zad-actions/deploy`). Domeinen, redirects en env-vars
worden in de ZAD Operations Manager beheerd, niet in de workflow.

### Een release uitbrengen

1. Verplaats in `CHANGELOG.md` de inhoud van `## [Unreleased]` naar een nieuwe
   sectie `## [YYYY.M.D] - YYYY-MM-DD` (versie zonder voorloopnullen) en breng
   die wijziging via een PR naar `main`.
2. Zet een tag op de gewenste main-commit en push die:

   ```bash
   git tag v2026.6.14
   git push origin v2026.6.14
   ```

3. De rest gaat vanzelf: `release.yaml` maakt eerst de GitHub-release met de
   changelog-sectie als notes; **pas daarna** start het `deploy-productie`, dat
   de bestaande acceptatie-images naar de CalVer-tag promoot en productie
   bijwerkt. Het standalone formulier wordt in een aparte job als release-asset
   aangehangen, zodat een hapering daarin de release of de productie-deploy niet
   blokkeert.

Voorwaarden: de tag staat op een commit op `main`, de tag is de nieuwste
CalVer (downgrade-bescherming), en de `Deploy acceptatie`-run voor die commit
is geslaagd (anders bestaat het te promoten image niet). De changelog-sectie
voor de versie moet bestaan, anders maakt `release.yaml` geen release en start
de productie-deploy niet. `deploy-productie` draait alleen via `release.yaml`
of handmatig (Run workflow met de tag), nooit los op een tag-push.

> **Eenmalige voorwaarde voor de eerste release:** `deploy-productie` wordt via
> `workflow_dispatch` gestart en is pas dispatchbaar zodra het bestand op de
> **default branch (`main`)** staat. Zet de eerste CalVer-tag dus pas nadat
> `release.yaml` én `deploy-productie.yaml` naar `main` zijn gemerged. Tagt
> iemand eerder, dan faalt `release.yaml` bewust bij de "Start productie-deploy"-stap
> met een duidelijke melding.

De productie-deploy is een **aparte, losgekoppelde run**: de release-run kan
groen zijn terwijl de gestarte `Deploy productie`-run zelfstandig faalt (bv.
downgrade-guard, ontbrekend image of een ZAD-fout). Controleer na een release
dus ook de `Deploy productie`-run in het Actions-tabblad.

### GHCR images

Images staan onder `ghcr.io/minbzk/par-dpia-form/dev/`:

| Image      | Tags                                                          |
|------------|---------------------------------------------------------------|
| `frontend` | `<sha>`, `latest`, `vYYYY.M.D[.MICRO]` (gepromote releases)   |
| `backend`  | `<sha>`, `latest`, `vYYYY.M.D[.MICRO]` (gepromote releases)   |

## ZAD configuratie

Elke deployment (`acceptatie`, `productie`, previews) bestaat uit twee
componenten; de image-tag verschilt per omgeving (acceptatie: `<sha>`,
productie: `vYYYY.M.D[.MICRO]`):

| Component  | Image                                       | Poort | Pad    | Domein (productie)        | Services                          |
|------------|---------------------------------------------|-------|--------|---------------------------|-----------------------------------|
| `frontend` | `ghcr.io/minbzk/par-dpia-form/dev/frontend` | 8080  | `/`    | `invulhulpen.rijksapp.nl` | `publish-on-web`                  |
| `api`      | `ghcr.io/minbzk/par-dpia-form/dev/backend`  | 3000  | `/api` | `invulhulpen.rijksapp.nl` | `publish-on-web`, `postgresql-database`, `keycloak` |

Configuratie via de ZAD Operations Manager UI.

De 301-redirect van het oude domein `assessments.rijksapp.nl` is **optioneel** en
**geen onderdeel van de productie-deployment**: het is een losse, eigen
ZAD-deployment met één `haproxy-redirect`-component die los van productie beheerd
en verwijderd kan worden.

## Container-hardening: readOnlyRootFilesystem

De `api`-deployment draait non-root (`USER 1000`, zie
`containers/backend/Containerfile`) en schrijft niets naar het
root-filesystem: logs gaan naar stdout, migraties naar Postgres en het
output-schema wordt alleen gelezen. Zet daarom in de ZAD Operations Manager voor
de `api`-deployment de runtime-optie **`readOnlyRootFilesystem: true`**, met één
expliciet beschrijfbaar pad voor Node's tijdelijke bestanden:

```yaml
securityContext:
  readOnlyRootFilesystem: true
  runAsNonRoot: true
  allowPrivilegeEscalation: false
volumes:
  - name: tmp
    emptyDir: {}
volumeMounts:
  - name: tmp
    mountPath: /tmp
```

De daadwerkelijke runtime-config wordt in de ZAD Operations Manager UI beheerd
(net als domeinen en env-vars), niet in deze repo. De backend-container is
hierop voorbereid: er zijn geen schrijfacties naar het applicatiepad nodig.

## Nginx security headers

De frontend container configureert de volgende headers conform NCSC/BIO2 richtlijnen:

- `X-Content-Type-Options: nosniff`
- `X-Frame-Options: SAMEORIGIN`
- `Referrer-Policy: strict-origin-when-cross-origin`
- `Permissions-Policy: geolocation=(), microphone=(), camera=()`
- `Content-Security-Policy: default-src 'self'; ...` (incl. `https://keycloak.rijksapp.nl`)
- `Strict-Transport-Security: max-age=31536000`
- `server_tokens off` (verberg nginx versie)

Configuratie in `containers/frontend/nginx/` (`nginx.conf`, `default.conf` en de gedeelde header-/CSP-`snippets/`).
