# Assessment Boekhouding

DPIA- en Pre-scan assessment-applicatie voor de overheid, gebouwd op het RVO component library.

## Structuur

pnpm monorepo met workspaces:

- `packages/assessment-core` — gedeelde assessment-engine (formulierweergave, navigatie, validatie, PDF-export)
- `apps/boekhouding-frontend` — Vue 3 SPA met multi-user projectbeheer, Keycloak-login
- `apps/boekhouding-backend` — Fastify REST API, PostgreSQL via Drizzle ORM
- `apps/standalone-form` — standalone formulier zonder backend (single HTML export)
- `sources/` — YAML-bronnen voor DPIA en Pre-scan assessments

## Conventies

- Taal: code in het Engels, UI-teksten en foutmeldingen in het Nederlands
- Comments in code: Engels
- Styling: RVO component library CSS (`@nl-rvo/component-library-css`), geen `<style scoped>` in Vue-componenten
- Package scope: `@par-assessment/*`
- Node 22, pnpm (via `corepack enable`)
- Transitive dependencies van `assessment-core` (zoals `pdfmake`) moeten ook in de consumerende app staan

## Ontwikkelen

```bash
# Volledige stack (backend + frontend + Keycloak + PostgreSQL)
podman compose up -d

# Alleen standalone formulier (geen backend nodig)
corepack enable   # activeert pnpm via Node.js
pnpm install
pnpm dev
```

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
- Gedeelde componenten komen uit `@par-assessment/core`
- Dialogen: native `<dialog>` met `showModal()` (focus trap automatisch, `::backdrop` voor overlay). Geen handmatige backdrop-divs of `.open` property.
- RVO buttons: `utrecht-button utrecht-button--primary-action utrecht-button--rvo-md` (NIET `--rvo-primary-action`). Varianten: `--primary-action`, `--secondary-action`, `--rvo-tertiary-action`. Sizes: `--rvo-xs`, `--rvo-md`

## Database

- Credentials dev: `parassessment` / `parassessment`
- Schema in `apps/boekhouding-backend/src/db/schema.ts`
- Na schemawijziging: `pnpm db:generate` en controleer gegenereerde SQL (Drizzle kan DROP+CREATE genereren i.p.v. ALTER TABLE RENAME)

## Keycloak dev-omgeving

- Config: `compose-dev-keycloak.json` (realm import bij eerste start)
- Admin: `admin` / `admin` op http://localhost:8080
- Testgebruikers: `jan@example.com` / `welkom123`, `piet@example.com` / `welkom123`
- Na wijziging realm config: `podman compose down -v && podman compose up -d` (volumes verwijderen zodat reimport plaatsvindt)
- Na wijziging backend/frontend code in containers: `podman compose up -d --build` (herbouw images)

## Debugging en verificatie

- Gebruik Playwright (via MCP) om UI-issues zelf te onderzoeken en te verifiëren. Log in als testgebruiker, navigeer naar de relevante pagina, en controleer het resultaat — zonder de gebruiker om screenshots te vragen.
- Bij visuele bugs of onverwacht gedrag: neem een screenshot, inspecteer de DOM via snapshots, en lees console messages om de oorzaak te achterhalen.
