# Versiebeheer voor vragenlijst-bronnen (`sources/`) — afstemmingsplan (v2)

> Status: **afstemmingsplan** (besluit: "alleen het plan nu"). Er wordt nog niets
> gebouwd; de bouwvolgorde bepalen we later. Prozataal NL, code/paden/identifiers EN.
>
> **v2 verwerkt een kritische multi-agent review** (ultracode: 134 agents, 49 geverifieerde
> bevindingen, 10 alternatieven-analyses, 35 volledigheidslacunes, adversarieel
> geverifieerd). Verdict van die review: *architectonisch solide, geen herontwerp nodig* —
> de dragende keuzes overleven code-verificatie en zijn de minimale-blast-radius-opties —
> **maar met een consistente blinde vlek** en een aantal verplichte aanvullingen vóór
> fase 2/6/7. Die zijn hieronder verwerkt en gemarkeerd met **[review]**.

## Context

`sources/` bevat de definities van de vragenlijsten (Pre-scan, DPIA, IAMA) als YAML,
verrijkt via `script/run_all.py` tot `sources/generated/*.json` en in beide frontends
gebundeld. Vandaag gebruikt **elk assessment impliciet "de laatste" gebundelde
definitie**: geen expliciete gepinde versie per assessment, geen manier om aan een nieuwe
(concept)versie te werken terwijl bestaande assessments stabiel blijven, en geen
transparant overzicht van schema's/sources/versies.

Doelen (nog **niet officieel afgestemd**):

1. Elk bron-definitiebestand een **expliciete versie** geven, zoals schema's (begrippenkader
   uitgezonderd — komt van buiten).
2. **Concurrent** aan een nieuwere versie kunnen werken (bijv. "DPIA 3.1 concept") met snelle
   **subversies** (concept 1, 2, …).
3. Per **project** (default) en per **assessment** (autoritatief) een versie kiezen en
   **vastpinnen** zodat een assessment stabiel blijft.
4. Bij een oudere gepinde versie **waarschuwen**, tonen **wat verandert**, en bij **bumpen**
   de antwoorden meenemen (en generiek **terug** kunnen).
5. Een **transparante overzichtspagina** met alle officiële schema's én sources.

Beoogd resultaat: een gefaseerde aanpak met de **migratie-engine — de risicovolle kern —
bewust achteraan en grotendeels uitstelbaar**, omdat veel bumps alleen tekst wijzigen en
"terug" hergebruik maakt van de bestaande antwoord-versiehistorie.

### Onderzoek bij andere projecten (samenvatting)

| Bron | Wat we overnemen |
|------|------------------|
| **HL7 FHIR Questionnaire** | `status`-levenscyclus, `version`-string, expliciet versie-ordeningsalgoritme, en **canonical+versie-pinning**: een antwoord pint de exacte versie waarop het is ingevuld. |
| **dbt model versions** | Meerdere versies **naast elkaar in één repo**, tegelijk uitgerold; ongepind → `latest_version`; `deprecation_date` → "nieuwere versie"-waarschuwing; consument pint laatst-compatibele versie. |
| **npm/semver** | Prerelease-identifiers (`-concept.N`) + **dist-tags als kanalen** (`latest`=officieel, `next`=concept); nooit prerelease als `latest`. |
| **ODK Central** | Stabiel form-id + per-versie string; **Draft → testen → Publiceren-vervangt-live**; inzendingen gepind op invul-versie. |
| **Contentful / Django / Rails** | Migraties klein, geordend, voornamelijk *forward*; datamigraties vaak **niet omkeerbaar** (relevant voor "terug"). |

## Kritische review — kernconclusie en blinde vlek

**De blinde vlek [review]:** het plan dacht vrijwel uitsluitend in termen van het
backend-save-pad. Maar de versie wordt op **vier** paden gestempeld/toegepast, elk via
hetzelfde versie-agnostische `useSchemaStore().getUrn(ns)` (`schemas.ts:98-102`):

1. **Save** (`ApiPersistence buildState:68`) — al benoemd.
2. **Import** (`parseAndValidateImport` → `applyStateToStores`; `jsonExport.ts:35`, `LocalPersistence.ts:57`).
3. **Offline persist** (standalone `LocalPersistence` slaat op onder `app_state_${namespace}` — één slot per type, geen versie).
4. **Export** (PDF/JSON/Markdown delen `buildOutputData` (`jsonExport.ts:15-41`); `pdfExport`, `markdownExport`).

Op elk van deze paden reproduceert `getUrn(ns)` exact het **"self-correct to latest"**-gedrag
dat het plan elders bestrijdt: een 3.0-gepind assessment wordt tegen de 3.1-definitie
toegepast/geëxporteerd en stilzwijgend op 3.1 herstempeld, zonder de migratie-engine te raken.

**Centrale fix [review]:** maak versie-bewustzijn een **invariant**, niet iets dat per
call-site onthouden moet worden. Geef `getSchema(type, version)`/`getUrn(type, version)` een
**verplichte (of pin-resolvende) version-parameter** zodat de TS-build elke niet-gemigreerde
call-site flagt, en maak **coarsening (→ MAJOR.MINOR) een invariant ín `getUrn`**. Dit lost
P0 #1 (import), #2 (standalone) en #3 (export) bij de wortel op.

**De zeven P0's [review]** (allemaal code-geverifieerd):

1. Import herstempelt de versie via `getUrn()` — tweede self-correct-pad.
2. Standalone heeft geen drager voor de per-assessment pin (`app_state_${namespace}`) — de fase-2 kern-eis is offline onhaalbaar zonder ontwerp.
3. PDF/Markdown/JSON-export rendert tegen latest i.p.v. de gepinde versie — voor een juridisch DPIA-artefact een correctheids-/auditprobleem.
4. Bump/restore via de gewone save-route botst op de optimistic-lock + versie-blinde field-merge (multi-user dataverlies onder dode task-id's).
5. `assessment-definition.v2.schema.json:385` weigert de `-concept`-suffix → `run_all.py` `sys.exit(1)` vóór generatie (build-blocker voor de hele concept-tak).
6. Backfill produceert NULL voor lege/legacy rijen en zou stil op `latestOfficial` herpinnen; `ADD COLUMN NOT NULL` faalt op een niet-lege tabel.
7. Concept-/officiële versieset reist 1-op-1 mee van acceptatie → productie (no-rebuild CalVer-promotie) zonder kanaal-scheiding — governance-risico.

Verdict: **geen herontwerp; wel verplichte aanvullingen.** De dragende beslissingen
(coarse `metadata.urn` + autoritatieve pin-kolom, forward-only + snapshot-restore,
manifest-gedreven build) zijn door het alternatieven-panel bevestigd (D1 score 9 vs 5/4).

## Vertrekpunt: wat er vandaag al staat (geverifieerd)

- **Sources & versie-encoding.** `sources/{dpia,prescan,iama}.yaml` met inline `urn` + `version`, samengesteld tot `urn:nl:dpia:3.0`.
- **Twee schema-regexen, niet één [review].** *Output* (`assessment-output.v2.schema.json:19`): `metadata.urn` is `MAJOR.MINOR` (`^urn:nl:[a-z]+:[0-9]+\.[0-9]+$`). *Definitie* (`assessment-definition.v2.schema.json:385`): `version` is `^\d+(\.\d+)?(\.\d+)?$` — **óók geen prerelease**. `run_all.py` valideert elke YAML hiertegen en `sys.exit(1)` bij falen. De io-ts `DPIA`-codec vereist `version` als string.
- **Schema-versionering (referentiemodel).** `schemas/*.vN.schema.json` + `$id`-URL — de "zoals we het met schema doen".
- **Build pipeline raakt 6 sites [review].** De drievoudige `run_all.py`-aanroep met hardgecodeerde `--source` + de IAMA `--definitions-once-per-page`-vlag staat in **4 workflows** (`_build-images`, `release`, `test`, `build-standalone`) **+ 2 `Containerfile.dev`** + het productie-`Containerfile` `COPY sources/generated`-pad — niet de 2 die v1 noemde. `sources/generated` is gitignored, op release/CI gebouwd.
- **CalVer-promotie zonder herbouw [review].** `deploy-productie.yaml` promoot de exacte acceptatie-image naar productie; `sources/generated` (incl. manifest en alle versie-JSONs) is build-time op acceptatie ingebakken.
- **Begrippenkader is extern.** `begrippenkader_dpia.yaml` (dagelijks van `modellen.jenvgegevens.nl`) en `begrippenkader_iama.yaml` (van `MinBZK/Algoritmekader`) worden automatisch gesynct. **Buiten dit versiebeheer houden.**
- **Loading is niet versie-bewust.** `schemaStore` (`schemas.ts`) is `FormType`-gekeyd; drie vaste refs; `init()` geguard met `isInitialized`; `getUrn(ns)` = `` `${schema.urn}:${schema.version}` ``. Standalone (`main.ts`) hardcodet drie JSON-imports; frontend dynamic-import in `AssessmentEditor.vue`/`VersionHistory.vue` (= bestaande lazy code-splitting).
- **Eén stempel-functie, vier paden [review].** `buildOutputData` (`jsonExport.ts:15-41`) en alle persistence-lagen bouwen state met `getUrn(ns)`, zonder versie-parameter. Geldt voor save, import, offline-persist én export.
- **Pinning bestaat alleen impliciet — en is riskant.** `normalizeCreateState.ts` vult `metadata.urn` bij create uit een hardgecodeerde `ASSESSMENT_TYPE_URNS`; de comment zegt het: de urn *"self-corrects on the next save"*.
- **Antwoord-versiehistorie bestaat al.** `assessmentInstances`/`assessmentVersions`/`assessmentEdits`; elke save snapshot't, diff't (`diffStates.ts`) en is herstelbaar (`VersionHistory.vue` `handleRestore`). `assessmentEdits.fieldId` bevat de **volledige urn incl. versie** via `buildFieldUrn()`; `parseFieldKey` (`rebuildState.ts`) is versie-agnostisch.
- **Optimistic lock + field-merge.** De save-route (`assessments.ts:36-232`) gebruikt een optimistic-lock op `currentVersion` (integer); de client lost 409's op met `computeFieldDiff`/`applyFieldChange` (`ApiPersistence.ts:199-311`) — **versie-blind**, schrijft op task-id binnen `activeNamespace`.
- **#368 leverde app/build-versie + statuspagina** (`/version.json`, `/api/health`, client-side `/status`). Build-versie, geen content-versie — maar de paginaopzet is het vertrekpunt voor de transparantiepagina.
- **Afgeleide state.** `taskInstances` worden herbouwd (`applyState.ts`); `completedTasks` (numerieke root-id's) in `metadata`. De gegenereerde Afronding-task krijgt zijn id uit `tasks.length` (`schemas.ts:36-40`) — **niet stabiel** [review].
- **Validatie is backend-only** (`validateState.ts`); de frontend valideert niet.

## Vastgelegde kernbeslissingen

1. **Identifier.** `urn` + `version`; `version` semver met prerelease-suffix voor concept. **Kanaal** afgeleid van de suffix. Opgeslagen `metadata.urn` blijft **`MAJOR.MINOR`** (output-schema-regex + `fieldId`-strings stabiel); de volledige versie leeft in manifest, bestandsnaam en DB-pin-kolom. **[review] Fase 0 verruimt óók de definitie-schema-regex** (zie A) — anders blokkeert de build. **[review]** Coarsening is een invariant ín `getUrn`.
2. **Pinning.** **Per-assessment autoritatief** via nieuwe kolom, **server-side leidend** (urn wordt server-side gevalideerd/gecoerced, niet client-vertrouwd); **project-default** voor nieuwe assessments. **[review]** Backfill valt terug op de **oudste** bekende officiële versie per type, **nooit** `latestOfficial`.
3. **Concept-subversies.** **Eén doorlopend conceptbestand per type**; iteratienummer `-concept.N` **deterministisch afgeleid bij build** uit git/inhoud (**niet** het CI-runnummer [review]); een **content-digest** per entry in het manifest; getoond op de transparantiepagina.
4. **"Terug".** **Snapshot-restore** via de bestaande historie; **[review]** restore reverteert óók de versie-as (coarse urn + pin-kolom). Migraties **forward-only**.
5. **Begrippenkader** uitgesloten (extern auto-synced).
6. **[review] Versie-bewustzijn is een invariant.** `getSchema`/`getUrn` krijgen een verplichte/pin-resolvende version-parameter (TS-build flagt elke call-site). **Bump en restore zijn lock-respecterende barrier-operaties**, geen veld-merge-saves.

## Architectuur — onderdelen en samenhang

### A. Versie-identifier & schema-regexen
- Nieuwe util `packages/assessment-core/src/versioning/semver.ts`: `parseUrn()`, `compareVersions()` (**[review]** expliciet conform semver-prerelease: numerieke identifiers numeriek → `concept.10 > concept.2`; prerelease < release; met property-tests), `isPrerelease()`, `coarseVersion()`.
- **[review] Fase 0 verruimt twee dingen, niet één:**
  - *Definitie-schema* (`assessment-definition.v2.schema.json:385`) — **must-fix vóór fase 6**: additief naar `^\d+(\.\d+){0,2}(-concept(\.\d+)?)?$`, met fixtures voor `3.0`, `3.1.0`, `3.1.0-concept`, `3.1.0-concept.4`. (Het conceptbestand declareert `version: "3.1.0-concept"` zonder N; de build stempelt N — zie C.) De `urn`-regel (`^urn:nl:[a-z]+$`) blijft ongemoeid.
  - *Output-schema* (`metadata.urn`) **blijft `MAJOR.MINOR`** (concept-iteratie zit niet in `metadata.urn`).
  - **[review]** Maak `version` consistent over io-ts én JSON-schema (test een concept-YAML door beide).
- **[review]** `metadata.sourceVersion` **niet** in fase 0 introduceren (dode redundantie); pas invoeren wanneer een concrete consument de volledige conceptversie in-document nodig heeft (export/transparantie), dan server-afgeleid uit de kolom (kolom → sidecar, nooit andersom autoritatief).

### B. Bronbestand-layout + manifest
- Map-per-type met versie-genaamde bestanden + een gecommit manifest:
  ```
  sources/
    manifest.yaml                 # NIEUW — registry (gecommit)
    dpia/3.0.yaml                 # verplaatst vanuit sources/dpia.yaml
    dpia/3.1-concept.yaml         # NIEUW doorlopend conceptbestand
    prescan/2.0.yaml
    iama/2.0.yaml
    begrippenkader_dpia.yaml      # ONGEWIJZIGD — uitgesloten
    begrippenkader_iama.yaml      # ONGEWIJZIGD — uitgesloten
  ```
- `manifest.yaml` = single source of truth voor: versies, `channel` (official/concept), `latestOfficial` per type, **begrippenkader-bestand én de IAMA `once-per-page`-vlag** (nu in 6 buildsites hardgecodeerd [review]), per-versie **curated changelog** (zie F), en een **content-digest** per entry [review].
- Nieuw `schemas/source-manifest.v1.schema.json`. **[review]** CI-lint checkt niet alleen bestand-bestaan maar **semantische consistentie**: `manifest.version == inline-definition-version == artefact-urn-suffix`, precies één `latestOfficial` per type (official-kanaal), en weigert hergebruik van een concept-N met andere inhoud (digest-check).

### C. Build pipeline (manifest-gedreven, deterministisch concept-nummer)
- Nieuwe orchestrator `script/build_sources.py` leest `manifest.yaml`, loopt elke `(type, version)`, hergebruikt de bestaande `run_all.py`-transform, en schrijft `sources/generated/<type>/<version>.json` + runtime `sources/generated/manifest.json` (incl. per-entry digest).
- **[review] Migreer alle 6 buildsites in één fase-1-eenheid** (`_build-images`, `release`, `test`, `build-standalone`, beide `Containerfile.dev`, het productie-`COPY`-pad), met `build_sources.py` als enige aanroeppunt. Verplaats `--definitions-once-per-page` + begrippenkader/`--output-md`-mapping naar het manifest. Vervang óók de drie hardcoded generated-imports (`main.ts`, `AssessmentEditor.vue`, `VersionHistory.vue`). Haal de manifest↔fs-lint naar **fase 1** (was fase 8) zodat een vergeten call-site faalt.
- **[review] Concept-autonummer deterministisch, niet uit `github.run_number`** (dat is niet-monotoon, niet-reproduceerbaar en niet-pinbaar over acceptatie/preview/lokaal). Bereken N **in `build_sources.py`** (git-gebaseerd), zodat alle 6 sites incl. lokale dev identiek gedrag krijgen. Kies expliciet: ORDENING nodig (upgrade-detectie, sectie F) → `git rev-list --count HEAD -- sources/<type>/<v>-concept.yaml` (monotoon, reproduceerbaar) met committer-datum als manifest-ordeningssleutel; of slechts IDENTITEIT → short-git-sha. Plus een `sha256`-content-digest per entry in `manifest.json`, gevalideerd bij load.
- Generated dir blijft **gitignored**. **[review]** Houd tijdelijk de platte 3-bestanden-output naast de geneste output (rollback zonder herbuild) tijdens fase 1.
- **[review] CalVer-promotie:** maak expliciet hoe het content-manifest zich verhoudt tot de no-rebuild acceptatie→productie-promotie — óf sluit het concept-kanaal **build-time** uit voor de productie-image (flag in `_build-images.yaml`), óf doe **runtime channel-gating** op `/version.json` `channel`. Documenteer dat een nieuwe officiële content-versie een nieuwe acceptatie-build vereist (geen hotfix op productie).

### D. Versie-bewuste loader
- `schemaStore` wordt `(type, version)`-gekeyd via een `Map` op canonieke urn. Nieuw: `register(defs[])`, `getByUrn(urn)`, **`getSchema(type, version)` en `getUrn(type, version)` met verplichte/pin-resolvende version-param** [review]; coarsening invariant ín `getUrn`. `init({preScan,dpia,iama})`-shim behouden (lang genoeg voor geleidelijke call-site-migratie). Hergebruik `processSchema`/`createConclusionTask`.
- **[review] Standalone blijft eager (single-file), frontend blijft lazy.** Vervang in de frontend de drie dynamic imports door **lazy code-split per (type,version) met resolve-by-pin** (`import.meta.glob(..., { eager: false })`) — een `eager: true`-glob zou de bestaande code-splitting weggooien (prestatie-regressie). De standalone gebruikt wél een eager glob (geen router; `viteSingleFile` inlinet sowieso).
- **[review] Standalone-pin (P0 #2):** neem de coarse versie op in de localStorage-key (`app_state_${namespace}_${coarseVersion}`) óf persisteer de gepinde versie in het slot en respecteer die bij load (laad die definitie, niet latest; migreer alleen op gebruikersactie). Ontwerp een standalone-equivalent van "terug" (minimaal een pre-migratie-backup-slot — offline is er geen DB-historie).
- **[review] Standalone-bundelinhoud kwantificeren:** specificeer welke versies de offline single-file bevat (bijv. `latestOfficial` + N-1, concepten uitgesloten), met een **hard groottebudget + CI-check** (fail-the-build). Eén verrijkte DPIA-JSON ≈ 356 KB (begrippenkader-injectie); N versies groeien additief. Definieer expliciet gedrag bij een **afwezige gepinde versie**: weiger met uitleg of val terug op de hoogste beschikbare met zichtbare waarschuwing — **nooit stil**.

### E. Pinning & datamodel
- `apps/boekhouding-backend/src/db/schema.ts`: nieuwe kolom op `assessmentInstances`. **[review] Vermijd naamcollisie met de bestaande `currentVersion` (integer checkpoint-as):** noem de content-pin bijv. `definitionVersion`/`modelVersion` (text), bewust onderscheiden. Plus optioneel `defaultDefinitionVersions jsonb` op `projects` (**[review]** shape `{prescan?, dpia?, iama?}` — prescan meenemen; alleen via owner gezet; default moet een official-versie zijn; mogelijk pas zinvol vanaf fase 3 met >1 officiële versie).
- **[review] Backfill als 3-staps idempotente hand-migratie in één bestand:** (1) `ADD COLUMN ... text` **nullable**; (2) `UPDATE` met `CASE` op `assessment_type` + `COALESCE(coarse-urn-uit-cachedState, OUDSTE officiële versie per type)` — dek expliciet `cached_state = {}` én `NULL`; (3) `ALTER ... SET NOT NULL`. **Nooit fallback naar `latestOfficial`** (dat is exact de stille self-correct, dan hard ingebakken). Voer uit terwijl er nog één versie bestaat (triviaal = 3.0). Post-backfill NULL-check (CI) + log/markeer fallback-hits. Controleer de gegenereerde SQL op `DROP+CREATE` en `"public".`-prefix (CLAUDE.md-valkuil).
- **Create-flow** (`routes/projects.ts`): `definitionVersion?` in de body (resolutie body → project-default → `latestOfficial`); valideer dat de versie bestaat (anders 400); persisteer de pin **ook bij weggelaten state-body**. **[review]** `normalizeCreateState` krijgt de pin als **verplichte** parameter (hardcoded map alleen laatste fallback); de `initial_state`-edit draagt al de gepinde coarse urn zodat `rebuildState` nooit de verkeerde versie reconstrueert. Voeg `definitionVersion` toe aan het **create-body-schema** (respecteer `additionalProperties:false`), de **`assessmentAccess`-projectie** (die `cachedState` exclude't), en het **`api.ts` `AssessmentInstance`-type**.
- **[review] Pin server-side autoritatief vanaf fase 2:** leid de coarse urn af uit de kolom en **coerce/valideer** de client-`metadata.urn` server-side. **Observability:** emit een metric/structured log bij elke mismatch-coercion (`assessmentId`, oud→nieuw) + een health-query "instances met `definitionVersion` niet in het huidige manifest". Maak de overgang **lenient→strikt data-gedreven** ("mismatch-counter = 0 over X dagen"), niet een kalenderbesluit.

### F. "Nieuwere versie beschikbaar" detectie + changelog
- **Detectie** = pure client-vergelijking: gepinde versie vs. manifest `latestOfficial` (of hoogste `concept` als `allowConcept`). Niet-blokkerende banner; composable `packages/assessment-core/src/versioning/useVersionUpgrade.ts`. **[review]** Gate de "Bijwerken"-actie achter `canEdit`/`isOwner` (conform bestaande viewer/commenter-banners).
- **Changelog: curated primair + auto-diff als vangnet.** Handgeschreven, gebruikersgerichte changelog per versie in het manifest (te ontlenen aan `docs/PDR/`). **[review]** Render changelog-strings via de bestaande allowlist-renderer (`renderMarkdownToHtml`), **nooit rauwe `v-html`**; beperk changelog-velden in het manifest-schema tot platte tekst/markdown; laat de lint leeg/placeholder afkeuren; benoem een **redactie-eigenaar + reviewstap** met NL-stijleis (je-vorm, "Invulhulpen", normaal streepje).
- **Build-time definitie-diff** (`script/diff_definitions.py`): per taak-`id` toegevoegd/verwijderd/hernoemd, als CI-completeness-lint + input voor de preview. **[review] Breid uit naar optie-VALUE-set-wijzigingen** (label-only = no-op): de lint faalt tenzij een `mapOption` of expliciete `no-migration-needed` bestaat. Opties die risk-scoring/conditionele dependencies voeden vereisen een verplichte `mapOption`.
- **Answer-impact preview** ("wat verandert in *mijn* antwoorden"): forward-migratie in-memory + difftabel-idioom uit `VersionHistory.vue` (overweeg `DiffTable.vue` in core). **[review]** Markeer élke opgeslagen answer-key/optie-waarde die niet meer in de doeldefinitie bestaat (dataverlies-waarschuwing).

### G. Migratie-engine (forward-only) + de vier paden
- Migratiestap = pure functie `(answers, completedTasks) → { answers, completedTasks }` per geordende stap `from→to` per type, getransitief geketend; **default no-op** bij ongewijzigde id's. Operaties: `rename`, `remove`, `restructure`, `mapOption`. Locatie `packages/assessment-core/src/versioning/migrate.ts` + `migrations/<type>/<from>-to-<to>.ts`. **In core** (preview + standalone offline + online delen één implementatie). Spiegel het registry/keten-idioom van `stateMigration.ts` (aparte as: *content* vs *formaat*).
- **[review] Import als versie-resolutiemoment (P0 #1):** parse `metadata.urn` → bepaal gepinde versie → laad díe definitie via `getSchema(type, version)` → indien `< latest`, draai de forward-migratie vóór `applyStateToStores`, of weiger met uitleg. **Nooit** stille herstempeling. Geldt voor **JSON én PDF**: `importFromPdf` (`pdfImport.ts`) haalt de in de PDF Info-dict ingebedde state-JSON (`AssessmentData`) en routeert door hetzelfde `parseAndValidateImport` — PDF en JSON delen dus exact dit versie-resolutiepad.
- **[review] Twee orthogonale assen: formaat (v1↔v2) én content-versie.** De bestaande format-detectie (`isV1State`: nanoid-keys + ontbrekend `$schema`) staat los van de nieuwe content-versie. Pijplijn: `parse urn → format-migratie (v1→v2) → content-versie bepalen → content-migratie (forward keten) → schema-validatie`. Content-migraties opereren uitsluitend op v2-keys. Golden test: v1-3.0-bestand in 3.1-bundel, beide assen geketend.
- **[review/backward-compat] Bestaande exports zonder content-versie (slimme fallback).** Het hele bestaande bestand van reeds-gedistribueerde exports moet importeerbaar blijven. Moderne exports dragen vandaag al `urn:nl:dpia:3.0` (want `getUrn` stempelt `urn:version`) → die resolven schoon naar 3.0. Maar een **legacy v1-artefact zónder urn** (of een bare `urn:nl:dpia` zonder versie) komt via `migrateStateV1toV2(json, {})` (`importDetect.ts:30`) binnen met `urn: undefined`. **Smart rule:** behandel een ontbrekende/versie-loze content-versie als de **oudste officiële versie** van dat type — **nooit latest** (zelfde anti-self-correct-principe als de backfill, kernbeslissing 2). Concreet: **vul `urnLookup` met de oudste-officiële urns per type** i.p.v. `{}`, zodat de v1→v2-format-migratie meteen de juiste baseline-versie zet; daarna draait de normale detectie zodat de gebruiker bewust kan bumpen. Een versie-loos artefact predateert immers content-versionering, dus het is per definitie een baseline-(3.0-)artefact. Golden tests: (a) urn-loos v1-bestand in 3.1-bundel → pint 3.0, biedt bump aan, herstempelt nooit stil naar 3.1; (b) modern 3.0-bestand in 3.1-bundel → pint 3.0.
- **[review] Pre-scan→DPIA-conversie = nieuwe creatie, niet re-import.** Een afgeronde/geïmporteerde pre-scan kan een **nieuwe DPIA** seeden via cross-form prefill (`usePreScanReferences.ts` / `useReferences.ts` `PREFILL_TYPES`; `ProjectDetail.vue:255` wrapt de antwoorden onder de prescan-namespace). De resulterende DPIA heeft geen eigen DPIA-urn. Onderscheid dit **expliciet** van de legacy-import-fallback: een prescan→DPIA-conversie pint op de **create-versie** (project-default → latestOfficial), **niet** op oudste-officieel — het is een nieuwe DPIA, geen bestaand DPIA-artefact dat zijn invul-versie moet behouden. De prefill-mapping (prescan-antwoord → DPIA-taak) moet naar de **gepinde DPIA-versie** resolven (mapping wordt dus versie-afhankelijk zodra DPIA-versies in structuur/veld-id's verschillen). Regel: ontbrekende urn bij *bestandimport van een bestaande DPIA* → oudste-officieel (baseline); ontbrekende urn bij *prescan→DPIA-conversie* → create-versie. Golden test: prescan-2.0 → nieuwe DPIA in 3.1-bundel → pint 3.1 (create-versie), prefill mapt naar 3.1-velden.
- **[review] `completedTasks` + root-renumber + Afronding-task (P1):** een root-toevoeging/-verwijdering (incl. de via `tasks.length` gegenereerde Afronding-task) impliceert automatisch een `completedTasks`-remap én remap van `completed.{id}` audit-strings — los van leaf-renames. Overweeg de Afronding-id **stabiel** te maken (vaste string) vóór multi-versie live gaat. `validateState` vangt dit niet (alleen pattern); overweeg een defensieve filter bij laden die `completedTasks` tegen de actuele root-id's snoeit.
- **[review] Bump/restore = barrier-operatie (P0 #4):** niet "gewoon een save". Bij mismatch tussen body-pin en DB-pin een herkenbare **409/422 → "definitie gemigreerd → herlaad volledig"**, i.p.v. veld-merge. Neem `definitionVersion` mee in het `/sync`-antwoord zodat andere sessies hard herladen. **Restore reverteert óók de pin** (coarse urn + kolom terug naar pre-bump; snapshot de pre-bump pin mee). Integratietests: (a) A bumpt terwijl B onbewaarde edits heeft → B verliest niets onder dode id's; (b) na restore zijn answers **én** urn **én** pin weer 3.0.
- **[review] Export versie-bewust (P0 #3):** `buildOutputData`/`pdfExport`/`markdownExport` krijgen de gepinde definitie + coarse urn door; toon de versie zichtbaar op de PDF-titelpagina. Geldt óók voor de **in de PDF ingebedde `AssessmentData`** (de PDF is een herimporteerbaar databestand — vooral voor de standalone zonder backend), zodat een export→import-round-trip de invul-versie behoudt i.p.v. naar latest te herstempelen. Toets: exporteer een 3.0-gepind assessment in een 3.1-bundel → zichtbare labels/urn én ingebedde `AssessmentData` = 3.0; her-importeer en assert dat de pin 3.0 blijft.
- **"Terug" = snapshot-restore**, geen inverse migraties (`remove`/`restructure` zijn niet verliesvrij omkeerbaar). Cross-bestand-downgrade (geïmporteerd 3.1 → 3.0) wordt **geweigerd** met uitleg.
- **[review] Validatiepoort eerlijk benoemen:** til `validateState` + output-schema naar `assessment-core` zodat standalone én preview dezelfde poort delen; de poort vangt geen semantiek (alleen pattern), dus de preview moet ongeldige keys zelf markeren.

### H. Transparantiepagina
- **[review] Ondubbelzinnig pad/label:** kies bijv. `/modellen` ("Modelversies"/"Vragenlijst-modellen") en reserveer "versiegeschiedenis" voor de antwoord-historie; maak in de UI expliciet onderscheid model-versie vs antwoord-versie. Houd `/status` operationeel.
- Gevoed door het gebundelde `manifest.json` (offline-veilig; standalone inlinet het). Hergebruik de RVO-kaart/tag-idiomen uit `StatusPage.vue`. Per regel: volledige versie + coarse urn, kanaal-tag, "huidige officiële versie"-markering, releasedatum, `schemaVersion`, "Wat is er veranderd"-uitklap (curated changelog), links. Conceptregels gedempt, gelabeld "Concept — nog niet vastgesteld". **[review]** Toets `/modellen` per fase tegen WCAG/EN 301 549.

## Gefaseerde routekaart (afhankelijkheidsvolgorde; bouwvolgorde later)

| Fase | Inhoud | Levert op |
|------|--------|-----------|
| **0. Fundament** | `semver.ts` (met prerelease-ordening + property-tests); **beide** schema-regexen (definitie additief verruimen, output ongemoeid); io-ts/JSON-schema-consistentie; manifest-type + `source-manifest.v1.schema.json`. | Concept-versies declareerbaar én valideerbaar. |
| **1. Manifest + multi-versie build** | `manifest.yaml`; sources naar `sources/<type>/`; `build_sources.py` met **deterministisch concept-nummer + digest**; **alle 6 buildsites** + 3 hardcoded imports omgezet; **manifest↔fs+semantiek-lint hierheen**. | Coexistentie bewezen; CI (test/build-standalone) groen. |
| **2. Versie-bewuste loader + per-assessment pin** | `schemaStore` Map-keyed + verplichte version-param; frontend lazy-split, standalone eager + **standalone-pin**; `definitionVersion`-kolom + 3-staps backfill (oudste-officieel); pin server-autoritatief; **alle `getUrn`-stempelplekken (save/import/persist/export) versie-bewust**. | **Kern:** oud assessment blijft 3.0, ook offline en in export. |
| **3. Versie kiezen** | Project-default (`{prescan?,dpia?,iama?}`, owner-only) + per-assessment override; standalone client-side picker. | Requirement 3. |
| **4. Transparantiepagina** | `/modellen` (read van manifest); offline + WCAG geverifieerd. | Goedkoopste zichtbare winst. |
| **5. Detectie + changelog-banner** | `useVersionUpgrade` (detectie) + curated changelog via allowlist-renderer; "Bijwerken" achter `canEdit`. Nog géén bump. | Gebruiker weet dat model verouderd is. |
| **6. Concept-kanaal + gating** | Conceptbestand-workflow, deterministisch nummer, **`allowConcept` owner-only, server-afgedwongen**; concept uit productie-image/standalone-glob. | Team itereert concepten gegated. |
| **7. Migratie-engine (forward) + preview + bump** | Engine met no-op default; **import-resolutie, v1→v2-volgorde, bump/restore als barrier, export-bewust, root-renumber/Afronding, mapOption**; eerste echte bump bij voorkeur wording-only. | De risicovolle kern, geïsoleerd. |
| **8. "Terug" + harden** | Restore reverteert pin+urn; strikte (data-gedreven) pin-enforcement; promotie concept→officieel-runbook + test. | Volledige levenscyclus. |

> **Bouwvolgorde open.** `/modellen` (fase 4) is de goedkoopste zichtbare winst; de
> migratie-engine (fase 7) de risicovolle kern. Fases 0→2 zijn de gedeelde basis.
> **[review] Per fase een rollback/kill-switch** (platte output tijdelijk parallel; versie-keuze/
> concept-kanaal/banner achter runtime-flags; kolom nullable tot strikte enforcement; init-shim
> behouden i.p.v. big-bang). **Fase 2 als 4 zelfstandig mergebare PR's:** (a) nullable kolom +
> backfill, (b) `schemaStore` Map-refactor + version-param + shim, (c) loader per app, (d) save-stempel.

## Open punten / te heroverwegen beslissingen [review]

- **Concept-autonummer uit CI-runnummer → vervangen** door git/content-deterministische N (kernbeslissing 3 herzien).
- **`metadata.sourceVersion` niet vanaf fase 0** — uitstellen tot een concrete consument; anders dode, drift-gevoelige redundantie.
- **Frontend eager glob → lazy-per-pin** (eager alleen standalone); voorkomt prestatie-regressie.
- **`version_migration` edit-type / machineleesbare bump-marker** → tóch opnemen (accountability in DPIA-context, geen YAGNI); `changeDescription` is vrije tekst.
- **Backfill-fallback naar oudste officieel** i.p.v. latest (anti-self-correct).
- **Bump via save-route → barrier/dedicated pad** (owner-only restore-tak + versie-blinde merge zijn ongeschikt).
- **`allowConcept`-autorisatie** (owner-only, server-afgedwongen); wie mag bumpen/pinnen-wijzigen (owner vs editor) expliciet.
- **CalVer-promotie ↔ concept-kanaal** scheiden (governance).
- **Project-default + prescan** in de jsonb-shape; default = official-versie.
- **Naamgeving** `/modellen` + "Modelversies" vs "versiegeschiedenis".
- **Concept-gating** per-project opt-in default-uit — bevestigen.
- **Officiële versies `MAJOR.MINOR` houden** (geen patch) vs urn-regex verder verruimen.
- **Websocket-sync** als expliciete toekomst-afhankelijkheid: een bump moet dan een niet-mergebaar broadcast-event zijn dat clients dwingt te herladen.
- **AVG/retentie:** bewaartermijn + verwijderpad voor pre-bump-antwoorden in `assessment_edits`; mini-DPIA/AP-toets op "veld verwijderd in nieuw modeljaar onder reeds ingevoerde persoonsgegevens".
- **Eén PDR/ADR voor de versioning-architectuur** schrijven; PDR↔versie-mapping verifiëren; optioneel definitions-endpoint onder `/api/v1/` met `problem+json` + `API-Version` (ADR-conventie); publiccode.yaml/`/modellen` machine-leesbaar?

## Risico's & mitigaties

- **Vier self-correct-paden** (save/import/persist/export). → Versie-param verplicht in `getSchema`/`getUrn`; coarsening invariant; TS-build flagt call-sites. **Gevaarlijkste oppervlakte.**
- **Definitie-schema weigert `-concept`** → build-blocker. → Fase 0 verruimt additief, met fixtures.
- **Backfill: NULL/`NOT NULL`-faal + stille herpin.** → 3-staps idempotent, oudste-officieel-fallback, NULL-check, SQL-review.
- **Multi-user bump/restore.** → Barrier-operatie + herlaad-409 + `/sync`-propagatie; integratietest tegen dataverlies onder dode id's.
- **CalVer-promotie lekt concept naar productie.** → Build-time uitsluiten of runtime channel-gating.
- **Gepinde versie niet (meer) gebundeld.** → Nooit verwijderen waar een assessment naar verwijst; expliciet weiger/fallback-met-waarschuwing, nooit stil; promotie-runbook.
- **Bundelgroei (standalone single-file, offline).** → Bundelinhoud expliciet + hard groottebudget (CI fail); concepten uit de publieke glob.
- **Migratie-correctheid/dataverlies.** → Forward-only; renames expliciet (nooit runtime-geraden); verplichte preview; golden + property-tests (geen wees-`[index]`; geen onbekende `completedTasks`-root; geen ongeldige optie-waarde); completeness-lint incl. optie-VALUE-set.
- **`schemaStore` Map-refactor raakt veel call-sites/tests.** → `init`-shim + per-urn idempotentie; gefaseerde call-site-migratie.
- **Observability/governance.** → Mismatch-metric, data-gedreven lenient→strikt, machineleesbare bump-audit, AVG-retentie, WCAG-toets per fase.

## Kritieke bestanden

| Pad | Wijziging |
|-----|-----------|
| `sources/manifest.yaml`, `schemas/source-manifest.v1.schema.json` | **Nieuw**: registry + validatie (semantische lint). |
| `sources/{dpia,prescan,iama}.yaml` → `sources/<type>/<version>.yaml` (+ `dpia/3.1-concept.yaml`) | Verplaatsen + conceptbestand. |
| `schemas/assessment-definition.v2.schema.json` | **[review]** version-regex additief verruimen (`-concept`); fase 0. |
| `schemas/assessment-output.v2.schema.json` | Ongemoeid (coarse urn); evt. later optioneel `sourceVersion`. |
| `script/build_sources.py`, `script/diff_definitions.py` | **Nieuw**: manifest-build (deterministisch concept-nummer + digest) + definitie-diff (incl. optie-VALUE). |
| **6 buildsites** [review]: `.github/workflows/{_build-images,release,test,build-standalone}.yaml`, `containers/{frontend,standalone}/Containerfile.dev`, productie-`Containerfile` `COPY` | `run_all.py`×3 → `build_sources.py`; vlaggen naar manifest. |
| `packages/assessment-core/src/stores/schemas.ts` | Map-keyed; `register`/`getByUrn`/`getSchema(type,version)`/`getUrn(type,version)` verplicht; coarsening-invariant; shim. |
| `packages/assessment-core/src/versioning/{semver,migrate,useVersionUpgrade,changelog}.ts` + `migrations/` | **Nieuw**. |
| `packages/assessment-core/src/utils/importDetect.ts`, `stateMigration.ts`, `applyState.ts` | Import = versie-resolutie; v1→v2 vóór content-migratie; `urnLookup` vullen met **oudste-officiële** urns (versie-loze legacy → baseline, nooit latest). |
| `packages/assessment-core/src/utils/jsonExport.ts` (+ `pdfExport`, **`pdfImport`**, `markdownExport`), `LocalPersistence.ts` | **[review]** `buildOutputData` versie-bewust (incl. de in de PDF ingebedde `AssessmentData`); `importFromPdf` deelt het JSON-importpad; standalone-pin in de localStorage-key/slot. |
| `apps/standalone-form/src/main.ts` | Eager glob (begrensd) + manifest; standalone-pin + "terug"-backup. |
| `apps/boekhouding-frontend/src/views/{AssessmentEditor,VersionHistory,VersionsPage(/modellen)}.vue`, `router.ts`, `ApiPersistence.ts`, `api.ts` | Lazy-split resolve-by-pin; barrier-bump/restore + herlaad-409; pin in type. |
| `apps/boekhouding-backend/src/db/schema.ts` (+ Drizzle-migratie) | `definitionVersion` (text, ≠ `currentVersion`) + `defaultDefinitionVersions` + 3-staps backfill. |
| `apps/boekhouding-backend/src/{utils/normalizeCreateState,routes/projects,routes/assessments,middleware/assessmentAccess,utils/validateState}.ts` | Pin verplicht + server-autoritatief; create-body-schema; projectie; barrier-bump; `/sync` propageert pin; `validateState` naar core. |
| `docs/PDR/` + nieuwe ADR | PDR↔versie-mapping; één ADR voor de versioning-architectuur. |

**Hergebruiken:** `processSchema`/`createConclusionTask`, `namespaceFromUrn` (al versie-agnostisch), `diffStates`/`VersionHistory.handleRestore`, `viteSingleFile`-inlining, `run_all.py`, `stateMigration.ts`-idioom, `renderMarkdownToHtml` (changelog), `docs/PDR/`, `/status`-opzet, bestaande `GIT_SHA`-build-arg (concept-identiteit).

## Verificatie (per fase, end-to-end)

- **Fase 0:** `compareVersions` property-tests (`concept.2`<`concept.10`<release); definitie-schema accepteert `3.0`/`3.1.0`/`3.1.0-concept[.N]`; concept-YAML valideert in io-ts **én** JSON-schema.
- **Fase 1:** alle 6 buildsites groen incl. `test.yaml` + `build-standalone.yaml` op de PR (na de rename; `run_all.py` heeft `--source` required); `sources/generated/<type>/<version>.json` + `manifest.json` + digests ontstaan; manifest↔fs+semantiek-lint groen; podman dev-stack + `pnpm -r test` na rename.
- **Fase 2 (kern):** maak DPIA op 3.0, voeg 3.1 toe, open+save → `urn` blijft 3.0 (geen stille migratie); **idem voor import, offline-persist en export**; Playwright standalone (`:5175`) + frontend (`:5174`); backend-integratietest.
- **Fase 4/5:** Playwright `/modellen` (groepering, tags, latest-marker, WCAG) + banner; offline single-file onder strikte CSP zonder runtime fetch/`eval`.
- **Fase 7:** golden tests per stap (geldig onder doeldefinitie; v1-3.0→3.1 dubbel-as); property-tests (geen wees-`[index]`, geen onbekende `completedTasks`-root, geen ongeldige optie-waarde); bump-dan-restore = origineel incl. pin+urn; multi-user: A bumpt terwijl B onbewaarde edits heeft → geen verlies; export 3.0-pin in 3.1-bundel → labels/urn 3.0; completeness-lint faalt bij niet-geadresseerde structuur-/optiewijziging.
- **Fase 8:** instance gepind op verdwenen concept → save geblokkeerd/begeleid, nooit stille herstempeling.
- **Doorlopend:** 100% Vitest-coverage per workspace (istanbul); backend-integratietests (Postgres + `TEST_DATABASE_URL`); type-check; offline/CSP-check als release-asset-criterium.

## In/uit scope

- **In scope (na review):** machineleesbare bump-audit (`version_migration`-marker), export-versie-bewustzijn, standalone-pin, multi-user barrier-bump, AVG-retentie-beleid voor pre-bump-antwoorden.
- **Uit scope / YAGNI:** server-side migratie-endpoint (client rekent, server valideert); down-migratie-berekening (restore dekt het); bulk-migreren van alle assessments in een project; versioneren van het begrippenkader (extern); begrippenkader-deduplicatie (aparte pipeline-wijziging).
