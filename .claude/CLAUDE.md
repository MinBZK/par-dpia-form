# Assessment Boekhouding

Pre-scan-, DPIA- en IAMA-assessment-applicatie voor de overheid, gebouwd op het RVO component library.

## Structuur

pnpm monorepo met workspaces:

- `packages/assessment-core` — gedeelde assessment-engine (formulierweergave, navigatie, validatie, PDF-export)
- `apps/boekhouding-frontend` — Vue 3 SPA met multi-user projectbeheer, Keycloak-login
- `apps/boekhouding-backend` — Fastify REST API, PostgreSQL via Drizzle ORM
- `apps/standalone-form` — standalone formulier zonder backend (single HTML export)
- `sources/` — YAML-bronnen voor Pre-scan-, DPIA- en IAMA-assessments
- `containers/` — Containerfiles, nginx.conf, compose.yaml voor development en productie

## Conventies

- Taal: code in het Engels, UI-teksten en foutmeldingen in het Nederlands
- Comments in code: Engels
- Styling: RVO component library CSS (`@nl-rvo/component-library-css`), geen `<style scoped>` in Vue-componenten
- Package scope: `@overheid-assessment/*`
- Node 22, pnpm (via `corepack enable`)
- Transitive dependencies van `assessment-core` (zoals `pdfmake`) moeten ook in de consumerende app staan als Vite ze niet resolved via de workspace-link. In de container-omgeving worden ze automatisch mee-geïnstalleerd via `pnpm install`.
- Geen eenregelige wrapper-functies — roep de oorspronkelijke functie direct aan

## Ontwikkelen

```bash
# Volledige stack (backend + frontend + Keycloak + PostgreSQL)
podman compose -f containers/compose.dev.yaml up -d
pnpm db:seed  # testdata laden (idempotent, na eerste keer optioneel)

# Alleen standalone formulier (geen backend nodig)
corepack enable   # activeert pnpm via Node.js
pnpm install
pnpm dev
```

### Compose override voor host-specifieke poorten of reverse proxy

`containers/compose.dev.yaml` staat vast (gecommit) en gaat uit van directe poort-bindings (5432, 8080, 3000, 5174, 5175). Voor hosts waar die poorten bezet zijn of waar een reverse proxy (bijv. Caddy) voor staat, gebruik een niet-gecommitte `containers/compose.override.yaml`:

```bash
podman compose -f containers/compose.dev.yaml -f containers/compose.override.yaml up -d
```

Let op: compose voegt lijsten **samen** in plaats van te vervangen. Alleen een override met `ports: - "5433:5432"` levert zowel `5432:5432` als `5433:5432` op (en faalt als 5432 bezet is). Gebruik de YAML-tag `!reset` om de lijst eerst leeg te maken:

```yaml
services:
  postgres:
    ports: !reset
      - "5433:5432"
  keycloak:
    ports: !reset []     # niet rechtstreeks exposen; via reverse proxy
  backend:
    ports: !reset
      - "3001:3000"
```

Host-lokale bestanden die bij zo'n override horen (`Caddyfile.local`, `certs/`, `compose-dev-keycloak.local.json`, `compose.override.yaml`) staan in `.gitignore` en worden niet gedeeld tussen machines.

### TypeScript-configs met extends

De tsconfigs in `apps/*` en `packages/*` erven gedeelde instellingen via `extends` (bijv. `@vue/tsconfig/tsconfig.dom.json`). Houd project-specifieke afwijkingen in de bestaande `tsconfig.json` / `tsconfig.app.json` / `tsconfig.node.json`; voeg geen lokale override-bestanden toe. Cross-package type-resolution loopt via pnpm workspace-links, niet via TypeScript `references`.

## Backend

- Fastify 5, TypeScript, ESM (`"type": "module"`)
- Database: PostgreSQL 17 via Drizzle ORM
- Auth: Keycloak JWT-verificatie via `jose` met audience-validatie (geen cookies/sessies)
- Migraties: `pnpm db:generate` → `pnpm db:migrate`
- Realm: `assessment-boekhouding`, client: `boekhouding-frontend`
- API-routes onder `/api/v1/` (NL GOV API Design Rules: major versie in URI-pad)
- Foutresponses: `application/problem+json` (RFC 9457)
- Security: `@fastify/helmet` (security headers), `@fastify/rate-limit`, `API-Version` response header

## Frontend

- Vue 3 Composition API, TypeScript, Vite
- Auth: `keycloak-js` met `onLoad: 'check-sso'` (publieke pagina's zonder login, router guard voor beschermde routes)
- API-calls via `api.ts` naar `/api/v1/`, Bearer token via `useAuth().getToken()`
- Gedeelde componenten komen uit `@overheid-assessment/core`
- Dialogen: native `<dialog>` met `showModal()` (focus trap automatisch, `::backdrop` voor overlay). Geen handmatige backdrop-divs of `.open` property.
- RVO buttons: `utrecht-button utrecht-button--primary-action utrecht-button--rvo-md` (NIET `--rvo-primary-action`). Varianten: `--primary-action`, `--secondary-action`, `--rvo-tertiary-action`. Sizes: `--rvo-xs`, `--rvo-md`

## Database

- Credentials dev: `parassessment` / `parassessment`
- Schema in `apps/boekhouding-backend/src/db/schema.ts`
- Na schemawijziging: `pnpm db:generate` en controleer gegenereerde SQL (Drizzle kan DROP+CREATE genereren i.p.v. ALTER TABLE RENAME). Controleer ook dat gegenereerde migraties geen `"public".` schema-prefix gebruiken bij tabelreferenties — nieuwere drizzle-kit versies voegen dit toe, maar eerdere migraties gebruiken het niet, wat FK-fouten veroorzaakt in containers.
- Testdata: `pnpm db:seed` (script in `scripts/seed-dev.ts`, niet in productie-code). Idempotent — kan herhaaldelijk gedraaid worden. Vereist draaiende PostgreSQL.

## Keycloak dev-omgeving

- Config: `containers/compose-dev-keycloak.json` (realm import bij eerste start)
- Admin: `admin` / `admin` op http://localhost:8080
- Testgebruikers: `sam@example.com` / `welkom123`, `noor@example.com` / `welkom123`
- Na wijziging realm config: `podman compose -f containers/compose.dev.yaml down -v && podman compose -f containers/compose.dev.yaml up -d`
- Na wijziging backend/frontend code in containers: `podman compose -f containers/compose.dev.yaml up -d --build`

## Testing & coverage

Elke workspace test met **Vitest**. Scripts per workspace: `test` (`vitest run`) en `test:coverage` (`vitest run --coverage`). Volledige suite zoals CI: `pnpm -r --if-present test:coverage` (backend vereist `TEST_DATABASE_URL`, zie hieronder).

- **Coverage-provider: istanbul, niet v8.** v8 kan ongedekte Vue SFC's niet parsen (PARSE_ERROR via rollup); istanbul instrumenteert via de Vite-transformpipeline, dus `.vue`-bestanden tellen volwaardig mee. Daarom staat `@vitejs/plugin-vue` ook in de devDeps van `assessment-core`.
- **100%-drempel, hard afgedwongen.** Élk bronbestand telt mee, niet alleen geïmporteerde: de core-, backend- en frontend-config zetten `coverage.all: true`; de standalone-config laat het weg omdat vitest 4 dit als default doet en `all` uit het `CoverageOptions`-type verwijderde (en alleen de standalone-config wordt getypecheckt). Alle vier hebben `thresholds` op 100 voor statements/branches/functions/lines. Nieuwe of gewijzigde code moet de dekking op 100% houden — anders faalt CI.
- **Uitsluitingen** (`coverage.exclude`): alleen niet-uitvoerbare/bootstrap-bestanden — `*.d.ts`, `src/index.ts` (barrel), `src/assets/**` (CSS/fonts), en backend `db/migrate.ts` + `db/migrations/**`.
- **Testbestanden**: hand-geschreven tests in `test/`. De fijnmazige per-module dekkingstests staan onder `test/cov/` als `<naam>.cov.test.ts` — één self-contained bestand per bronmodule (dekt dat bestand zelfstandig, los van andere tests).
- **`istanbul ignore` alleen voor aantoonbaar onbereikbare defensieve code**, telkens mét een `-- reden`-justificatie. Geef de voorkeur aan een echte test, of het verwijderen van dode code, boven een ignore.
- **Snel één bestand controleren**: `pnpm --filter <pkg> exec vitest run <testbestand> --coverage --coverage.include='<bronbestand>'` — dan meet de drempel-100 alléén dat bestand, dus **exit 0 = bestand op 100%**.

### Backend-tests (integratie, vereisen Postgres)

- Draaien tegen een echte Postgres-testdatabase via `app.inject()` (de app wordt niet gemockt). Auth end-to-end met echte JWT's tegen een loopback-JWKS (`test/helpers/testJwks.ts`).
- Env `TEST_DATABASE_URL` (default `postgresql://parassessment:parassessment@localhost:5432/parassessment_test`). De database moet bestaan; migraties draaien idempotent in `test/setup.ts`.

  ```bash
  # eenmalig: testdatabase aanmaken (dev-postgres moet draaien)
  podman exec containers-postgres-1 psql -U parassessment -d parassessment -c "CREATE DATABASE parassessment_test"
  TEST_DATABASE_URL="postgresql://parassessment:parassessment@localhost:5432/parassessment_test" \
    pnpm --filter @overheid-assessment/boekhouding-backend test
  ```

- `fileParallelism: false` — suites delen één DB; `truncateAll` in `beforeEach` houdt tests geïsoleerd. Seed-helpers: `test/helpers/fixtures.ts`.

### standalone-form

- Heeft een **aparte** `vitest.config.ts`, los van `vite.config.ts`: de productie-vite-config laadt de singlefile-/favicon-inline-plugins die onder Vitest niet nodig (en storend) zijn.

## Containers & CI/CD

- Container config: `containers/` directory met Containerfiles, nginx.conf, compose.dev.yaml
- Frontend: `nginxinc/nginx-unprivileged` op poort 8080, security headers conform NCSC/BIO2
- Lokaal bouwen: `podman build -f containers/frontend/Containerfile -t frontend .` (vereist `sources/generated/`)
- CI: GitHub Actions workflows in `.github/workflows/`:
  - `build-standalone.yaml` — bouwt standalone formulier (main branch)
  - `build-containers.yaml` — bouwt frontend + backend containers → GHCR (experimenteel branch)
  - `release-and-deploy.yaml` — release naar GitHub Pages
  - `test.yaml` — type-check, tests én coverage (100%-drempel over alle workspaces; Postgres-service voor backend-integratietests)
- GHCR images: `ghcr.io/minbzk/par-dpia-form/dev/frontend` en `dev/backend` (publiek leesbaar)

## Assessment state format

Eén unified format voor DB (`cachedState`), file export én API communicatie. Gevalideerd door `schemas/assessment-output.v2.schema.json`.

```json
{
  "$schema": "...assessment-output.v2.schema.json",
  "metadata": {
    "createdAt": "2026-03-20T12:00:00Z",
    "urn": "urn:nl:dpia:3.0",
    "completedTasks": ["0", "1"]
  },
  "answers": {
    "0.1": { "value": "Inleiding", "lastEditedAt": "..." },
    "2.1": [
      { "_index": 0, "2.1.1": { "value": "E-mailadres" }, "2.1.2": { "value": "Medewerkers" } },
      { "_index": 2, "2.1.1": { "value": "Telefoon" }, "2.1.2": { "value": "Klanten" } }
    ]
  }
}
```

- Geen namespace-wrapping (`prescan`/`dpia`/`iama`) — namespace afgeleid uit `metadata.urn` (bijv. `urn:nl:prescan`, `urn:nl:dpia`, `urn:nl:iama`)
- Repeatable groepen als arrays met `_index` per element (gaps mogelijk bij verwijdering)
- `completedTasks` in `metadata`, geen apart `taskState` object
- `taskInstances` worden NIET opgeslagen — herbouwd bij laden uit task definities + answers
- `currentRootTaskId` en `activeNamespace` zijn UI-state → `localStorage` (per assessmentId)

### URN field identifiers (assessment_edits tabel)

De `assessment_edits` tabel gebruikt URN-based field IDs conform RFC 8141 r-component syntax:

- `urn:nl:dpia:3.0?=task_id=2.1.3` — niet-herhaalbaar veld
- `urn:nl:dpia:3.0?=task_id=2.1.3&task_index=0` — herhaalbaar veld met index
- `urn:nl:dpia:3.0?=task_id=completed.1` — sectie-voltooiing

De `?=` is de URN r-component (resolution), niet een typo voor `?`.

## Markdown in open tekstvelden

Open tekstvelden (`open_text` type) ondersteunen markdown-opmaak via [marked](https://marked.js.org/). Gebruikers schakelen tussen bewerken en lezen via een toggle-button naast het label.

### Architectuur

- `packages/assessment-core/src/utils/markdown.ts` — twee outputs:
  - `renderMarkdownToHtml()` — sanitized HTML voor de preview in de browser
  - `markdownToPdfContent()` — pdfmake Content-objecten voor PDF-export
- De HTML-renderer gebruikt een **allowlist-aanpak**: een custom `Marked` renderer produceert alleen veilige tags. Er is geen DOMPurify of andere post-processing sanitizer nodig.

### Beveiligingsmaatregelen

| Maatregel | Implementatie |
|-----------|---------------|
| Raw HTML stripping | `html()` renderer retourneert `''` — alle HTML-tags in invoer worden genegeerd |
| Image stripping | `image()` renderer retourneert `''` — zowel `<img>` als `![alt](url)` |
| Protocol allowlist (links) | Alleen `https:`, `http:` en `mailto:` toegestaan. `javascript:`, `data:`, `vbscript:` etc. worden gestript (link-tekst blijft, `<a>` tag wordt verwijderd). Geldt voor zowel HTML-preview als PDF-export. |
| Task list sanitization | GFM task list `<input type="checkbox">` elementen worden vervangen door unicode tekens (☐/☑) |
| Links openen in nieuw tabblad | `target="_blank"` met `rel="noopener noreferrer"` op alle links |

### Ondersteunde markdown-features

Paragraphs, headings, bold, italic, strikethrough, ordered/unordered lists, task lists, code (inline + block), blockquotes, horizontal rules, links. GFM is standaard ingeschakeld (tabellen worden in de preview gerenderd maar niet in de PDF).

### Bekende beperkingen

- Tabellen verschijnen in de preview maar worden niet omgezet naar PDF-tabellen (vallen terug op platte tekst)
- Afbeeldingen worden bewust gestript (security-first beslissing)
- Unicode checkbox-tekens (☐ vs ☑) renderen op macOS in verschillende stijlen door emoji/text rendering

## Debugging en verificatie

- Gebruik Playwright (via MCP) om UI-issues zelf te onderzoeken en te verifiëren. Log in als testgebruiker, navigeer naar de relevante pagina, en controleer het resultaat — zonder de gebruiker om screenshots te vragen.
- Bij visuele bugs of onverwacht gedrag: neem een screenshot, inspecteer de DOM via snapshots, en lees console messages om de oorzaak te achterhalen.
- Test altijd zowel de **standalone form** (`localhost:5175`) als de **boekhouding-frontend** (`localhost:5174`). Beide gebruiken assessment-core maar met verschillende persistence providers.
- Sluit na een Playwright-testronde altijd de browser met `browser_close` om te voorkomen dat Chrome-processen blijven hangen en volgende sessies blokkeren.
