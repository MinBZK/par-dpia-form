# PAR Assessments

[![Status: Beta](https://img.shields.io/badge/Status-Beta-yellow.svg)](https://github.com/MinBZK/par-dpia-form)
[![License: EUPL v1.2](https://img.shields.io/badge/License-EUPL_v1.2-blue.svg)](LICENSE)

Webapplicatie voor het uitvoeren van DPIA- en Pre-scan DPIA-assessments, volgens het Rijksmodel DPIA van de Nederlandse overheid. Gebouwd met het [RVO component library](https://nl-design-system.github.io/rvo/).

## Kenmerken

- DPIA en Pre-scan DPIA invullen in de browser als losstaande applicatie
- Samenwerken aan DPIA's en Pre-scan DPIA's via de Assessment Boekhouding:
  - Samenwerken aan assessments met meerdere gebruikers
  - Projectbeheer met rollen (eigenaar, bewerker, kijker)
  - Voortgang opslaan en later hervatten
  - PDF-export van ingevulde assessments

## Architectuur

pnpm monorepo:

| Package                      | Omschrijving                                                                    |
|------------------------------|---------------------------------------------------------------------------------|
| `packages/assessment-core`   | Gedeelde assessment-engine: formulierweergave, navigatie, validatie, PDF-export |
| `apps/boekhouding-frontend`  | Vue 3 SPA — projectbeheer, samenwerken, Keycloak-login                          |
| `apps/boekhouding-backend`   | Fastify REST API — PostgreSQL, JWT-authenticatie                                |
| `apps/standalone-form`       | Standalone formulier — draait zonder backend, exporteert als single HTML        |
| `sources/`                   | YAML-bronbestanden voor DPIA en Pre-scan assessments                            |

### Technologie

- **Frontend**: Vue 3 (Composition API), TypeScript, Vite, Pinia
- **Backend**: Fastify 5, Drizzle ORM, PostgreSQL 17
- **Auth**: Keycloak (OIDC), JWT-verificatie via `jose`
- **Styling**: RVO Design System
- **Standalone**: Vite single-file build — alles (HTML, CSS, JS) in één bestand
- **PDF**: pdfmake

## Aan de slag

### Vereisten

- **Volledige stack**: Podman of Docker
- **Standalone formulier**: Node.js 22+ en [pnpm](https://pnpm.io/installation) (via `corepack enable`)

### Volledige stack

Start PostgreSQL, Keycloak en de applicatie met één commando. Wil je alleen een formulier invullen zonder backend? Zie [Standalone formulier](#standalone-formulier).

```bash
podman compose up -d
```

| Service              | URL                                              |
|----------------------|--------------------------------------------------|
| Frontend             | http://localhost:5174                            |
| Backend API          | http://localhost:3000                            |
| Standalone formulier | http://localhost:5175                            |
| Keycloak admin       | http://localhost:8080 (`admin` / `admin`)        |

Testgebruikers: `sam@example.com` / `welkom123`, `noor@example.com` / `welkom123`

Vul de database met realistische testdata (vereist Node.js 22+ en pnpm):

```bash
corepack enable
pnpm install
cd apps/boekhouding-backend
pnpm db:migrate   # eenmalig, na eerste start
pnpm db:seed      # idempotent, kan herhaaldelijk gedraaid worden
```

Dit maakt drie projecten aan (een pre-scan met antwoorden, een DPIA met versiegeschiedenis, en een leeg project) gekoppeld aan de testgebruikers.

### Standalone formulier

Voor ontwikkeling zonder backend (vereist Node.js 22+ en [pnpm](https://pnpm.io/installation)):

```bash
corepack enable
pnpm install
pnpm dev
```

### Bouwen

```bash
pnpm build:standalone   # Standalone HTML-bestand
pnpm build:backend      # Backend
pnpm build:frontend     # Frontend
```

## Commando's

| Commando              | Omschrijving                              |
|-----------------------|-------------------------------------------|
| `pnpm dev`            | Start standalone formulier                |
| `pnpm dev:backend`    | Start backend (vereist PostgreSQL)        |
| `pnpm dev:frontend`   | Start frontend                            |
| `pnpm db:generate`    | Genereer database-migraties               |
| `pnpm db:migrate`     | Voer migraties uit                        |
| `pnpm db:seed`        | Vul database met testdata (idempotent)    |
| `pnpm lint`           | Lint de code                              |

## Assessment-bronbestanden

De `sources/` directory bevat de assessment-definities in YAML:

| Bestand                      | Omschrijving                      |
|------------------------------|-----------------------------------|
| `dpia.yaml`                  | Volledige DPIA-definitie          |
| `prescan_dpia.yaml`          | Pre-scan DPIA-definitie           |
| `begrippenkader_dpia.yaml`   | Begrippenlijst met tooltips       |

### YAML verwerken

Vereist [uv](https://docs.astral.sh/uv/getting-started/installation/) (Python package manager).

```bash
# Valideer en genereer JSON voor standalone formulier
uv run script/run_all.py \
  --schema schemas/assessment-definition.v1.schema.json \
  --source sources/dpia.yaml \
  --begrippen-yaml sources/begrippenkader_dpia.yaml \
  --output-json form-app/src/assets/DPIA.json \
  --output-md docs/questions/questions_DPIA.md
```

## Standaarden en compliance

De Assessment Boekhouding conformeert aan de volgende overheidsstandaarden:

| Standaard | Status |
|-----------|--------|
| [NL GOV API Design Rules](https://logius-standaarden.github.io/API-Design-Rules/) | URI-versioning (`/api/v1/`), `application/problem+json`, security headers, `API-Version` header |
| [WCAG 2.2 AA](https://www.w3.org/TR/WCAG22/) | Gedeeltelijk — actieve verbetering, zie [toegankelijkheidsverklaring](apps/boekhouding-frontend/src/views/AccessibilityStatement.vue) |
| [BIO2](https://www.digitaleoverheid.nl/overzicht-van-alle-onderwerpen/cybersecurity/bio-en-ensia/) | JWT audience-validatie, rate limiting, input-validatie, security headers |
| [AVG / GDPR](https://autoriteitpersoonsgegevens.nl/) | Dataminimalisatie, RBAC, auditlog, [privacyverklaring](apps/boekhouding-frontend/src/views/PrivacyStatement.vue) |
| [EUPL-1.2](LICENSE) | Open source licentie conform open-tenzij beleid |

### Privacy en gegevensverwerking

Zie [docs/gegevensverwerking.md](docs/gegevensverwerking.md) voor een overzicht van verwerkte persoonsgegevens, rechtsgrond en bewaartermijnen.

## Documentatie

- [Product Decision Records](docs/PDR/README.md) — productbeslissingen en achtergrond
- [Gegevensverwerking](docs/gegevensverwerking.md) — privacy en dataminimalisatie
