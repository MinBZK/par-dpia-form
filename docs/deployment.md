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
│   └── /.well-known/security.txt  → eigen bestand, gerenderd bij container-start
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

ZAD ondersteunt geen init containers of jobs. De backend container draait migraties automatisch bij het starten (`node dist/db/migrate.js && exec node dist/index.js`). Drizzle migraties zijn idempotent. De `exec` is nodig zodat node PID 1 wordt en SIGTERM ontvangt; zonder dat slikt de shell het signaal en werkt de graceful shutdown niet.

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

De frontend fetcht `/config.json` bij het laden. Dit bestand en `/.well-known/security.txt` worden bij container start gegenereerd via `envsubst` uit env vars. In development (Vite dev server) wordt teruggevallen op `VITE_*` env vars.

| Variabele               | Default                  | ZAD                           |
|-------------------------|--------------------------|-------------------------------|
| `OIDC_URL`              | `http://localhost:8080`  | Auto-inject door ZAD Keycloak |
| `OIDC_REALM`            | `invulhulpen` | Auto-inject door ZAD Keycloak |
| `OIDC_PUBLIC_CLIENT_ID` | `boekhouding-frontend`   | Auto-inject door ZAD Keycloak |
| `STANDALONE_URL`        | `/zonder-account/`          | Default is correct            |
| `PUBLIC_HOST`           | (geen)                   | Auto-inject volgt webadres; bepaalt de `Canonical` in `/.well-known/security.txt`. Onbekend/leeg (lokale build, of ZAD-injectie die uitvalt) laat de `Canonical`-regel gewoon weg in plaats van er een gok op te wagen: de container start altijd. |

### Backend (runtime)

| Variabele              | Default                      | ZAD                                       |
|------------------------|------------------------------|-------------------------------------------|
| `DATABASE_SERVER_FULL` | `postgresql://...@localhost` | Auto-inject door ZAD                      |
| `OIDC_URL`             | `http://localhost:8080`      | Auto-inject door ZAD Keycloak             |
| `OIDC_REALM`           | `invulhulpen`     | Auto-inject door ZAD Keycloak             |
| `OIDC_CLIENT_ID`       | `boekhouding-frontend`       | Auto-inject door ZAD Keycloak             |
| `OIDC_INTERNAL_URL`    | waarde van `OIDC_URL`        | Interne Keycloak-URL waarvan de JWKS wordt gehaald. **Moet https zijn**: de backend weigert te starten op plain HTTP, behalve op loopback of met de opt-in hieronder. |
| `OIDC_ALLOW_INSECURE_JWKS` | — (uit)                  | Alleen voor de container-dev-stack, waar Keycloak via servicenaam bereikbaar is. **Nooit zetten in een uitgerolde omgeving.** |
| `PUBLIC_HOST`          | —                            | Auto-inject (volgt webadres → CORS + OpenAPI `contact.url`) |
| `PORT`                 | `3000`                       | Default is correct                        |
| `HOST`                 | `0.0.0.0`                    | Default is correct                        |
| `TRUST_PROXY`          | `uniquelocal`                | Vertrouwt een directe peer alleen als die een privaat adres heeft (10/8, 172.16/12, 192.168/16, fc00::/7) → op ZAD is dat de OpenShift-router en nooit een buitenstaander, dus `req.ip` is het echte client-IP voor per-IP rate-limiting. Alleen overschrijven voor andere topologie (CIDR) of `0` om uit te zetten. Nooit `true`: dan vertrouwt de app elke peer, ook eentje die rechtstreeks verbindt. Een hop-count werkt sinds Fastify 5.12.1 niet meer en valt terug op de default. |
| `EXPOSE_API_DOCS`      | — (uit)                      | Laat uit in productie (Swagger UI + `/api/openapi.json` zijn dan niet bereikbaar). Zet op `true` voor dev/staging. |
| `DB_POOL_MAX`          | `9`                          | Postgres-poolgrootte **per pod**. Geclampt op `[1, 20]` (de per-user cap). Zie connectiebudget. |
| `DB_CONNECT_TIMEOUT`   | `10` (s)                     | Default is correct. |
| `DB_IDLE_TIMEOUT`      | `30` (s)                     | Default is correct. |
| `DB_STATEMENT_TIMEOUT` | `15` (s)                     | Max queryduur voordat Postgres de query afbreekt - fail-fast i.p.v. een pooled connectie onbeperkt vasthouden. |
| `DB_IDLE_IN_TX_TIMEOUT`| `15` (s)                     | Max idle-in-transaction voordat de sessie wordt afgebroken (geeft een blokkerende connectie terug aan de pool). |
| `RATE_LIMIT_MAX`       | `100`                        | Verzoeken per minuut per IP, alleen voor verkeer zonder geldig token (health-probes, docs, verlopen tokens). Inlogpogingen komen hier niet langs; die gaan naar Keycloak. De store is in-memory per pod, dus bij meerdere replica's is de effectieve limiet een veelvoud hiervan. |
| `RATE_LIMIT_USER_MAX`  | `1000`                       | Verzoeken per minuut per ingelogde gebruiker (sleutel is de geverifieerde `sub`), zodat collega's achter één kantoor-IP elkaars budget niet opeten. Ruim gezet omdat een 429 in de frontend stil faalt bij pollen en autosave. Ook per pod. |
| `SHUTDOWN_DELAY`       | `5` (s)                      | Wachttijd na SIGTERM voordat de server sluit, zodat Kubernetes de pod uit de service-endpoints haalt terwijl `/api/health` al 503 geeft. Moet ruim onder `terminationGracePeriodSeconds` (default 30s) blijven. |

### Connectiebudget (RIG-Postgres 20-cap)

De gedeelde RIG-Postgres capt **elke project-DB-user op 20 connecties totaal** (na een incident waarbij één project alle slots opslokte en Keycloak brak). Dat budget geldt over **álle pods, replica's én workers samen**:

```
pods × DB_POOL_MAX  ≤  20
```

Een **rolling deploy** draait kort 2 pods (oude + surge), dus de default `2 × 9 = 18` zit krap onder 20. **Verhoog `replicas` of `maxSurge` nooit zonder `DB_POOL_MAX` navenant te verlagen** - anders worden nieuwe DB-connecties geweigerd (HTTP 500). Het aantal pods staat in de ZAD Operations Manager en is buiten deze repo niet zichtbaar, dus deze rekensom is handwerk bij elke schaalwijziging. Voor echte schaal hoort een **connection pooler (PgBouncer)** vóór de DB, niet een grotere pool per pod.

### Graceful shutdown

Bij een rolling deploy stuurt de kubelet SIGTERM op hetzelfde moment dat de endpoint-controller de pod uit de service haalt; die twee planten zich onafhankelijk voort. De backend sluit daarom niet direct: `/api/health` gaat meteen op **503** (readiness faalt), daarna wacht het proces `SHUTDOWN_DELAY` seconden, en pas dan worden lopende requests afgerond en de DB-pool vrijgegeven. Zonder die volgorde krijgt de ingress bij elke deploy kortstondig 502's. In de Containerfile staat daarom `exec node`, zodat node PID 1 is en SIGTERM daadwerkelijk ontvangt.

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
| Preview    | `pr-<nummer>`  | PR met het label `preview` (kloon van `acceptatie`); opgeruimd zodra het label eraf gaat of de PR sluit |
| Acceptatie | `acceptatie`   | Elke push naar `main`                                               |
| Productie  | `productie`    | CalVer-tag (`vYYYY.M.D[.MICRO]`), via image-promotie                |

#### Een preview aanzetten

Een preview is opt-in: zet het label **`preview`** op de PR en de omgeving wordt
gebouwd en uitgerold; zolang het label staat, volgt elke nieuwe commit. Haal het
label eraf (of sluit de PR) en de deployment, de PR-comment en de preview-images
worden opgeruimd. Zonder label draait er niets, ook niet voor een PR die maanden
openstaat.

Het bouwen en scannen van de images gebeurt hoe dan ook, met of zonder label.
Het label bepaalt alleen of het gescande image ook naar GHCR gaat en wordt
uitgerold.

Merk op: een PR met een merge-conflict heeft geen merge-commit, en GitHub draait
`pull_request`-workflows vanaf die merge-commit. Het label doet dan niets tot het
conflict is opgelost.

### Workflows

| Workflow                   | Trigger                                | Wat het doet                                                      |
|----------------------------|----------------------------------------|-------------------------------------------------------------------|
| `test.yaml`                | Push naar `main`, elke PR              | Type-checks, tests en coverage (100%-drempel)                     |
| `pre-commit.yaml`          | Push naar `main`, elke PR              | Linting via pre-commit                                            |
| `pr-images.yaml`           | Elke PR naar `main`                    | Bouwt en scant beide images; publiceert naar GHCR en zet een preview op ZAD (kloon van `acceptatie`) alleen bij het label `preview` |
| `deploy-acceptatie.yaml`   | Push naar `main`                       | Bouwt images → GHCR en werkt ZAD-deployment `acceptatie` bij      |
| `tag-release.yaml`         | Handmatig (Run workflow, versie als invoer) | Draait álle release-guards en zet de tag **pas** als ze slagen; pusht de tag en start `release.yaml` |
| `release.yaml`             | CalVer-tag                             | Valideert tag, maakt GitHub-release met changelog-notes, **start daarna `deploy-productie`**, en hangt het standalone formulier (offline single-file) als release-asset aan |
| `deploy-productie.yaml`    | Gestart door `release.yaml` (of handmatig) | Promoot de acceptatie-images naar de CalVer-tag (geen rebuild) en werkt ZAD-deployment `productie` bij |
| `build-standalone.yaml`    | Push/PR naar `main`                    | Bouwt standalone formulier (artifact)                             |

De deploy-workflows zetten uitsluitend de container-*images* van de componenten
(`[{name, image}]` via `zad-actions/deploy`). Domeinen, redirects en env-vars
worden in de ZAD Operations Manager beheerd, niet in de workflow.

### Een release uitbrengen

1. Breng via een PR naar `main`:
   - in `CHANGELOG.md` de inhoud van `## [Unreleased]` naar een nieuwe sectie
     `## [YYYY.M.D]` (zonder voorloopnullen, zonder datum);
   - de assessments-plugin op dezelfde versie, met
     `python3 .claude/plugins/assessments/scripts/generate_plugin.py --set-version 2026.6.14`.
2. Start `tag-release` met de versie als invoer:

   ```bash
   gh workflow run tag-release.yaml -f version=2026.6.14
   ```

   Zet de tag niet met de hand. Faalt een guard, dan is de tag niet gezet: los
   de melding op, breng dat naar `main` en start opnieuw.

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

Images staan onder `ghcr.io/minbzk/par-dpia-form/`:

| Image      | Tags                                                          |
|------------|---------------------------------------------------------------|
| `frontend` | `<sha>`, `latest`, `vYYYY.M.D[.MICRO]` (gepromote releases)   |
| `backend`  | `<sha>`, `latest`, `vYYYY.M.D[.MICRO]` (gepromote releases)   |

Previews staan onder `preview/`.

De packages moeten **public** zijn: ZAD haalt de images zonder inloggegevens op.
Een package dat vanuit deze publieke repository wordt gepusht erft die
zichtbaarheid; controleer het bij een nieuw image.

Releases van vóór augustus 2026 staan onder `dev/`. Die packages blijven
bestaan voor een terugrol naar zo'n tag.

## ZAD configuratie

Elke deployment (`acceptatie`, `productie`, previews) bestaat uit twee
componenten; de image-tag verschilt per omgeving (acceptatie: `<sha>`,
productie: `vYYYY.M.D[.MICRO]`):

| Component  | Image                                       | Poort | Pad    | Domein (productie)        | Services                          |
|------------|---------------------------------------------|-------|--------|---------------------------|-----------------------------------|
| `frontend` | `ghcr.io/minbzk/par-dpia-form/frontend` | 8080  | `/`    | `invulhulpen.rijksapp.nl` | `publish-on-web`                  |
| `api`      | `ghcr.io/minbzk/par-dpia-form/backend`  | 3000  | `/api` | `invulhulpen.rijksapp.nl` | `publish-on-web`, `postgresql-database`, `keycloak` |

Configuratie via de ZAD Operations Manager UI.

De 301-redirect van het oude domein `assessments.rijksapp.nl` is **optioneel** en
**geen onderdeel van de productie-deployment**: het is een losse, eigen
ZAD-deployment met één `haproxy-redirect`-component die los van productie beheerd
en verwijderd kan worden.

### Slaapstand (sleep-mode) voor previews en acceptatie

Previews en `acceptatie` gaan na een deadline in **slaapstand**: ZAD schaalt ze
terug naar nul pods en zet er een wekkerpod voor in de plaats, die een
"applicatie wordt gestart"-pagina toont. Wie op de knop drukt, wekt de hele
deployment. Productie en de redirect vallen er buiten.

De slaapstand werkt samen met het `preview`-label: het label zorgt dat een
omgeving alleen ontstaat als iemand hem nodig heeft, de slaapstand zorgt dat hij
daarna alleen draait als iemand hem gebruikt. Samen houden ze het beslag op het
gedeelde cluster in verhouding tot wat we er werkelijk mee doen - rekenkracht en
energie die niemand gebruikt, hoort een dienst op gedeelde
overheidsinfrastructuur niet vast te houden.

De configuratie staat in ZAD (project `asses-k2n`), niet in deze repo:

```yaml
enabled: true
match: ["pr-*", "acceptatie"]   # productie en redirect vallen er buiten
sleep-after-deploy: 4h          # deadline na aanmaak en na elke rollout
sleep-after-wake: 4h            # nieuwe deadline na een wek-call
wake-mode: confirm              # pagina met knop; auto zou een crawler laten wekken
waker-component: frontend       # de wekker hoort op de URL die mensen openen
```

De deadlines staan bewust op een waarde die de wizard ook aanbiedt (`4h` t/m
`168h`). Een waarde daarbuiten - de API accepteert elke compacte duur, `90m`
bijvoorbeeld - kan die keuzelijst niet weergeven, en opslaan vanuit die stap
overschrijft hem dan met wat er wél in de lijst staat.

Uitlezen en wijzigen met de ZAD-CLI:

```bash
zadctl service config get sleep-mode -o yaml
zadctl service sleep-mode status pr-<nummer>   # awake | sleeping | waking | disabled
zadctl service sleep-mode wake pr-<nummer>
```

Laten slapen kan alleen in het portaal, met de knop *Deployment slapen* bij de
deployment: de CLI kent die overgang niet.

> **`config set` schrijft het hele document.** Sleutels die je niet noemt,
> verdwijnen en vallen terug op hun default - `enabled` dus op `false`, waarmee de
> slaapstand ongemerkt uit staat. De CLI waarschuwt, maar voert de opdracht
> daarna gewoon uit en meldt `success`. Lees eerst uit, geef daarna **alle**
> sleutels in één aanroep mee, en lees terug:
>
> ```bash
> zadctl service config set sleep-mode --set enabled=true \
>   --set 'match[0]=pr-*' --set 'match[1]=acceptatie' \
>   --set sleep-after-deploy=4h --set sleep-after-wake=4h \
>   --set wake-mode=confirm --set waker-component=frontend
> ```

Wat je moet weten voordat je hierop bouwt:

- **Het is slaapstand, geen sluimerstand.** De applicatie start koud op; sessies,
  caches en geheugen zijn weg. De backend draait bij die start eerst de
  migraties, dus wekken duurt langer dan een gewone podstart.
- **Er is geen inactiviteitsdetectie**, en die kan er ook niet komen: de
  tenant-Prometheus ziet het routerverkeer niet. Het is dus een deadline en geen
  idle-timer - een omgeving die de hele dag gebruikt wordt, valt na
  `sleep-after-deploy` alsnog in slaapstand. Na het wekken telt `sleep-after-wake`
  opnieuw, ongeacht wat je aan het doen bent; die staat daarom op vier uur, zodat
  één klik een dagdeel dekt. Een rollout (nieuwe image of upsert) wekt de
  deployment en zet een verse `sleep-after-deploy`-deadline.
- **`/api` geeft een 503 zolang de deployment slaapt.** Er is één wekker per
  deployment en die staat voor `frontend`. De frontend kan bovendien al ready zijn
  terwijl de api nog opstart; dan helpt één keer verversen.
- **De database slaapt niet mee, maar kost hier ook niets extra's.** Previews
  gebruiken de gedeelde databaseserver van het platform (scope `shared`), geen
  eigen Postgres-pod. Een slapende deployment geeft zijn connecties wel terug,
  wat ruimte scheelt binnen de 20-cap hierboven.

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
