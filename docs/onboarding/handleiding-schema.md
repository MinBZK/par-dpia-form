# Handleiding: het assessment-schema

Wat je in een assessment-definitie kunt opschrijven, wat de engine ermee doet, en
waar schema en engine uit elkaar lopen. Het schema staat in
`schemas/assessment-definition.v2.schema.json`; de vier bronnen die eraan
voldoen staan in `sources/`.

De opbouw van het project staat in
[`handleiding-project.md`](handleiding-project.md), git in
[`handleiding-git.md`](handleiding-git.md).

## Inhoud

- [Deel 1: Het bestand als geheel](#deel-1-het-bestand-als-geheel)
- [Deel 2: De task](#deel-2-de-task)
- [Deel 3: De types](#deel-3-de-types)
- [Deel 4: Afhankelijkheden](#deel-4-afhankelijkheden)
- [Deel 5: Berekeningen](#deel-5-berekeningen)
- [Deel 6: Uitkomsten](#deel-6-uitkomsten)
- [Deel 7: Referenties](#deel-7-referenties)
- [Deel 8: Herhaalbare taken](#deel-8-herhaalbare-taken)
- [Deel 9: Het begrippenkader](#deel-9-het-begrippenkader)
- [Deel 10: Valideren en genereren](#deel-10-valideren-en-genereren)
- [Bijlage A: Wat waar wordt gebruikt](#bijlage-a-wat-waar-wordt-gebruikt)
- [Bijlage B: Wat het schema toestaat en de engine niet doet](#bijlage-b-wat-het-schema-toestaat-en-de-engine-niet-doet)

---

## Deel 1: Het bestand als geheel

Een assessment-definitie is één YAML-bestand met een kop en een boom van tasks.

```yaml
# yaml-language-server: $schema=../schemas/assessment-definition.v2.schema.json
name: AI Impact Assessment
description: >-
  AI Impact Assessment (AIIA) versie 2.0, december 2024.
version: "2.0"
urn: 'urn:nl:aiia'
tasks:
  - task: Doel en noodzaak van het systeem
    id: "1"
    type:
      - task_group
    repeatable: false
    tasks:
      # ...
```

De eerste regel is geen commentaar maar een instructie aan je editor: die
valideert de YAML dan tijdens het typen tegen het schema.

| Veld | Verplicht | Wat het doet |
|---|---|---|
| `name` | ja | Naam van het assessment |
| `description` | ja | Korte omschrijving |
| `urn` | ja | Identificatie zonder versie, patroon `^urn:nl:[a-z]+$`, bijvoorbeeld `urn:nl:aiia`. De applicatie leidt de namespace hieruit af |
| `version` | nee | Patroon `^\d+(\.\d+)?(\.\d+)?$`, dus `2`, `2.0` en `2.0.1` mogen |
| `tasks` | ja | De boom met vragen |
| `assessments` | nee | Uitkomstregels, zie [deel 6](#deel-6-uitkomsten) |

---

## Deel 2: De task

Alles in een definitie is een task: een hoofdstuk, een paragraaf en een vraag
gebruiken hetzelfde blok. Hiërarchie ontstaat doordat een task andere tasks
bevat in `tasks`.

Verplicht op elke task: `task`, `id`, `type` en `repeatable`.

| Veld | Type | Waarvoor |
|---|---|---|
| `task` | tekst | De vraag of de titel, zoals de invuller hem leest |
| `id` | tekst | Sleutel waaronder het antwoord wordt opgeslagen. Patroon: een cijfer, daarna segmenten met letters, cijfers en koppeltekens, bijvoorbeeld `2.1.3` of `2.2A.1` |
| `type` | lijst | Zie [deel 3](#deel-3-de-types) |
| `repeatable` | ja of nee | Zie [deel 8](#deel-8-herhaalbare-taken) |
| `description` | tekst | Toelichting onder de vraag |
| `category` | tekst | Vrije indeling, gebruikt in de pre-scan |
| `is_official_id` | ja of nee | Of het nummer overeenkomt met het officiële brondocument. `false` betekent dat het nummer door ons is toegevoegd om de structuur te kunnen leggen |
| `options` | lijst | Keuzes, elk met `value` (verplicht) en `label` |
| `valueType` | tekst | Verwacht type van het antwoord, bijvoorbeeld `string`, `boolean`, `string[]` |
| `defaultValue` | tekst, getal, ja of nee | Waarde die vooraf wordt ingevuld zolang er geen antwoord is |
| `required_status` | ja of nee | Staat in het schema, wordt door de engine niet gelezen |
| `sources` | lijst | Bronverwijzingen met `source` en optioneel `description`, worden bij de vraag getoond |
| `item_name` | tekst | Enkelvoud voor de knoppen bij een herhaalbare task |
| `instance_label_template` | tekst | Label per herhaling, met `{id}` als verwijzing naar een antwoord |
| `references` | object | Koppelingen met andere formulieren, zie [deel 7](#deel-7-referenties) |
| `dependencies` | lijst | Voorwaarden en koppelingen, zie [deel 4](#deel-4-afhankelijkheden) |
| `calculation` | object | Scores, zie [deel 5](#deel-5-berekeningen) |
| `tasks` | lijst | Onderliggende tasks |

---

## Deel 3: De types

`type` is een lijst, maar in de praktijk staat er één waarde in.

| Type | Wat de invuller ziet | Let op |
|---|---|---|
| `task_group` | Geen invulveld, alleen een kop met onderliggende tasks | De container waarmee je structuur maakt |
| `informational` | Alleen tekst | Voor uitleg tussen de vragen |
| `text_input` | Eén regel tekst | |
| `open_text` | Meerdere regels tekst | Ondersteunt markdown-opmaak |
| `date` | Datumveld | |
| `radio_option` | Eén keuze uit een lijst | `options` nodig, en `valueType: boolean` bij ja/nee |
| `checkbox_option` | Meerdere keuzes | `valueType: "string[]"` |
| `select_option` | Keuzelijst | Het schema eist hier `options`, bij de andere types niet |
| `multiselect_scrollable` | Meerkeuze in een scrollbare lijst | |
| `image` | Afbeelding met metadata | |

Een ja/nee-vraag met toelichting is het patroon dat het vaakst voorkomt:

```yaml
- task: Is de input(data) relevant en representatief?
  id: "4.1.2.1"
  type:
    - radio_option
  valueType: boolean
  options:
    - value: true
      label: Ja
    - value: false
      label: Nee
  repeatable: false

- task: Licht toe
  id: "4.1.2.1.a"
  type:
    - open_text
  repeatable: false
  dependencies:
    - type: conditional
      condition:
        id: "4.1.2.1"
        operator: equals
        value: false
      action: show
```

De engine kent daarnaast het type `signing`, maar het schema staat het niet toe.
Zet je het in de YAML, dan faalt de validatie. Zie
[bijlage B](#bijlage-b-wat-het-schema-toestaat-en-de-engine-niet-doet).

---

## Deel 4: Afhankelijkheden

`dependencies` is een lijst. Er zijn drie soorten.

### `conditional`: een vraag tonen op grond van een eerder antwoord

```yaml
dependencies:
  - type: conditional
    condition:
      id: "2.1.6"
      operator: equals
      value: true
    action: show
```

Operatoren die de engine uitvoert:

| Operator | Betekenis |
|---|---|
| `equals` | Het antwoord is gelijk aan `value`. De teksten `"true"`, `"false"` en `"null"` worden eerst omgezet naar hun echte waarde |
| `contains` | Het antwoord is een lijst die `value` bevat. Is het geen lijst, dan gedraagt het zich als `equals` |
| `any` | Altijd waar. Gebruikt bij `source_options`, waar het alleen de bronvraag aanwijst |

`value` mag niet leeg zijn: de engine gooit dan een fout.

Twee dingen die makkelijk misgaan. De vraag waar je naar verwijst moet in
dezelfde tak zitten, want de engine zoekt de bijbehorende instantie omhoog in de
boom. En van de acties doet alleen `show` iets: `hide` wordt door het schema
geaccepteerd maar door de engine genegeerd, dus draai de voorwaarde om in plaats
van `hide` te gebruiken.

### `source_options`: keuzes overnemen uit de antwoorden op een andere vraag

```yaml
- task: Persoonsgegevens
  id: "3.1.3"
  type:
    - checkbox_option
  valueType: "string[]"
  repeatable: false
  dependencies:
    - type: source_options
      condition:
        id: "2.1.1"
        operator: any
      action: options
```

De keuzelijst bestaat dan uit de unieke, niet-lege antwoorden die op `2.1.1`
zijn gegeven. Handig als de invuller eerder zelf een lijst heeft opgebouwd.

### `instance_mapping`: het aantal herhalingen gelijk houden

```yaml
- task: Verwerkingsdoeleinden
  id: "5.1"
  type:
    - task_group
  repeatable: true
  instance_label_template: "Gegevensverwerking {5.1.1}"
  dependencies:
    - type: instance_mapping
      source:
        id: "3.1.1"
      mapping_type: "one_to_one"
      action: sync_instances
```

Elke herhaling van de bronvraag levert een herhaling van deze groep op. Bij
`mapping_type` staan `one_to_one`, `one_to_many` en `many_to_one` in het schema.

---

## Deel 5: Berekeningen

Met `calculation` leid je een getal af uit de antwoorden. Dat getal komt onder
`scoreKey` in de scores terecht, waar de uitkomstregels uit
[deel 6](#deel-6-uitkomsten) bij kunnen.

```yaml
calculation:
  scoreKey: "bijzonder_persoonsgegeven"
  expression: "answers('1.2.2') | count"
  riskScore:
    - when: "bijzonder_persoonsgegeven == 0"
      value: 0
    - when: "bijzonder_persoonsgegeven >= 1 && bijzonder_persoonsgegeven <= 6"
      value: 1
    - when: "bijzonder_persoonsgegeven > 6"
      value: 2
```

`expression` is [JEXL](https://github.com/TomFrost/jexl). De engine evalueert
hem, loopt daarna de `riskScore`-regels van boven naar beneden af en neemt de
`value` van de eerste regel die waar is. Binnen `when` is de uitkomst van
`expression` beschikbaar onder de naam uit `scoreKey`. Is er geen `riskScore`,
dan is de uitkomst van `expression` zelf de score.

Wat er in een expressie beschikbaar is:

| Aanroep | Wat het teruggeeft |
|---|---|
| `answers('2.1.1')` | Het antwoord op die task. Bij een herhaalbare task het antwoord van de eerste herhaling |
| `countSelectedOptions('3.1')` | Aantal aangevinkte opties, 0 als er niets staat |
| `bool(answers('7.1.1'))` | `true` bij de waarde `true` of de tekst `"true"`, anders `false` |
| `<lijst> \| count` | Lengte van een lijst, 0 als het geen lijst is |
| `weightedCountMap(values, keys, weights)` | Telt per antwoord het bijbehorende gewicht op |
| `criteriaCheck(criteria)` | Waar zodra één criterium waar is |
| `scores.<scoreKey>` | Een eerder berekende score, in de uitkomstregels |

Een expressie die faalt, levert een foutmelding in de console en een lege score
op. De rest van het formulier blijft werken, dus een stille nul is hier het
teken dat er iets niet klopt.

---

## Deel 6: Uitkomsten

`assessments` staat naast `tasks`, dus op het hoogste niveau van het bestand.
Het beschrijft welke conclusie uit de antwoorden volgt. Alleen `prescan.yaml`
gebruikt dit.

```yaml
assessments:
  - id: "DTIA"
    levels:
      - level: "required"
        expression: "criteria.internationale_doorgifte && criteria.mechanisme"
        result: "DTIA verplicht"
        criteria:
          - id: "internationale_doorgifte"
            expression: "bool(answers('2.1.1')) && answers('2.1.3') == 'Buiten EER'"
            explanation: "er sprake is van internationale doorgifte buiten de EER"
          - id: "mechanisme"
            expression: "answers('2.1.6') in ['Standaard contractsbepaling (SCC)', 'Overig mechanisme']"
            explanation: "er gebruik wordt gemaakt van Standaard contractsbepalingen (SCC)"
```

Hoe de engine dit leest:

1. Per `id` worden de `levels` op volgorde afgelopen. De eerste die waar
   uitkomt, wint; de rest wordt overgeslagen. Zet `required` dus boven
   `recommended`.
2. Eerst worden de `criteria` los geëvalueerd. De criteria die waar zijn, komen
   beschikbaar als `criteria.<id>` in `expression`.
3. `result` is de tekst die de invuller ziet.
4. De toelichting wordt opgebouwd uit de criteria die waar waren: "Een DTIA is
   verplicht omdat:" gevolgd door de `explanation` van elk criterium. Schrijf
   die dus als bijzin, zonder hoofdletter en zonder punt. Zijn er geen criteria
   waar, dan valt hij terug op `explanation` van het niveau.

`level` mag `required` of `recommended` zijn.

---

## Deel 7: Referenties

Met `references` koppel je een vraag aan een vraag in een ander formulier, zodat
een antwoord niet twee keer getypt hoeft te worden.

```yaml
references:
  AIIA:
    - id: "1.1.1"
      type: pre-view
```

De sleutel noemt het formulier waarin het doel staat (`DPIA`, `IAMA`, `AIIA`).
De sleutel `prescanModelId` is geen koppeling maar een nummer uit het
bronmodel.

| Type | Wat de engine doet |
|---|---|
| `pre-fill` | Vult het antwoord in het doelformulier vooraf in |
| `one-to-one` | Idem |
| `one-to-many` | Idem |
| `pre-view` | Toont het bronantwoord als context, zonder het over te nemen |
| `many-to-many` | Idem |

Het schema kent daarnaast `direct takeover` en `many-to-one`. Die valideren wel,
maar de engine doet er niets mee. De logica staat in
`packages/assessment-core/src/composables/useReferences.ts`.

Een waarde mag ook een kale tekst of een lijst teksten zijn. Dan is er geen type
en wordt de verwijzing alleen vastgelegd, niet uitgevoerd.

---

## Deel 8: Herhaalbare taken

```yaml
- task: Gegevensverwerkingen
  id: "3.1"
  type:
    - task_group
  repeatable: true
  item_name: gegevensverwerking
  instance_label_template: "Gegevensverwerking {3.1.1}"
```

`repeatable: true` geeft de invuller knoppen om een herhaling toe te voegen of
te verwijderen. `item_name` is het enkelvoud op die knoppen; zonder dat veld
gebruikt de engine de naam van de task. `instance_label_template` bepaalt het
kopje boven elke herhaling, waarbij `{3.1.1}` wordt vervangen door het antwoord
op die vraag binnen diezelfde herhaling.

Antwoorden op herhaalbare groepen worden opgeslagen als lijst met een `_index`
per element. Verwijderen laat gaten in die nummering vallen, en dat hoort zo.

---

## Deel 9: Het begrippenkader

Uitleg bij een begrip schrijf je niet in de vraag. Je zet het begrip in
`sources/begrippenkader_<naam>.yaml`, en het generatiescript hangt de uitleg als
tooltip aan elk voorkomen in de vraagteksten. Dat bestand heeft een eigen
schema, `schemas/begrippenkader.v1.schema.json`.

Een begrip heeft `id`, `name`, `category` en `definition`; die vier zijn
verplicht. Daarnaast heeft het bestand een kop met `name`, `description`, `urn`,
`language` en `owners`.

Met de optie `--definitions-once-per-page` wordt een begrip per pagina één keer
verrijkt in plaats van bij elk voorkomen. Het IAMA gebruikt die optie, de DPIA
en de pre-scan niet.

---

## Deel 10: Valideren en genereren

Alles in één keer:

```bash
./script/generate_sources.sh
```

Dit valideert de vier bronnen tegen het schema, voegt de begrippen in en
schrijft `sources/generated/*.json` plus de leesbare vragenlijsten in
`docs/questions/`. Draai het na elke wijziging in `sources/`, anders zie je in
de browser nog de oude versie.

Eén bron, als dat sneller is:

```bash
uv run --frozen python script/run_all.py \
  --schema schemas/assessment-definition.v2.schema.json \
  --source sources/aiia.yaml \
  --begrippen-yaml sources/begrippenkader_aiia.yaml \
  --output-json sources/generated/AIIA.json \
  --output-md docs/questions/questions_AIIA.md \
  --definitions-once-per-page
```

`--skip-validation` slaat de schemacontrole over. Commit uiteindelijk met de
volledige `generate_sources.sh`, zodat alle gegenereerde bestanden bij elkaar
passen.

Veelvoorkomende meldingen:

| Melding | Oorzaak |
|---|---|
| `'options' is a required property` | Een `select_option` zonder `options` |
| `'<waarde>' is not one of [...]` | Een type dat het schema niet kent, bijvoorbeeld een typfout of `signing` |
| `'<id>' does not match '^[0-9]+(\.[A-Za-z0-9-]+)*$'` | Een id dat niet met een cijfer begint of een ongeldig teken bevat |
| `'task' is a required property` | Een task zonder tekst, vaak door een inspringfout waardoor een blok op de verkeerde plek hangt |
| `got an unsuported operator all` | Geen validatiefout maar een fout tijdens het invullen: `all` staat in het schema en niet in de engine |

De foutmelding noemt het pad naar de task, met pijlen en genummerd vanaf nul:

```
Validation error in aiia.yaml at tasks -> 5 -> tasks -> 1 -> tasks -> 1 ->
tasks -> 0 -> type -> 0: 'radio_optie' is not one of ['text_input', ...]
```

Dat is dus het zesde hoofdstuk, daarbinnen de tweede task, daarbinnen de tweede,
en daarin de eerste. Tel in de YAML mee vanaf de eerste task onder `tasks:`.

---

## Bijlage A: Wat waar wordt gebruikt

Aantallen per bron, zodat je weet waar je een voorbeeld vindt.

| | pre-scan | DPIA | IAMA | AIIA |
|---|---|---|---|---|
| `task_group` | 18 | 58 | 50 | 66 |
| `open_text` | 4 | 48 | 82 | 139 |
| `text_input` | 1 | 50 | 0 | 2 |
| `radio_option` | 23 | 21 | 3 | 19 |
| `checkbox_option` | 8 | 19 | 0 | 0 |
| `select_option` | 3 | 10 | 0 | 1 |
| `multiselect_scrollable` | 0 | 0 | 2 | 0 |
| `informational` | 0 | 0 | 1 | 2 |
| `date` | 0 | 3 | 0 | 0 |
| `image` | 0 | 1 | 0 | 0 |
| tasks met `dependencies` | 20 | 52 | 5 | 5 |
| tasks met `calculation` | 11 | 0 | 0 | 0 |
| tasks met `references` | 33 | 0 | 9 | 1 |
| herhaalbare tasks | 0 | 28 | 4 | 1 |
| `assessments` | ja | nee | nee | nee |

---

## Bijlage B: Wat het schema toestaat en de engine niet doet

Het schema is op punten ruimer dan de engine. Deze vijf valideren zonder klacht
en leveren daarna niets op:

| In het schema | Wat er gebeurt |
|---|---|
| `action: hide` | De engine kijkt alleen naar `show` en negeert de rest |
| `operator: all` | De engine gooit tijdens het invullen een fout op een onbekende operator |
| `type: direct takeover` bij een referentie | Telt niet als vooraf invullen en niet als tonen, dus er gebeurt niets |
| `type: many-to-one` bij een referentie | Idem |
| `required_status` | Wordt nergens gelezen |

Andersom kent de engine het tasktype `signing`, dat het schema niet toestaat.

Loop je hier tegenaan, dan is dat een gat tussen twee bestanden en niet iets om
in de YAML op te lossen. Leg het vast in `docs/pdr/` als je voorstelt om het
recht te trekken.
