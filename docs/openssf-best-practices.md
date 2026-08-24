# OpenSSF Best Practices: voorbereide antwoorden

De [OpenSSF Best Practices-badge](https://www.bestpractices.dev/) is een zelfverklaring: je vult een formulier in met per criterium een antwoord en een bewijs-URL. Dit document bevat die antwoorden, zodat invullen overtypen wordt.

Het formulier vereist inloggen met GitHub en kan dus niet vanuit de repository worden ingediend. Ga naar [bestpractices.dev](https://www.bestpractices.dev/), voeg dit project toe (`https://github.com/MinBZK/par-dpia-form`) en neem de antwoorden hieronder over. Zet daarna de badge in `README.md`; het project-id komt pas na aanmelden beschikbaar.

| Onderdeel | Waarde |
|-----------|--------|
| Niveau | passing (67 criteria: 43 MUST, 10 SHOULD, 14 SUGGESTED) |
| Opgesteld op | 24 augustus 2026 |
| Uitkomst | alle MUST-criteria Met of N/A, dus het niveau wordt gehaald |
| Niet gehaald | 1 SHOULD en 3 SUGGESTED, hieronder toegelicht |

Alleen MUST-criteria zijn bindend; SHOULD en SUGGESTED verbeteren de score maar blokkeren de badge niet.

## Niet gehaald, bewust

- **english** (SHOULD): de documentatie is Nederlandstalig, de code en comments Engels. Dat is een bewuste keuze voor een Nederlandse doelgroep, met dezelfde afweging als criterium 10 van de [Standard for Public Code](standard-for-public-code.md).
- **warnings_strict** (SUGGESTED): ESLint draait niet in CI en de frontend-tsconfig sluit `src/` uit van `vue-tsc --noEmit`. Bekend, staat als [#533](https://github.com/MinBZK/par-dpia-form/issues/533).
- **dynamic_analysis** (SUGGESTED): geen fuzzing of DAST. Container-images worden wel gescand.
- **dynamic_analysis_enable_assertions** (SUGGESTED): niet vastgelegd dat dynamische analyse met extra assertions draait.

## Basics

- **description_good** (MUST): Met. `README.md` opent met wat de software doet, zonder jargon; dezelfde tekst staat als `shortDescription` in `publiccode.yml`.
- **interact** (MUST): Met. `README.md` heeft een sectie "Bijdragen en hulp" met links naar issues, pull requests, `SUPPORT.md` en `CONTRIBUTING.md`.
- **contribution** (MUST): Met. https://github.com/MinBZK/par-dpia-form/blob/main/CONTRIBUTING.md beschrijft het proces; `GOVERNANCE.md` legt vast dat elke wijziging via een pull request gaat.
- **contribution_requirements** (SHOULD): Met. `CONTRIBUTING.md` beschrijft de DCO, de REUSE-eis voor nieuwe bestanden en de testverwachting; `GOVERNANCE.md` noemt de verplichte CI-checks.
- **floss_license** (MUST): Met. EUPL-1.2, https://github.com/MinBZK/par-dpia-form/blob/main/LICENSE
- **floss_license_osi** (SUGGESTED): Met. EUPL-1.2 staat op de OSI-lijst.
- **license_location** (MUST): Met. `LICENSE` in de root, plus `LICENSES/` en `REUSE.toml` voor machine-leesbare licentie-informatie per bestand.
- **documentation_basics** (MUST): Met. `README.md` beschrijft installeren, draaien en gebruiken; `docs/` bevat deployment, gegevensverwerking en de Product Decision Records.
- **documentation_interface** (MUST): Met. De REST-API is gedocumenteerd met OpenAPI via `@fastify/swagger`; Swagger UI en `/api/openapi.json` staan aan met `EXPOSE_API_DOCS`, beschreven in https://github.com/MinBZK/par-dpia-form/blob/main/apps/boekhouding-backend/README.md
- **sites_https** (MUST): Met. https://invulhulpen.rijksapp.nl en de repository zijn beide https.
- **discussion** (MUST): Met. https://github.com/MinBZK/par-dpia-form/issues staat open voor iedereen en wordt actief gebruikt.
- **english** (SHOULD): Unmet, zie hierboven.
- **maintained** (MUST): Met. 95 commits in de laatste 30 dagen, issues worden dezelfde week beantwoord.

## Change Control

- **repo_public** (MUST): Met. Publieke git-repository op https://github.com/MinBZK/par-dpia-form
- **repo_track** (MUST): Met. Elke wijziging is een commit met auteur, tijdstip en diff.
- **repo_interim** (MUST): Met. Tussen releases staan tientallen commits op `main`, met een lopende `## [Unreleased]`-sectie in `CHANGELOG.md`.
- **repo_distributed** (SUGGESTED): Met. Git.
- **version_unique** (MUST): Met. CalVer-tags, bijvoorbeeld `v2026.6.20`.
- **version_semver** (SUGGESTED): Met. CalVer `YYYY.M.D`, gedocumenteerd in `CHANGELOG.md` en `CONTRIBUTING.md`; eerdere releases volgden SemVer.
- **version_tags** (SUGGESTED): Met. https://github.com/MinBZK/par-dpia-form/tags
- **release_notes** (MUST): Met. `CHANGELOG.md` in Keep a Changelog-formaat; de release-workflow zet de sectie automatisch in de GitHub-release.
- **release_notes_vulns** (MUST): N/A. Er zijn geen publiek bekende kwetsbaarheden (CVE of vergelijkbaar) in een release verholpen; de beveiligingsregels in de changelog beschrijven hardening, geen CVE-fixes.

## Reporting

- **report_process** (MUST): Met. https://github.com/MinBZK/par-dpia-form/blob/main/CONTRIBUTING.md beschrijft hoe je een bug meldt, met issue-templates voor bug en feature.
- **report_tracker** (SHOULD): Met. GitHub Issues, met templates en labels.
- **report_responses** (MUST): Met. Van de 41 issues uit het venster van 2 tot 12 maanden geleden is 80 procent beantwoord of gesloten.
- **enhancement_responses** (SHOULD): Met. Dezelfde steekproef; verzoeken krijgen inhoudelijke opvolging, bijvoorbeeld #319 en #338.
- **report_archive** (MUST): Met. https://github.com/MinBZK/par-dpia-form/issues is publiek doorzoekbaar zonder login.
- **vulnerability_report_process** (MUST): Met. https://github.com/MinBZK/par-dpia-form/blob/main/SECURITY.md beschrijft private vulnerability reporting via GitHub en de CVD-procedure van het NCSC.
- **vulnerability_report_private** (MUST): Met. https://github.com/MinBZK/par-dpia-form/security/advisories/new
- **vulnerability_report_response** (MUST): N/A. Er zijn de afgelopen zes maanden geen kwetsbaarheidsmeldingen binnengekomen, dus er is geen reactietijd te melden.

## Quality

- **build** (MUST): Met. `pnpm build:standalone`, `build:backend` en `build:frontend` bouwen uit broncode; de Containerfiles in `containers/` bouwen daarop de productie-images.
- **build_common_tools** (SUGGESTED): Met. pnpm, Vite, tsc en uv, allemaal gangbaar voor dit ecosysteem.
- **build_floss_tools** (SHOULD): Met. Alle build-tools zijn FLOSS.
- **test** (MUST): Met. Vitest per workspace en pytest voor de Python-pijplijn, zichtbaar in https://github.com/MinBZK/par-dpia-form/blob/main/.github/workflows/test.yaml
- **test_invocation** (SHOULD): Met. Elke workspace heeft `test` en `test:coverage`; `pnpm -r --if-present test:coverage` draait alles.
- **test_most** (SUGGESTED): Met. Alle vier de vitest-configs zetten `coverage.include: ['src/**']` met een drempel van 100 procent op statements, branches, functions en lines.
- **test_continuous_integration** (SUGGESTED): Met. `test.yaml` draait op elke push naar `main` en elke pull request, met een Postgres-service voor de backend-integratietests.
- **test_policy** (MUST): Met. De 100 procent-drempel is het beleid: code zonder tests haalt de drempel niet en faalt CI. Staat sinds deze PR ook expliciet in `CONTRIBUTING.md`.
- **tests_are_added** (MUST): Met. Feature-PR's brengen consequent tests mee, bijvoorbeeld #493, #405, #382 en #474.
- **tests_documented_added** (SUGGESTED): Met. `CONTRIBUTING.md` vraagt bijdragers expliciet om tests bij nieuwe functionaliteit en noemt de dekkingsdrempel.
- **warnings** (MUST): Met. `tsc --noEmit`, `vue-tsc --noEmit` en ruff draaien in CI.
- **warnings_fixed** (MUST): Met. Die controles zijn blokkerende checks, dus meldingen worden voor de merge opgelost.
- **warnings_strict** (SUGGESTED): Unmet, zie hierboven.

## Security

- **know_secure_design** (MUST): Met. Deny-by-default autorisatie en tokenvalidatie in `apps/boekhouding-backend/src/middleware/auth.ts` (handtekening, issuer, audience, `azp`, `exp`), plus `@fastify/helmet` en `@fastify/rate-limit` in `src/app.ts`.
- **know_common_errors** (MUST): Met. Geparametriseerde queries via Drizzle, JSON Schema-validatie op alle routes, XSS voorkomen met een allowlist-markdownrenderer in `packages/assessment-core/src/utils/markdown.ts`, en een CSP zonder `unsafe-inline` met Trusted Types.
- **crypto_published** (MUST): Met. Alleen RS256 (RFC 7518), afgedwongen met een algoritme-allowlist; geen eigen protocollen.
- **crypto_call** (SHOULD): Met. Verificatie loopt via `jose`, geen eigen implementatie.
- **crypto_floss** (MUST): Met. `jose` is MIT-gelicentieerd.
- **crypto_keylength** (MUST): N/A. De sleutels worden beheerd door de gekoppelde Keycloak-instantie, buiten deze codebase.
- **crypto_working** (MUST): Met. Geen gebroken algoritmen in de code; RS256 gebruikt SHA-256.
- **crypto_weaknesses** (SHOULD): Met. Geen SHA-1 of vergelijkbaar zwak algoritme.
- **crypto_pfs** (SHOULD): N/A. TLS wordt buiten deze codebase getermineerd.
- **crypto_password_storage** (MUST): N/A. De applicatie slaat geen wachtwoorden op; authenticatie verloopt via Keycloak (OIDC).
- **crypto_random** (MUST): N/A. De software genereert geen sleutels, nonces of sessietokens; `nanoid` en database-UUID's dienen als niet-veiligheidskritische identifiers.
- **delivery_mitm** (MUST): Met. Broncode via https, images via GHCR, releases via GitHub Releases.
- **delivery_unsigned** (MUST): Met. Er wordt nergens een hash over http opgehaald en ongecontroleerd gebruikt.
- **vulnerabilities_fixed_60_days** (MUST): Met. Nul openstaande Dependabot- en code-scanning-meldingen; `pnpm audit --prod --audit-level high` blokkeert elke merge met een hoog risico in productie-dependencies.
- **vulnerabilities_critical_fixed** (SHOULD): Met. `.github/workflows/security-alert-digest.yaml` scant wekelijks en houdt een publieke tracking-issue bij die zichzelf sluit zodra alles opgelost is.
- **no_leaked_credentials** (MUST): Met. gitleaks draait als pre-commit-hook en in https://github.com/MinBZK/par-dpia-form/blob/main/.github/workflows/pre-commit.yaml; er is geen uitzonderingenlijst.

## Analysis

- **static_analysis** (MUST): Met. ruff draait verplicht op de Python-pijplijn via pre-commit, blokkerend op elke push en pull request. Kanttekening: de TypeScript- en Vue-code heeft wel een ESLint-configuratie maar die draait niet in CI, zie [#533](https://github.com/MinBZK/par-dpia-form/issues/533).
- **static_analysis_common_vulnerabilities** (SUGGESTED): Met. De ruff-configuratie in `pyproject.toml` selecteert onder meer de `S`-regels (flake8-bandit) en `B` (bugbear).
- **static_analysis_fixed** (MUST): Met. De pre-commit-workflow is een verplichte check, dus bevindingen blijven niet staan.
- **static_analysis_often** (SUGGESTED): Met. Draait op elke push en elke pull request.
- **dynamic_analysis** (SUGGESTED): Unmet, zie hierboven.
- **dynamic_analysis_unsafe** (SUGGESTED): N/A. Geen code in een geheugenonveilige taal; de repository bevat TypeScript, Vue, Python en shell.
- **dynamic_analysis_enable_assertions** (SUGGESTED): Unmet, zie hierboven.
- **dynamic_analysis_fixed** (MUST): N/A. Er wordt geen dynamische analyse toegepast, dus er zijn langs die weg geen bevindingen.
