# Design: assessments Claude Code Plugin

## Doel

Een Claude Code plugin voor de overheidsmarketplace die domeinkennis biedt over DPIA-, Pre-scan- en IAMA-assessments, het begrippenkader, RVO-styling en de assessment YAML-schema's. De plugin helpt ontwikkelaars die werken aan assessment-applicaties gebouwd op het PAR-assessment framework.

## Structuur

```
.claude/plugins/assessments/
├── .claude-plugin/
│   └── plugin.json
├── skills/
│   ├── assessment-schema-yaml/
│   │   └── SKILL.md
│   ├── begrippenkader-schema-yaml/
│   │   └── SKILL.md
│   ├── rvo-styling/
│   │   └── SKILL.md
│   └── dpia-kennis/
│       └── SKILL.md
└── agents/
    └── assessment-validator.md
```

## Componenten

### plugin.json

- **name**: `par-assessment`
- **description**: DPIA-, Pre-scan- en IAMA-assessment domeinkennis, schema-validatie en RVO-styling voor de overheid
- **version**: 1.0.0
- **author**: PAR (Privacy Adviseurs Rijk)

### Skill 1: assessment-schema-yaml

**Triggert bij**: bewerken van assessment YAML-bronnen in `sources/`, vragen over het assessment-schema, toevoegen van taken/velden aan `prescan.yaml`, `dpia.yaml` of `iama.yaml`.

**Inhoud**:
- Structuur van `schemas/assessment-definition.v1.schema.json`:
  - Top-level velden: `name`, `description`, `urn` (patroon: `urn:nl:<type>:<versie>`), `version`, `tasks`, `assessments`
  - Top-level vlag `prefixQuestionIds` (gebruikt door `iama.yaml`): prefixt elk label met het officiële vraag-ID
  - Task-structuur: `task`, `id` (patroon: `^[0-9]+(\.[0-9]+)*`), `type` (array), `repeatable` (verplicht), `description`, `category`
  - IAMA-specifieke task-velden (in `iama.yaml`): `in_fria` (vraag hoort bij de FRIA, art. 27 AI-verordening), `action_point_group` (taakgroep met actiepunten per deel), `action_point_summary` (deel dat alle actiepunten samenvat)
  - Veldtypes: `text_input`, `open_text`, `select_option`, `multiselect_scrollable`, `checkbox_option`, `radio_option`, `task_group`, `informational`, `date`
  - `select_option` vereist altijd een `options` array
  - `options`: objecten met `value` (string|boolean|null) en optioneel `label`
  - `valueType`: het verwachte datatype (`string`, `boolean`, `number`, `string[]`, `boolean|null`)
  - `defaultValue`: vooraf ingevulde waarde
- Dependencies:
  - `conditional`: toon/verberg op basis van andere antwoorden (`condition.id`, `condition.operator` [equals|contains|any|all], `condition.value`, `action` [show|hide])
  - `source_options`: opties dynamisch laden uit ander veld
  - `instance_mapping`: instanties synchroniseren tussen repeatables (`mapping_type`: one_to_one, one_to_many, many_to_one)
- Calculations (prescan):
  - `scoreKey`: naam van de score-variabele
  - `expression`: jexl-expressie (bijv. `answers('1.1.2') | count`)
  - `riskScore`: array van `when`/`value` regels
  - Beschikbare jexl-functies: `answers()`, `bool()`, `count` (filter), `countSelectedOptions()`, `weightedCountMap()`
- References:
  - `prescanModelId`: koppelt prescan-veld aan model-ID
  - `DPIA`: verwijst naar DPIA-paragraaf, kan simpel (`"1.1"`) of met type (`{id: "1.1", type: "one-to-one"}`)
  - Reference types: `pre-fill`, `pre-view`, `direct takeover`, `one-to-one`, `one-to-many`, `many-to-one`, `many-to-many`
- Assessments (prescan):
  - `assessments[]`: evaluatieregels die bepalen welke assessments verplicht/aanbevolen zijn
  - Structuur: `id` (bijv. "DPIA", "DTIA"), `levels[]` met `level` (required|recommended), `expression`, `result`, `criteria[]`
  - Criteria: `id`, `expression` (jexl), `explanation`
- ID-nummering: genest hiërarchisch (`2.1.3`), `is_official_id` geeft aan of ID overeenkomt met het Rapportagemodel DPIA
- Repeatable tasks: `repeatable: true` met optioneel `instance_label_template` (bijv. `"Gegevensverwerking {4.1.1}"`)
- IAMA (`sources/iama.yaml`, `urn:nl:iama`, versie `2.0`) is een derde assessment-type naast Pre-scan en DPIA; gestructureerd in Delen (Deel 1 Waarom? … Deel 5 Afsluiting)
- Instructie: verwijs altijd naar `schemas/assessment-definition.v1.schema.json` als bron van waarheid

### Skill 2: begrippenkader-schema-yaml

**Triggert bij**: bewerken van `sources/begrippenkader_dpia.yaml` of `sources/begrippenkader_iama.yaml`, toevoegen/wijzigen van definities, vragen over de begrippenkader-structuur.

**Inhoud**:
- Structuur van `schemas/begrippenkader.v1.schema.json`:
  - Top-level: `schema_version`, `name`, `description`, `urn` (patroon: `^urn:nl:dpia:[\d\.]+:begrippenkader:\d+\.\d+$`), `language` (alleen "nl"), `owners[]`, `glossary[]`, `metadata`
  - `owners[]`: `organization`, `name`, `email`, `role` (allemaal verplicht)
  - `glossary[]` items: `id` (patroon: `^[a-z0-9_]+$`), `name`, `category`, `definition` (allemaal verplicht)
  - `metadata`: `version`, `last_updated` (datetime), `maintainer`, `language`
- Werkelijke YAML-structuur (wijkt af van schema — gebruikt `definitions` i.p.v. `glossary`):
  - `definitions[]` items: `id`, `term`, `category`, `definition`, `metadata`
  - `metadata` per definitie: `kennisbronnen` (array), `toelichting` (string), `redactionele_opmerking` (string), `voorbeelden` (array), `alternatieve_spellingen` (array), `meervoudsvormen` (array)
- Categorieën volgen het patroon: `"DPIA - <paragraafnummer>. <naam>"` of `"Pre-scan DPIA - <sectieletter>. <naam>"`
- Cross-referenties in definitieteksten: termen tussen `[vierkante haken]` verwijzen naar andere definities in het begrippenkader
- ID-conventie: alleen lowercase letters, cijfers en underscores
- Het DPIA/Pre-scan begrippenkader bevat 456 definities
- IAMA-begrippenkader (`sources/begrippenkader_iama.yaml`, 95 definities): **gegenereerd** uit het Algoritmekader via `script/convert_definitions_from_algoritmekader.py`, niet handmatig bewerkt. Simpeler platte structuur — `definitions[]` met alleen `term` en `definition` (geen `id`, `category`, `metadata`, `urn` of `owners`). Verrijkt `sources/iama.yaml` met de `--definitions-once-per-page` vlag (elke term-tooltip max. één keer per "deel")
- Definition enricher (`script/definition_enricher.py`) injecteert definities als HTML-spans in de assessment YAML bij export naar JSON

### Skill 3: rvo-styling

**Triggert bij**: schrijven van Vue-componenten, CSS/styling vragen, button-klassen, werken met RVO component library.

**Inhoud**:
- Button-patronen:
  - Basis: `utrecht-button utrecht-button--<variant>-action utrecht-button--rvo-<size>`
  - **FOUT**: `utrecht-button--rvo-primary-action` (bestaat niet)
  - **GOED**: `utrecht-button--primary-action` (zonder `rvo-` prefix voor de variant)
  - Varianten: `--primary-action`, `--secondary-action`, `--rvo-tertiary-action` (tertiary heeft wél `rvo-` prefix)
  - Sizes: `--rvo-xs`, `--rvo-md`
  - Warning variant: `utrecht-button--primary-action utrecht-button--warning`
  - Full width: `utrecht-button--rvo-full-width`
  - Referentie-implementatie: `packages/assessment-core/src/components/ui/UiButton.vue`
- Design tokens:
  - Kleuren: `--rvo-color-hemelblauw`, `--rvo-color-grijs-100`, `--rvo-color-grijs-200`, `--rvo-color-wit`, `--rvo-color-zwart`
  - Spacing: `--rvo-space-sm`, `--rvo-space-md`, `--rvo-space-lg`, `--rvo-space-xl`, `--rvo-space-3xl`
  - Font sizes: `--rvo-font-size-xs`
  - Border: `--rvo-border-radius-xl`
  - Margins: `rvo-margin-block-end--md` (utility class)
- Vue-conventies:
  - Geen `<style scoped>` in Vue-componenten — gebruik RVO utility classes en globale CSS
  - Globale stijlen in `packages/assessment-core/src/assets/base.css`
  - Alle custom CSS onder `.rvo-theme` selector
  - Button groups: `<div class="utrecht-button-group" role="group" aria-label="...">`
- Layout:
  - Sidebar: `.rvo-sidebar-layout`
  - Max width: `.rvo-max-width-layout`
  - Achtergrondkleuren: `.background-grijs-100`, `.background-grijs-200`
- Accordion: `.rvo-accordion__item-summary`, `.rvo-accordion__item-icon`
- Icons met spacing: `.rvo-icon--with-spacing-right`, `.rvo-icon--with-spacing-left`

### Skill 4: dpia-kennis

**Triggert bij**: vragen over DPIA-begrippen, privacy-terminologie, prescan-logica, "wat betekent...", "definitie van...", rapportage-output, relatie tussen assessments.

**Inhoud**:

**Begrippen opzoeken:**
- Doorzoek `sources/begrippenkader_dpia.yaml` via Grep/Read (456 definities, niet in context laden); voor IAMA-terminologie `sources/begrippenkader_iama.yaml` (95 definities uit het Algoritmekader)
- Zoek op `term:` veld (case-insensitive)
- Toon: definitie, toelichting, kennisbronnen, voorbeelden indien aanwezig
- Let op cross-referenties: termen tussen `[vierkante haken]` in definities verwijzen naar andere begrippen

**DPIA-structuur:**
- DPIA Rapportagemodel Rijksdienst v3.0 (`sources/dpia.yaml`): 17 officiële paragrafen + metadata + management summary + ondertekening
- Paragrafen: 1. Voorstel, 2. Persoonsgegevens, 3. Gegevensverwerking, ... t/m 17. Maatregelen
- Speciale taken: id "0" (Inleiding, niet-officieel), id "18" (Management summary), id "19" (Metadata), id "20" (Ondertekening)

**IAMA-structuur:**
- Impact Assessment Mensenrechten en Algoritmes (IAMA) v2.0 (`sources/iama.yaml`, `urn:nl:iama`): beoordeelt de impact van een algoritme op mensenrechten en publieke waarden vóór ontwikkeling/inzet (ook voor niet-AI-algoritmes)
- Gestructureerd in Delen, elk met eigen actiepunten: Deel 1 Waarom?, Deel 2 Wat?, Deel 3 Hoe?, Deel 4 Mensenrechten, Deel 5 Afsluiting (+ Deel 0 Inleiding)
- Deel 4 is de grondrechtentoets (FRIA — Fundamental Rights Impact Assessment); vragen die corresponderen met art. 27 AI-verordening zijn in de YAML gemarkeerd met `in_fria: true`
- De Pre-scan kan een IAMA aanbevelen (zie Pre-scan logica)

**Pre-scan logica:**
- Pre-scan DPIA v2.0 (`sources/prescan.yaml`): bepaalt welke assessments verplicht of aanbevolen zijn
- Risicoscore-berekening: scores per categorie (gewone/bijzondere/gevoelige persoonsgegevens, betrokkenen, frequentie, bewaartermijn, etc.)
- Assessment-evaluatie:
  - DPIA verplicht als: nieuwe wetgeving OF risicoscore > 4 OF >= 1 AP-lijst item OF >= 2 EDPB-lijst items
  - DPIA aanbevolen als: precies 1 EDPB-lijst item
  - DTIA verplicht als: internationale doorgifte + specifiek doorgifte-mechanisme
  - IAMA aanbevolen als: hoog-risico AI-systeem OF impactvol algoritme (om de impact op grondrechten in kaart te brengen)

**Relaties Pre-scan ↔ DPIA:**
- `references.prescanModelId`: koppelt prescan-veld aan paragraaf in het Pre-scan Model
- `references.DPIA`: koppelt prescan-veld aan DPIA-paragraaf (mapping types: one-to-one, one-to-many)
- Bij invullen prescan worden antwoorden voorbereid voor overname in de volledige DPIA

**Rapportage-export:**
- Markdown export (`packages/assessment-core/src/utils/markdownExport.ts`):
  - DPIA: metadata en management summary eerst, dan genummerde officiële paragrafen
  - Pre-scan: genummerde secties
  - Repeatable taken worden als markdown-tabellen geëxporteerd (Vraag | Antwoord)
  - Instance labels via `instance_label_template`
  - Waarde-opmaak: `true` → "Ja", `false` → "Nee", arrays → bullet list, null → "*Niet ingevuld*"
  - Definities worden gestript uit de output (`getPlainTextWithoutDefinitions`)
- PDF export (`packages/assessment-core/src/utils/pdfExport.ts`):
  - Zelfde structuur als markdown maar met pdfmake
  - Voorpagina met titel en generatiedatum
  - Inhoudsopgave (automatisch)
  - RijksoverheidSansText font
  - A4 formaat, 70px margins
  - Pre-scan PDF bevat extra "Resultaten" sectie met assessment-uitkomsten
  - Repeatable taken als tabellen (35%/65% kolombreedte)
- Conditional visibility: `shouldShowTask()` respecteert dependencies — verborgen velden komen niet in het rapport

**Build-pipeline:**
- `script/run_all.py` orchestreert: validatie → definitie-enrichment → JSON output → optioneel markdown
- `script/schema_validator.py`: valideert YAML tegen JSON schema via jsonschema
- `script/definition_enricher.py`: injecteert begrippenkader-termen als `<span class="aiv-definition">` HTML in de JSON output
- `script/generate_md_table_tasks.py`: genereert markdown-overzichtstabel van alle taken

### Agent: assessment-validator

**Triggert bij**: na wijzigingen aan YAML-bronnen in `sources/`, expliciet validatieverzoek, voor commits die YAML-bestanden bevatten.

**Taken:**
1. **Schema-validatie** — draai bestaande scripts:
   - `python script/schema_validator.py --schema schemas/assessment-definition.v1.schema.json --source sources/dpia.yaml`
   - `python script/schema_validator.py --schema schemas/assessment-definition.v1.schema.json --source sources/prescan.yaml`
   - `python script/schema_validator.py --schema schemas/assessment-definition.v1.schema.json --source sources/iama.yaml`
   - `python script/schema_validator.py --schema schemas/begrippenkader.v1.schema.json --source sources/begrippenkader_dpia.yaml`
2. **Definitie-enrichment test** — draai `script/definition_enricher.py` om te verifiëren dat de enrichment nog werkt na wijzigingen
3. **Cross-referentie checks** (door de agent zelf):
   - Alle `dependencies[].condition.id` verwijzen naar bestaande task IDs
   - Alle `references.DPIA` IDs verwijzen naar bestaande taken in `dpia.yaml`
   - Alle `source_options` en `instance_mapping` dependencies verwijzen naar bestaande taken
   - `select_option` taken hebben altijd een `options` array
4. **Rapporteer resultaten** — geef duidelijke samenvatting van gevonden problemen met locatie (bestandsnaam + task ID)

## Afbakening

**Wel:**
- Domeinkennis over assessment-schema's, begrippenkader, RVO-styling, DPIA-logica
- Aanroepen van bestaande Python-scripts voor validatie
- Cross-referentie checks die de scripts niet doen

**Niet:**
- Eigen validatielogica die dupliceert wat de scripts al doen
- Wijzigingen aan de Python-scripts zelf
- Kennis van het externe PDF-document "Model DPIA Rijksdienst" (alleen wat in de YAML-bronnen staat)
- Frontend-applicatielogica buiten de export-functies
