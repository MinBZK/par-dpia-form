# 0008: Backend in TypeScript

Datum: 2026-08-22

## Status

Geaccepteerd

## Besluit

De backend (`apps/boekhouding-backend`) is geschreven in TypeScript op Fastify, met Drizzle ORM op PostgreSQL en JWT-verificatie via `jose` tegen Keycloak.

Python is in dit project een build-time taal: de pipeline in `script/` valideert de YAML-bronnen, verrijkt ze met begrippen en exporteert JSON voor de frontend en de standalone invulhulp. Die pipeline raakt de backend-runtime niet.

Dit PDR legt die situatie terugwerkend vast. De keuze viel in maart 2026, toen de backend aan de monorepo werd toegevoegd, en is destijds niet opgeschreven.

## Achtergrond

Tot dat moment bestond de invulhulp alleen als browserapplicatie: de assessment-engine in `packages/assessment-core` en een standalone single-file build zonder server. Python zat er al in, voor de bronbestanden-pipeline, inclusief uv, ruff en pytest in CI. Toen de samenwerkomgeving een echte API nodig had, was de vraag dus niet "welke taal past bij een REST-API", maar "voegen we een tweede runtime toe of niet". Python was daarbij de vanzelfsprekende tegenkandidaat, omdat het al in de repo en in de pipelines stond.

Het is toen TypeScript geworden, zonder dat het waarom ergens is vastgelegd. De `docs/PDR/`-reeks ging tot nu toe uitsluitend over de inhoud van de formulieren, en er was geen technisch beslisdocument in de repo. Voor een EUPL-project dat op hergebruik mikt is dat een gat: een hergebruiker kan niet zien waarom dit Node is en onder welke voorwaarden dat zou veranderen.

De directe aanleiding om het alsnog op te schrijven is de constatering dat de invulhulpen qua taalkeuze afwijken van omliggende projecten binnen BZK, waar AMT op Python/FastAPI draait en RegelRecht op Rust.

## Overweging

Wat destijds de doorslag gaf, hier onderbouwd met de cijfers zoals de code er nu bij staat:

- **De frontend kan geen andere taal zijn.** De standalone invulhulp is een offline single-file build zonder server, dus de assessment-engine bestaat sowieso in TypeScript. Een Python-backend betekent onvermijdelijk twee talen; TypeScript betekent één.
- **Er is weinig backend-logica om ergens anders onder te brengen.** Van de circa 3.000 regels in `src/` is ongeveer 85 procent CRUD, HTTP, auth en autorisatie. De enige echte domeinlogica is `diffStates.ts` plus `rebuildState.ts`, samen ongeveer 390 regels rond de edit-log.
- **Er draait geen rekenwerk op de server.** PDF-export (pdfmake) en het verkleinen van afbeeldingen gebeuren client-side. Geen streaming, geen websockets; sync is polling. Het profiel is dun en I/O-gebonden, precies waar de taalkeuze het minst uitmaakt.
- **De schaalgrens is de database, niet de runtime.** `pods x DB_POOL_MAX <= 20`, zie `docs/deployment.md`. Een snellere runtime levert geen extra capaciteit op; een connection pooler wel.
- **De bezetting is klein.** Feitelijk één actieve maintainer op de backend. Eén taal voor de hele applicatie weegt dan zwaarder dan aansluiting bij het ecosysteem van naburige projecten.

## Details

Wat de keuze concreet inhoudt:

- Fastify 5 op Node, TypeScript, ESM.
- Drizzle ORM op PostgreSQL 17, migraties via drizzle-kit.
- JWT-verificatie met `jose` tegen Keycloak.
- JSON Schema (`schemas/`) en de uit de route-schema's gegenereerde OpenAPI als contract naar buiten.
- De Python-pipeline in `script/`, inclusief uv, ruff en pytest in CI.

Belangrijk voor de houdbaarheid: de backend heeft geen enkele compile-time koppeling met de rest van de monorepo. Geen `workspace:*`-dependency, geen type-imports naar `packages/assessment-core`. Het enige gedeelde artefact is `schemas/assessment-output.v2.schema.json`, ingelezen in `apps/boekhouding-backend/src/utils/validateState.ts`. Die naad plus de OpenAPI zijn taalneutraal, dus een herimplementatie in een andere taal is technisch nergens door geblokkeerd. Wie dat ooit doet, herschrijft de 390 regels edit-log-logica en zet er contracttests tegen de OpenAPI onder.

Wanneer we deze keuze opnieuw wegen:

1. Het beheer verhuist naar een team dat primair Python schrijft, bijvoorbeeld het AMT-team. De taalkeuze volgt de onderhouder, niet andersom.
2. Er komt server-side rekenwerk van betekenis, bijvoorbeeld PDF-generatie op de server, batchverwerking of analyse over meerdere assessments.
3. De assessment-engine moet gedeeld worden tussen browser en server. Dan wordt WebAssembly relevant en verschuift het voordeel richting een taal die daar goed naar compileert.

Zolang geen van deze drie speelt, is een taalwissel kosten zonder opbrengst: circa 3.000 regels broncode plus 8.200 regels integratietests opnieuw schrijven, onder een coveragedrempel van 100 procent die hard faalt in CI, terwijl er voor de gebruiker niets verandert.

## Impact

### Gebruikers

Geen. Dit is een intern beslisdocument zonder zichtbaar effect, en daarom ook geen CHANGELOG-vermelding.

### Ontwikkelteam

Eén taal en één toolchain voor de applicatie, plus Python voor de bronbestanden. Wie aan de backend werkt, heeft geen tweede runtime nodig.

### Andere componenten

Geen wijziging. De risico's die in deze discussie meeliften staan er los van en blijven open:

- Bus factor van 1 op de backend.
- De omvang van de npm-dependencyboom (circa 449 productiepakketten), het reële nadeel van Node ten opzichte van Python.
- De in-memory caches (`rebuildStateCache`, `userIdCache`) en per-pod rate limiting die horizontaal schalen in de weg zitten, plus de handmatige rekensom rond `DB_POOL_MAX`.

## Alternatieven

### Python met FastAPI

De reële tegenkandidaat, en het sterkste argument ervoor is organisatorisch: AMT draait op FastAPI en een deel van de bijdragers aan deze repo komt uit die hoek. Python stond bovendien al in de repo en in de CI, dus het had geen nieuwe toolchain toegevoegd, alleen een nieuwe rol voor een bestaande.

Niet gekozen omdat de technische winst bijna nul is: FastAPI met Pydantic levert ongeveer wat Fastify met JSON-schema's levert, inclusief OpenAPI uit de routes. Alembic vervangt Drizzle, `jsonschema` vervangt Ajv. Wat overblijft is de prijs: een tweede runtime om te onderhouden, te patchen en in elke container en pipeline mee te nemen, terwijl de frontend hoe dan ook TypeScript blijft.

Deze afweging kantelt zodra scenario 1 hierboven optreedt.

### Rust

Niet aan de orde geweest bij de oorspronkelijke keuze, en achteraf ook geen gemiste kans. De argumenten die Rust elders terecht winnen, gelden hier geen van alle: performance is niet de bottleneck (de databaseconnecties zijn dat), er is geen onveilig geheugenoppervlak (JWT, JSON Schema en SQL zijn overal library-werk), WebAssembly is nu niet aan de orde, en een steile leercurve is een slecht idee bij één maintainer. Het enige voordeel is een kleinere container met lager geheugenbeslag, wat niets oplost naast een limiet van 20 databaseconnecties.
