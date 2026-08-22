# 0008: Backend in TypeScript

Datum: 2026-08-22

## Status

Geaccepteerd

## Besluit

De backend (`apps/boekhouding-backend`) blijft in TypeScript op Fastify. We stappen niet over op Python of Rust, ondanks dat verwante rijksprojecten dat wel doen: RegelRecht is in Rust, AMT in Python/FastAPI.

Python blijft beperkt tot de build-time pipeline in `script/` (YAML-bronnen valideren, verrijken en naar JSON exporteren). Die pipeline raakt de backend-runtime niet.

## Achtergrond

Er was geen enkel technisch beslisdocument in deze repo. De `docs/PDR/`-reeks gaat uitsluitend over de inhoud van de formulieren, en het waarom van de stack stond nergens vast. Voor een EUPL-project dat op hergebruik mikt is dat een gat: een hergebruiker kan niet zien waarom dit Node is en onder welke voorwaarden dat zou veranderen.

De aanleiding is de constatering dat de invulhulpen qua taalkeuze afwijken van de omliggende projecten binnen BZK.

## Overweging

Feiten uit de codebase die de afweging bepalen:

- **De backend is nauwelijks gekoppeld aan de rest van de monorepo.** Geen `workspace:*`-dependency en geen type-imports naar `packages/assessment-core`. Het enige gedeelde artefact is `schemas/assessment-output.v2.schema.json`, ingelezen in `apps/boekhouding-backend/src/utils/validateState.ts`. Het externe contract is OpenAPI, gegenereerd uit de route-schema's. Beide zijn taalneutraal, dus een herschrijving wordt technisch nergens door geblokkeerd.
- **Er is weinig domeinlogica.** Van de circa 3.000 regels in `src/` is ongeveer 85 procent CRUD, HTTP, auth en autorisatie. De echte logica is `diffStates.ts` plus `rebuildState.ts`, samen ongeveer 390 regels: het encode/replay-paar rond de edit-log.
- **Er draait geen rekenwerk op de server.** PDF-export (pdfmake) en het verkleinen van afbeeldingen gebeuren client-side; de standalone invulhulp heeft helemaal geen backend. Er is geen streaming en geen websocket-verkeer; sync is polling.
- **De schaalgrens is de database, niet de runtime.** `pods x DB_POOL_MAX <= 20`, zie `docs/deployment.md`. Sneller rekenen levert geen extra capaciteit op; een connection pooler wel.
- **De frontend moet TypeScript blijven.** De standalone invulhulp is een offline single-file build, dus de assessment-engine bestaat sowieso in TypeScript. De vraag is niet welke taal, maar of we er een tweede bij nemen.
- **Herschrijfkosten.** Circa 3.000 regels broncode plus 8.200 regels integratietests, onder een coveragedrempel van 100 procent die hard faalt in CI. Voor de gebruiker verandert er niets.

## Details

Wat blijft zoals het is:

- Fastify 5 op Node, TypeScript, ESM.
- Drizzle ORM op PostgreSQL 17, migraties via drizzle-kit.
- JWT-verificatie met `jose` tegen Keycloak.
- JSON Schema (`schemas/`) en de gegenereerde OpenAPI als contract naar andere talen. Dit blijft de naad waarlangs een toekomstige herimplementatie zou lopen.
- De Python-pipeline in `script/`, inclusief uv, ruff en pytest in CI.

Wanneer we dit besluit opnieuw wegen:

1. Het beheer verhuist naar een team dat primair Python schrijft (bijvoorbeeld het AMT-team). De taalkeuze volgt de onderhouder, niet andersom.
2. Er komt server-side rekenwerk van betekenis, bijvoorbeeld PDF-generatie op de server, batchverwerking of analyse over meerdere assessments.
3. De assessment-engine moet gedeeld worden tussen browser en server. Dan wordt WebAssembly relevant en verschuift het voordeel richting Rust.

Zolang geen van deze drie speelt, is een taalwissel kosten zonder opbrengst.

## Impact

### Gebruikers

Geen. Dit is een intern besluit zonder zichtbaar effect, en daarom ook geen CHANGELOG-vermelding.

### Ontwikkelteam

Eén taal voor de hele applicatie blijft de doorslaggevende reden. Bij de huidige bezetting van feitelijk één actieve maintainer weegt dat zwaarder dan aansluiting bij het ecosysteem van naburige projecten.

### Andere componenten

Geen wijziging. De risico's die in deze discussie meeliften staan er los van en blijven open:

- Bus factor van 1 op de backend.
- De omvang van de npm-dependencyboom (circa 449 productiepakketten), het reële nadeel van Node ten opzichte van Python en Rust.
- De in-memory caches (`rebuildStateCache`, `userIdCache`) en per-pod rate limiting die horizontaal schalen in de weg zitten, plus de handmatige rekensom rond `DB_POOL_MAX`.

## Alternatieven

### Python met FastAPI

Het serieuze alternatief, en het sterkste argument ervoor is organisatorisch: AMT draait op FastAPI en een deel van de bijdragers aan deze repo komt uit die hoek. Python zit bovendien al in de repo en in de CI, dus het voegt geen nieuwe toolchain toe.

Niet gekozen omdat de winst technisch bijna nul is: FastAPI met Pydantic levert ongeveer wat Fastify met JSON-schema's al levert, inclusief OpenAPI uit de routes. Alembic vervangt Drizzle, `jsonschema` vervangt Ajv. Daar staat een herschrijving van ruim 11.000 regels tegenover, plus een tweede runtime om te onderhouden en te patchen.

### Rust

Niet gekozen. De vier argumenten die Rust elders terecht winnen, gelden hier geen van alle: performance is niet de bottleneck (de databaseconnecties zijn dat), er is geen onveilig geheugenoppervlak (JWT, JSON Schema en SQL zijn overal library-werk), WebAssembly is nu niet aan de orde, en een steile leercurve is een slecht idee bij bus factor 1. Het enige voordeel is een kleinere container met een lager geheugenbeslag, wat niets oplost naast een limiet van 20 databaseconnecties.

Rust komt terug in beeld als scenario 3 hierboven werkelijkheid wordt.
