# Standard for Public Code: zelfevaluatie

Dit is de zelfevaluatie van Invulhulpen tegen de [Standard for Public Code](https://standard.publiccode.net/) versie 0.8.0. De standaard bestaat uit zestien criteria met normatieve eisen (MUST, SHOULD, OPTIONAL). Deze evaluatie legt per criterium vast waar de codebase staat, met bewijs, en wat er nodig is om een gat te dichten.

Het is een zelfevaluatie, geen certificering. De Foundation for Public Code heeft dit niet getoetst.

De criteria 4, 5, 7 en 14 zijn bijgewerkt nadat `SUPPORT.md` en `GOVERNANCE.md` waren toegevoegd en `publiccode.yml` was hernoemd; criterium 13 nadat de repository REUSE-compliant werd.

| Onderdeel | Waarde |
|-----------|--------|
| Standaard | Standard for Public Code v0.8.0 |
| Getoetst op | 24 augustus 2026 |
| Getoetste versie | commit `9849da6` op `main` |
| Uitgevoerd door | het onderhoudsteam |
| Volgende ronde | bij de eerstvolgende jaarlijkse herijking, of eerder bij grote wijzigingen |

## Samenvatting

| # | Criterium | Oordeel |
|---|-----------|---------|
| 1 | [Code in the open](#1-code-in-the-open) | Voldaan |
| 2 | [Bundle policy and source code](#2-bundle-policy-and-source-code) | Voldaan |
| 3 | [Make the codebase reusable and portable](#3-make-the-codebase-reusable-and-portable) | Gedeeltelijk |
| 4 | [Welcome contributors](#4-welcome-contributors) | Gedeeltelijk |
| 5 | [Make contributing easy](#5-make-contributing-easy) | Voldaan |
| 6 | [Maintain version control](#6-maintain-version-control) | Voldaan |
| 7 | [Require review of contributions](#7-require-review-of-contributions) | Gat |
| 8 | [Document codebase objectives](#8-document-codebase-objectives) | Gedeeltelijk |
| 9 | [Document the code](#9-document-the-code) | Gedeeltelijk |
| 10 | [Use plain English](#10-use-plain-english) | Bewuste afwijking |
| 11 | [Use open standards](#11-use-open-standards) | Grotendeels |
| 12 | [Use continuous integration](#12-use-continuous-integration) | Voldaan |
| 13 | [Publish with an open license](#13-publish-with-an-open-license) | Voldaan |
| 14 | [Make the codebase findable](#14-make-the-codebase-findable) | Gedeeltelijk |
| 15 | [Use a coherent style](#15-use-a-coherent-style) | Gedeeltelijk |
| 16 | [Document codebase maturity](#16-document-codebase-maturity) | Voldaan |

Eén criterium heeft een gat op een MUST-eis: bijdragen van het onderhoudsteam gaan naar `main` zonder dat review afdwingbaar is (criterium 7). Wat we in plaats daarvan doen, staat in `GOVERNANCE.md`. Eén criterium halen we bewust niet: de documentatie is Nederlands, terwijl de standaard Engels als gezaghebbende taal eist (criterium 10).

## 1. Code in the open

**Voldaan.**

- Alle broncode staat publiek op [github.com/MinBZK/par-dpia-form](https://github.com/MinBZK/par-dpia-form), zonder login te bekijken.
- Het beleid staat er ook: `sources/prescan.yaml`, `sources/dpia.yaml`, `sources/iama.yaml` en de begrippenkaders.
- Geen gevoelige informatie in de repo of de historie. De enige credentials zijn bewuste dev-waarden (`containers/compose.dev.yaml`) en testgebruikers.
- Ontwikkeling verloopt in kleine, aan issues gekoppelde commits en pull requests, niet in langlopende privéforks.
- Kanttekening: werk ontstaat soms eerst op een niet-publieke Forgejo-instantie voordat het als PR op GitHub landt. Alles komt uiteindelijk publiek samen, maar dit is niet beschreven in `CONTRIBUTING.md`.

## 2. Bundle policy and source code

**Voldaan.** Dit is het sterkste punt van de codebase.

- Het Rijksmodel DPIA 3.0 en het IAMA staan als YAML in `sources/`, in dezelfde repo, releases en reviewstroom als de code die ze uitvoert.
- Het beleid is machine-leesbaar en ondubbelzinnig: gevalideerd tegen `schemas/assessment-definition.v2.schema.json` en `schemas/begrippenkader.v1.schema.json`.
- CI bewaakt de samenhang tussen beleid en code bij elke push en PR (`.github/workflows/test.yaml`), aangevuld met `script/tests/test_schema_validation.py` en tests in `packages/assessment-core`.
- Data en interpreterende logica zijn gescheiden: `sources/` (data), `schemas/` (contract), `packages/assessment-core` (logica), met gegenereerde leesbare overzichten in `docs/questions/` en `docs/tasks/`.

## 3. Make the codebase reusable and portable

**Gedeeltelijk.**

Wat er staat: de stack is volledig open source (PostgreSQL, Keycloak, Fastify, Vue 3, nginx), lokaal te draaien via `containers/compose.dev.yaml`, en contextafhankelijke instellingen lopen via omgevingsvariabelen (`containers/frontend/nginx/config.json.template`, `docs/deployment.md`).

Wat ontbreekt:

- `containers/frontend/nginx/snippets/csp-app.conf` bevat `https://keycloak.rijksapp.nl` hardcoded in de CSP, terwijl de rest van de Keycloak-configuratie wel geparametriseerd is. Een andere organisatie kan het frontend-image daardoor niet zonder patch gebruiken.
- `docs/deployment.md` beschrijft alleen de ZAD-route. Er is geen beschrijving van een generieke container- of Kubernetes-deployment.
- `packages/assessment-core` heeft geen README, terwijl het de module is die het meeste kans op hergebruik heeft.
- `usedBy` in `publiccode.yml` noemt alleen BZK, en er is geen publieke roadmap waaruit meerdere partijen spreken.
- `localisationReady: false`: de UI is niet lokaliseerbaar. Dat is verdedigbaar voor een wettelijk Nederlands kader, maar staat nergens als bewuste keuze gemotiveerd.

## 4. Welcome contributors

**Gedeeltelijk.**

- Iedereen kan issues en pull requests indienen, en dat gebeurt ook: onder meer de issues #451, #449 en #417 en de samengevoegde PR's #424 en #272 komen van buiten het team.
- `CONTRIBUTING.md`, `CODE_OF_CONDUCT.md` en issue- en PR-templates zijn aanwezig.
- `GOVERNANCE.md` beschrijft wie het project onderhoudt, hoe besluiten tot stand komen en wie waarover gaat, inclusief het onderscheid tussen besluiten over de software en over de inhoud van de assessments.
- `SUPPORT.md` en `GOVERNANCE.md` benoemen dat het onderhoudsteam dit naast ander werk doet en dat er geen reactietermijn wordt gegarandeerd, zodat duidelijk is wie de kosten van reviewen draagt.
- Gat: er is geen publieke roadmap. De openstaande issues fungeren als informele backlog, maar zijn niet als roadmap geprioriteerd.

## 5. Make contributing easy

**Voldaan.**

- De responsible-disclosure-kant is sterk: `SECURITY.md` beschrijft private vulnerability reporting via GitHub en de CVD-route van het NCSC, met scope en bekende non-findings.
- `README.md` heeft een sectie "Bijdragen en hulp" met links naar de issues, de pull requests, `SUPPORT.md`, `CONTRIBUTING.md`, `GOVERNANCE.md`, `CODE_OF_CONDUCT.md` en `SECURITY.md`.
- `SUPPORT.md` wijst per soort vraag het kanaal aan: issues voor gebruik en bugs, de rol-mailbox digigilde@rijksoverheid.nl voor wie geen issue kan of wil openen, `SECURITY.md` voor kwetsbaarheden, en dezelfde mailbox voor meldingen onder de gedragscode.
- Alle contactadressen in de repository wijzen nu naar diezelfde rol-mailbox, ook de privacyverklaring, de toegankelijkheidsverklaring en de OpenAPI-info van de backend.

## 6. Maintain version control

**Voldaan.**

- Alles staat in Git, met leesbare commitberichten die het waarom vastleggen, niet alleen het wat.
- Commits verwijzen waar mogelijk naar issues en PR's.
- Releases zijn getagd, CalVer sinds `v2026.6.20`, en het releaseproces staat in `CONTRIBUTING.md`.
- Los eindje: de PR-template vraagt akkoord met de DCO (`DCO.md`), maar er is geen `Signed-off-by` in de commits en geen DCO-check in CI. Ondertekenen is optioneel in de standaard, maar belofte en praktijk lopen hier uiteen. Kies: handhaven met een DCO-check, of de checkbox schrappen.

## 7. Require review of contributions

**Gat.** Dit is het enige criterium met een openstaande MUST-eis.

De eis: elke bijdrage die in de codebase terechtkomt wordt door een andere contributor gereviewd, ook die van maintainers.

De praktijk:

- De ruleset op `main` eist nominaal één goedkeuring plus code-owner-review, met `test`, `pre-commit` en beide image-scans als verplichte checks.
- Diezelfde ruleset staat `OrganizationAdmin` en repository-rol 5 toe om altijd te bypassen (`bypass_mode: always`).
- De twaalf meest recent samengevoegde pull requests zijn alle twaalf van de hoofdmaintainer en hebben nul reviews.
- Externe bijdragen worden wél gereviewd (PR #424 en #272), maar de doorlooptijd loopt op tot weken of maanden, ver boven de twee werkdagen die de standaard als richtlijn geeft.

Wat we hierover hebben besloten staat in [`GOVERNANCE.md`](../GOVERNANCE.md): bijdragen van buiten worden altijd door een maintainer gereviewd, en bij bijdragen van het onderhoudsteam beoordeelt de auteur of een tweede paar ogen nodig is. Die inschatting is niet vrijblijvend; er staat een lijst van gevallen waarin een tweede reviewer verplicht is, waaronder authenticatie en autorisatie, databasemigraties, persoonsgegevens, de inhoud van `sources/` en de beveiligingsconfiguratie van de containers.

Daarmee is de praktijk beschreven en toetsbaar, maar het criterium blijft een gat: de standaard vraagt review van álle bijdragen, zonder risico-afweging. Om het gat te sluiten is één wijziging nodig, namelijk repository-rol 5 uit `bypass_actors` halen zodat de bestaande CODEOWNERS-regel ook voor het team afdwingbaar wordt. Het onderhoudsteam telt vier leden, dus er is geen structurele belemmering; de kosten zitten in doorlooptijd.

Los daarvan: de doorlooptijd van reviews op externe bijdragen loopt op tot weken of maanden, ver boven de twee werkdagen die de standaard als richtlijn geeft.

## 8. Document codebase objectives

**Gedeeltelijk.**

- De doelstelling staat beschreven in `docs/rapport/rapport_v0.1.1.md`, maar dat document dateert van vóór de IAMA-uitbreiding en de samenwerkfunctionaliteit, en wordt niet genoemd in de documentatielijst van `README.md`.
- De koppeling met de onderliggende beleidsdoelen is impliciet: `docs/standard/form_standard.md` noemt het Rijksmodel DPIA 3.0, `docs/gegevensverwerking.md` verwijst naar AVG artikel 35, maar er is geen link naar het beleid dat DPIA- en IAMA-gebruik voorschrijft.
- Kleinste stap: een korte "Doel"-alinea in `README.md`, met links naar de beleidsbronnen.

## 9. Document the code

**Gedeeltelijk.**

- Installeren en draaien is goed gedocumenteerd (`README.md`), en `apps/boekhouding-backend/README.md` is uitgebreid.
- Gat: `packages/assessment-core`, `apps/boekhouding-frontend` en `apps/standalone-form` hebben geen eigen README.
- Gat: er zijn geen voorbeelden of schermafbeeldingen van de kernfunctionaliteit (een assessment invullen en exporteren, samenwerken, PDF-export).
- De README opent direct met vaktermen. Twee of drie zinnen in gewone taal over wat een DPIA en een IAMA zijn, en waarom ze bestaan, maken het geheel toegankelijk voor journalisten en beleidsmakers.
- `docs/deployment.md` bevat een architectuurdiagram, maar dat is niet gelinkt vanuit de documentatiesectie van de README.
- Documentatiekwaliteit wordt in CI alleen op kapotte links gecontroleerd (`broken-link-and-begrippenkader-sync.yaml`).

## 10. Use plain English

**Bewuste afwijking, met één gat dat we wel dichten.**

De standaard eist letterlijk dat Engels een van de gezaghebbende talen is en dat alle documentatie in alle gezaghebbende talen actueel is. Sinds v0.8.0 mogen daarnaast andere talen gezaghebbend zijn.

Onze situatie:

- Broncode en code-comments zijn Engels. Dat voldoet aan de MUST-eis over broncode.
- De assessmentinhoud in `sources/*.yaml` is Nederlands. Dat valt onder de uitzondering voor beleid dat als code wordt geïnterpreteerd.
- README, CHANGELOG en `docs/` zijn Nederlands, omdat de doelgroep Nederlandse overheidsorganisaties zijn die een wettelijk Nederlands kader invullen.

De afwijking: er is geen Engelse documentatie, dus Engels is geen gezaghebbende taal en de MUST-eis wordt niet gehaald. Volledig voldoen zou betekenen dat alle documentatie in twee talen actueel gehouden wordt, en die onderhoudslast weegt niet op tegen het bereik.

Wat we wel doen:

- Het talenbeleid expliciet vastleggen (Nederlands gezaghebbend, code en comments Engels), zodat de eerste MUST-eis, "documenteer de set gezaghebbende talen", wel gehaald wordt. Nu leeft die conventie alleen in interne instructies.
- Een Engelse samenvatting van de README toevoegen, zodat hergebruik buiten Nederland mogelijk blijft. Die is een courtesy translation, geen gezaghebbende versie.
- Een begrippenlijst toevoegen of afkortingen bij eerste gebruik uitleggen: DPIA, IAMA, DTIA, AVG, BIO2, PDR en CalVer staan nu grotendeels onverklaard in de README.

## 11. Use open standards

**Grotendeels.**

- De gebruikte standaarden zijn open en aantoonbaar geïmplementeerd: `application/problem+json` (RFC 9457), de `API-Version`-header en URI-versioning conform de NL GOV API Design Rules (`apps/boekhouding-backend/src/app.ts`), JSON Schema, OpenAPI, EUPL-1.2 als SPDX-identifier, security.txt (RFC 9116).
- De standaardentabel in `README.md` is onvolledig: OpenAPI, JSON Schema en RFC 9116 ontbreken, terwijl ze wel gebruikt worden.
- Gat: niet-open onderdelen zijn nergens als zodanig gemarkeerd. ZAD is een intern rijksplatform en GHCR is een leveranciersregistry. Beide zitten alleen in deployment en CI, niet in de applicatiecode, maar dat onderscheid hoort expliciet in `docs/deployment.md` te staan.
- De schema's worden in CI gevalideerd; er is geen Spectral-lint op de OpenAPI-spec tegen de ADR-ruleset en geen geautomatiseerde toegankelijkheidstest.

## 12. Use continuous integration

**Voldaan.**

- Alle workspaces draaien hun testsuite bij elke wijziging, met een harde dekkingsdrempel van 100% per workspace.
- `test`, `pre-commit` en beide image-scans zijn verplichte statuschecks op `main`.
- De repo is publiek, dus de uitkomsten van CI zijn zonder login te zien.
- `CONTRIBUTING.md` en de PR-template sturen op één issue per bijdrage en op logisch gegroepeerde commits.
- Enige SHOULD die ontbreekt: dekking wordt afgedwongen maar niet als trend of badge zichtbaar gemaakt.

## 13. Publish with an open license

**Voldaan.**

- De hoofdlicentie is in orde: EUPL-1.2, OSI- en FSF-erkend, volledige tekst in `LICENSE`, vermeld in `README.md` en in `publiccode.yml`. Bijdragers hoeven geen auteursrecht over te dragen.
- De repository volgt de [REUSE-specificatie](https://reuse.software/) 3.3: `REUSE.toml` legt de licentie per pad vast en `LICENSES/` bevat de bijbehorende teksten. Elk van de 473 bestanden heeft daarmee machine-leesbare licentie- en copyright-informatie. Bewust gekozen boven een SPDX-header per bestand, omdat dat met ~460 bestanden vooral merge-conflicten oplevert zonder extra compliance.
- De uitzondering is expliciet: `packages/assessment-core/src/assets/fonts/rijksoverheidsanstext-*.ttf` staat als `LicenseRef-Rijkshuisstijl` geannoteerd, met de voorwaarden in `LICENSES/LicenseRef-Rijkshuisstijl.txt`. De webfont komt sinds de overstap uit `@nldd/design-system`, dat de fonts zelf meelevert met een licentievermelding; deze `.ttf`-bestanden blijven zolang de PDF-export ze nodig heeft (pdfmake kan geen woff2).
- `reuse lint` draait als pre-commit-hook en daarmee in de verplichte `pre-commit`-check op `main`. Let op de grens: de `**`-regel licenseert nieuwe bestanden vanzelf als EUPL-1.2, dus code die van elders komt heeft een handmatige annotatie nodig. Dat staat in `CONTRIBUTING.md`.
- De licenties van dependencies staan in `docs/third-party-licenses.txt`, gegenereerd door `script/generate_licenses.py`. De lijst was verouderd; hij is bijgewerkt en `pnpm check:licenses` bewaakt in CI dat hij dat blijft. Platformspecifieke binaries worden weggelaten, anders zou de uitkomst per besturingssysteem verschillen.
- De lijst bevat sinds de overstap naar `@nldd/design-system` geen `Unknown`-licenties meer: `@nl-rvo/design-tokens` publiceerde zonder licentieveld, en dat pakket is weg.

## 14. Make the codebase findable

**Gedeeltelijk.**

- Naam, beschrijving en `publiccode.yml` zijn inhoudelijk in orde, en de software heeft een eigen domein (invulhulpen.rijksapp.nl).
- `publiccode.yml` komt zonder waarschuwingen door de officiële [publiccode-parser](https://github.com/italia/publiccode-parser-go) en door het JSON-schema van SchemaStore, en noemt de organisatie met haar TOOI-identifier (`https://identifier.overheid.nl/tooi/id/ministerie/mnre1034`). Dat is de identifier waar het open-sourceregister op koppelt.
- Gat: de repo staat nog niet in het open-sourceregister op oss.developer.overheid.nl. De git-organisatie MinBZK is daar wel aangesloten, dus indexering verloopt via hun crawler; het bestand heette tot voor kort `publiccode.yaml` en werd daardoor waarschijnlijk overgeslagen. Verschijnt de repo na de eerstvolgende ronde niet, dan is een mail naar developer.overheid@geonovum.nl de route.
- `releaseDate` en `softwareVersion` volgen de laatste release, bewaakt door `script/ci/assert-publiccode-version.sh`.
- Gat: geen `CITATION.cff` of vergelijkbare persistente identifier.
- De repo-slug `par-dpia-form` bevat de onverklaarde afkorting "par". De naam in `publiccode.yml` is wel beschrijvend.

## 15. Use a coherent style

**Gedeeltelijk.**

- De tooling is er: ESLint met Vue-plugin, Prettier, EditorConfig, ruff voor Python, shellcheck, gitleaks.
- Gat: ESLint en Prettier draaien nergens in CI. Alleen ruff, shellcheck en de basiscontroles van pre-commit worden afgedwongen; het root-`lint`-script wordt in geen enkele workflow aangeroepen.
- Gat: er is geen stijlgids voor mensen. `CONTRIBUTING.md` verwijst niet naar de linterconfiguraties en zegt niets over verwachtingen rond comments en documentatie in de code.
- YAML, Markdown en SQL hebben geen stijlcontrole.

## 16. Document codebase maturity

**Voldaan.**

- De volwassenheid staat prominent: `developmentStatus: beta` in `publiccode.yml` en een statusbadge in `README.md`, consistent met elkaar.
- Versies zijn getagd en de versioneringsmethode is gedocumenteerd (`CHANGELOG.md` legt de overstap van SemVer naar CalVer uit).
- `CHANGELOG.md` houdt de wijzigingen per release bij, gericht op wat gebruikers merken.
- Aandachtspunt: de `package.json`-versies van de workspaces staan nog op `0.0.1` en bewegen niet mee met de tags. Verder verdient "beta" een toelichting nu de software in productie draait, bijvoorbeeld door per onderdeel te benoemen wat stabiel is.

## Vervolg

De gaten uit deze evaluatie worden opgepakt via issue [#379](https://github.com/MinBZK/par-dpia-form/issues/379). Twee punten vragen eerst een besluit van het team: de reviewpraktijk uit criterium 7 en het talenbeleid uit criterium 10.
