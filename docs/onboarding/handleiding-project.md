# Handleiding: werken aan het AIIA

Voor wie meewerkt aan het AI Impact Assessment in PAR Assessments. Deze
handleiding is de naslag bij het project; de presentatie (`presentatie.html`) is
de korte versie ervan. Twee onderwerpen staan apart:
[`handleiding-git.md`](handleiding-git.md) voor git, en
[`handleiding-schema.md`](handleiding-schema.md) voor alles wat je in een
assessment-definitie kunt opschrijven.

Deel 1 tot en met 4 beschrijven het domein, de stack en de opbouw van een
assessment-definitie. Deel 5 en 6 zijn naslag: de conventies in deze repo en
waar je dingen opzoekt.

## Inhoud

- [Deel 1: Het domein in twintig minuten](#deel-1-het-domein-in-twintig-minuten)
- [Deel 2: De stack](#deel-2-de-stack)
- [Deel 3: Je omgeving opzetten](#deel-3-je-omgeving-opzetten)
- [Deel 4: Anatomie van een assessment-definitie](#deel-4-anatomie-van-een-assessment-definitie)
- [Deel 5: Conventies in deze repo](#deel-5-conventies-in-deze-repo)
- [Deel 6: Zelf opzoeken en controleren](#deel-6-zelf-opzoeken-en-controleren)
- [Bijlage A: Woordenlijst](#bijlage-a-woordenlijst)
- [Bijlage B: Commando-spiekbriefje](#bijlage-b-commando-spiekbriefje)

---

## Deel 1: Het domein in twintig minuten

### Waarom deze applicatie bestaat

Een overheidsorganisatie die persoonsgegevens verwerkt of een algoritme inzet,
moet vooraf nadenken over de gevolgen. Een verkeerd ingericht systeem raakt
mensen: een onterechte afwijzing, een verkeerde risico-inschatting, een groep
die stelselmatig slechter af is.

Die verplichting is in de loop van de tijd in vier instrumenten gaan zitten.
PAR Assessments maakt ze alle vier invulbaar in de browser, en probeert te
voorkomen dat je dezelfde vraag vier keer beantwoordt.

### De vier instrumenten

| Instrument | Waar het over gaat | Grondslag |
|---|---|---|
| **Pre-scan** | Snelle toets vooraf: is een DPIA, DTIA, IAMA of KIA nodig? | Rijksmodel DPIA |
| **DPIA** | Data Protection Impact Assessment: gevolgen van een gegevensverwerking | AVG art. 35 |
| **IAMA** | Impact Assessment Mensenrechten en Algoritmes: grondrechten bij algoritmegebruik | Rijksbreed instrument, Universiteit Utrecht |
| **AIIA** | AI Impact Assessment 2.0: verantwoorde inzet van AI | IenW (IDlab, ILT, RWS Datalab), december 2024 |

Ze overlappen bewust. De pre-scan bepaalt welke van de andere assessments nodig
zijn: een DPIA of DTIA verplicht, een IAMA of KIA aanbevolen. De DPIA gaat over
persoonsgegevens. Het IAMA gaat over grondrechten. Het AIIA gaat over het
AI-systeem zelf: data, model, robuustheid, governance. Wie een AI-systeem bouwt
dat persoonsgegevens verwerkt, heeft in de praktijk met alle vier te maken.

### Wat de AI-verordening hieraan toevoegt

De AI-verordening (Verordening (EU) 2024/1689) deelt AI-systemen in naar
risico: onaanvaardbaar, hoog, beperkt, minimaal. Die indeling is *absoluut*:
hij volgt uit het toepassingsgebied, niet uit hoe erg de gevolgen in jouw geval
zijn. Een systeem kan grote privacygevolgen hebben en toch minimaal risico zijn
volgens de verordening.

Die indeling speelt meteen mee. Het AIIA heeft er twee bijlagen voor:

- **Bijlage 1: Toets risicoclassificatie** bepaalt in welke categorie het
  systeem valt. Valt het onder "onaanvaardbaar", dan mag het niet en hoeft de
  rest van het AIIA niet.
- **Bijlage 2: Hoog-risicosystemen** vul je aanvullend in als Bijlage 1 op
  "hoog" uitkomt.

### Wat je hier níét doet

Je bepaalt niet of een vraag inhoudelijk klopt. De inhoud van de pre-scan en de
DPIA is van het PAR (Privacy Adviseurs Rijk); de IAMA-inhoud ligt bij de AI- en
algoritmefunctie binnen BZK en de AIIA-inhoud bij de AI-functie binnen I&W. Wat jij doet, is die inhoud *correct
representeren* in een structuur die de applicatie kan uitvoeren. Kom je een
vraag tegen waarvan je denkt dat hij inhoudelijk niet klopt: schrijf hem op,
bespreek hem, wijzig hem niet zelf.

---

## Deel 2: De stack

### Het idee in één zin

**Een formulier is data, geen code.**

Nergens in deze applicatie staat een `if` die zegt "toon nu vraag 4.1.2". De
vragen, hun volgorde, hun type, hun onderlinge afhankelijkheden en hun
berekeningen staan in YAML-bestanden in `sources/`. De applicatie is een
*engine* die zo'n bestand inleest en er een formulier van maakt.

Dat betekent twee dingen voor jou:

1. Verreweg het meeste van jouw werk is YAML schrijven, geen TypeScript.
2. Als iets niet in YAML uit te drukken is, is dat een tekortkoming van de
   engine.

### De pijplijn

```
sources/aiia.yaml                 de bron: vragen, types, logica
sources/begrippenkader_aiia.yaml  de begrippen met hun tooltips
        │
        │  script/run_all.py  (valideert tegen het JSON-schema,
        │                      voegt begrippen in, genereert docs)
        ▼
sources/generated/AIIA.json       wat de applicatie inleest
docs/questions/questions_AIIA.md  leesbare vragenlijst voor review
        │
        ▼
packages/assessment-core          de engine: rendert, navigeert, valideert
        │
        ├── apps/standalone-form       één HTML-bestand, geen backend
        └── apps/boekhouding-frontend  samenwerken, opslaan, rollen
```

Verander je iets in `sources/aiia.yaml`, dan moet je de pijplijn opnieuw
draaien voordat je het in de browser ziet.

### De repository

Een pnpm-monorepo: meerdere pakketten in één repository, met gedeelde
dependencies.

| Pad | Wat het is | Kom je hier? |
|---|---|---|
| `sources/` | De assessment-definities in YAML | **Ja, voortdurend** |
| `schemas/` | JSON-schema's waar die YAML aan moet voldoen | Ja, om te lezen |
| `script/` | Python-scripts: validatie en generatie | Ja, om te draaien |
| `packages/assessment-core/` | Vue 3-engine: rendering, navigatie, validatie, PDF | Als je aan de engine werkt |
| `apps/standalone-form/` | Formulier zonder backend | Ja, dit is je dev-omgeving |
| `apps/boekhouding-frontend/` | Vue 3 SPA met projecten en rollen | Zelden |
| `apps/boekhouding-backend/` | Fastify API, PostgreSQL, Keycloak | Waarschijnlijk niet |
| `docs/` | Documentatie, waaronder deze handleiding | Ja |

### De technologie, en waarom

- **Vue 3 met Composition API en TypeScript.** Een formulier is voor het grootste
  deel afgeleide toestand: welke vragen zichtbaar zijn, welke scores eruit
  volgen, of je verder mag. Vue's reactiviteit maakt dat expliciet.
- **Pinia** voor de stores (`tasks`, `answers`, `calculations`, `schemas`).
- **JEXL** om de expressies uit de YAML te evalueren. Daarom kan een
  risicoberekening in een YAML-bestand staan in plaats van in code.
- **Vite**, met een single-file build voor het standalone formulier: alles in
  één HTML-bestand, zodat je het kunt mailen of op een stick kunt zetten.
- **Python met uv** voor de generatiescripts. Historisch gegroeid; de reden dat
  het twee talen zijn, is dat de bronbewerking en de applicatie twee
  verschillende doelgroepen dienen.
- **RVO Design System** voor de styling van de applicatie zelf. Let op: de
  presentatie gebruikt het NLDD Design System. Dat zijn twee
  verschillende systemen; verwar ze niet.

---

## Deel 3: Je omgeving opzetten

Je hebt nodig: Node.js 22 of hoger, `pnpm` via corepack, `uv` voor de
Python-scripts, en `git`. Podman of Docker heb je pas nodig als je de volledige
stack wilt draaien.

### Stap 1: de repository

```bash
git clone https://github.com/MinBZK/par-dpia-form.git
cd par-dpia-form
git checkout add_aiia
```

Werk altijd vanaf `add_aiia`, nooit vanaf `main`. Al het AIIA-werk staat op deze
branch.

### Stap 2: dependencies

```bash
corepack enable
pnpm install
```

### Stap 3: het standalone formulier draaien

```bash
pnpm dev
```

Je formulier staat nu op <http://localhost:5175>. Dit is je werkomgeving voor de
komende periode. Geen database, geen inlog, geen containers.

### Stap 4: de bronnen genereren

Deze stap wordt het vaakst overgeslagen:

```bash
./script/generate_sources.sh
```

Dit valideert alle vier de YAML-bronnen tegen het schema en schrijft
`sources/generated/*.json` plus de vragenlijsten in `docs/questions/`. Draai het
na elke wijziging in `sources/`.

Wil je alleen het AIIA doen terwijl je aan het werk bent, dat gaat sneller:

```bash
uv run --frozen python script/run_all.py \
  --schema schemas/assessment-definition.v2.schema.json \
  --source sources/aiia.yaml \
  --begrippen-yaml sources/begrippenkader_aiia.yaml \
  --output-json sources/generated/AIIA.json \
  --output-md docs/questions/questions_AIIA.md \
  --definitions-once-per-page
```

Commit uiteindelijk wel met de volledige `generate_sources.sh`, zodat alle
gegenereerde bestanden bij elkaar passen.

### Stap 5: de volledige stack (optioneel)

```bash
podman compose -f containers/compose.dev.yaml up -d
pnpm db:seed
```

Frontend op <http://localhost:5174>, backend op <http://localhost:3000>,
Keycloak op <http://localhost:8080> (`admin` / `admin`). Testgebruikers:
`sam@example.com` en `noor@example.com`, wachtwoord `welkom123`.

### Als er iets misgaat

| Symptoom | Waarschijnlijke oorzaak |
|---|---|
| Je wijziging in YAML is niet zichtbaar | `generate_sources.sh` niet gedraaid |
| `run_all.py` klaagt over het schema | Je YAML voldoet niet; de foutmelding noemt het pad naar de task |
| `uv: command not found` | `uv` installeren, zie <https://docs.astral.sh/uv/> |
| Alle backend-tests falen met `ECONNREFUSED ... :5432` | Die tests willen PostgreSQL. Draai de containers, of test alleen de pakketten die je raakt (zie bijlage B) |
| `pnpm install` gedraagt zich anders dan bij je collega | `package.json` heeft geen `packageManager`-veld, dus `corepack enable` pint geen versie. Spreek onderling één pnpm-versie af, of meld het als issue |
| De README noemt `form-app/` en het v1-schema | De README is op dit punt verouderd. `generate_sources.sh` is de waarheid: `sources/generated/` en het **v2**-schema |

Die laatste is een goede eerste bijdrage als je hem tegenkomt.

### Wat er nu al stuk is

Start je het AIIA voor het eerst, dan zie je twee dingen die niet kloppen. Ze
staan zo op de branch.

1. Het startscherm van het AIIA toont de tekst van de pre-scan: *"Start de
   pre-scan"*, *"Met de pre-scan toets je of een DPIA, DTIA, IAMA of KIA nodig
   is"* en de knop *"Beginnen met de pre-scan"*.
2. Het logo zegt *"Pre-scan, DPIA en IAMA"*. Het AIIA ontbreekt.

De oorzaak is dezelfde voor allebei.
`packages/assessment-core/src/components/FileUploadPage.vue` heeft drie
`if`/`else`-ketens over `taskStore.activeNamespace` die `FormType.DPIA` en
`FormType.IAMA` afvangen en daarna in een `else` vallen die de pre-scan-tekst
teruggeeft. `FormType.AIIA` komt er niet in voor, dus het AIIA belandt in die
`else`. In `AppBanner.vue` staat de ondertitel als vaste waarde.

Geschikt als eerste codewijziging. Twee dingen om op te
letten. De teksten zijn inhoud, dus leg de formulering voor voordat je die
vastlegt. En er liggen tests op deze strings
(`packages/assessment-core/test/cov/components-FileUploadPage.cov.test.ts` en
`components-AppBanner.cov.test.ts`), dus die horen bij je wijziging mee te
veranderen.

---

## Deel 4: Anatomie van een assessment-definitie

### Een bestand

```yaml
# yaml-language-server: $schema=../schemas/assessment-definition.v2.schema.json
name: AI Impact Assessment
urn: 'urn:nl:aiia'
version: "2.0"
description: >-
  AI Impact Assessment (AIIA) versie 2.0, december 2024.
tasks:
  - task: Doel en noodzaak van het systeem
    id: "1"
    type:
      - task_group
    repeatable: false
    tasks:
      # ...
```

De regel bovenaan is geen commentaar maar een instructie aan je editor: die
valideert je YAML dan live tegen het schema. Gebruik hem.

### Een task

Alles in een assessment is een task: een hoofdstuk, een paragraaf, een vraag.
Hiërarchie ontstaat doordat een task andere tasks bevat.

Verplicht op elke task: `task` (de tekst), `id`, `type`, `repeatable`.

De elf types die de engine kent (`packages/assessment-core/src/models/dpia.ts`,
`TaskTypeValue`):

| Type | Waarvoor |
|---|---|
| `task_group` | Container voor andere tasks |
| `informational` | Tekst zonder invulveld |
| `text_input` | Eén regel tekst |
| `open_text` | Meerdere regels tekst |
| `date` | Datum |
| `radio_option` | Eén keuze uit een lijst |
| `checkbox_option` | Meerdere keuzes |
| `select_option` | Keuzelijst |
| `multiselect_scrollable` | Meerkeuze in een scrollbare lijst |
| `image` | Afbeelding met metadata |
| `signing` | Ondertekening |

> **Let op:** `docs/standard/form_standard.md` noemt er maar acht. Dat document
> is ouder dan de code. Bij twijfel is `TaskTypeValue` in de code de waarheid,
> en daarna het v2-schema.

### Vier mechanismen die je gaat gebruiken

**1. Afhankelijkheden: een vraag tonen op grond van een eerder antwoord**

```yaml
dependencies:
  - type: conditional
    condition:
      id: "2.1.6"
      operator: equals
      value: true
    action: show
```

Operatoren: `equals`, `contains`, `any`.

**2. Berekeningen: een score afleiden uit antwoorden**

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

`expression` is JEXL. `answers()` en `count` zijn eigen functies die de engine
toevoegt. Zie `packages/assessment-core/src/stores/calculations.ts`.

**3. Referenties: een antwoord op één plek hergebruiken**

```yaml
references:
  AIIA:
    - id: "1.1.1"
      type: pre-view
```

De sleutel (`DPIA`, `IAMA`, `AIIA`) noemt het formulier waarin het *doel* staat.
Types: `pre-fill`, `one-to-one` en `one-to-many` vullen het doelantwoord in;
`pre-view` en `many-to-many` tonen het bronantwoord als context zonder het over
te nemen. De logica staat in
`packages/assessment-core/src/composables/useReferences.ts`, en die is het lezen
waard.

**4. Herhaalbaarheid**

```yaml
repeatable: true
item_name: "verwerking"
instance_label_template: "{1.1.1}"
```

Voor een vraag die per gegevensverwerking, per systeem of per partij opnieuw
beantwoord wordt.

### Het begrippenkader

`sources/begrippenkader_aiia.yaml` bevat begrippen met hun uitleg. Het
generatiescript zoekt die begrippen in de vraagteksten op en hangt er een
tooltip aan. Je schrijft dus geen uitleg in de vraag zelf; je zorgt dat het
begrip in het begrippenkader staat.

### `is_official_id`

Valt je op in `aiia.yaml`. Het zegt of het nummer van de task overeenkomt met
het nummer in het officiële brondocument. Staat er `false`, dan is het nummer
door ons verzonnen om de structuur te kunnen leggen. Dat is relevant zodra
iemand het ingevulde formulier naast het originele PDF legt.

---

## Deel 5: Conventies in deze repo

### Branches

`main` is beschermd en gaat alleen via een pull request met review. `add_aiia`
draagt het AIIA-werk; daar mag je rechtstreeks naartoe pushen. Houd je werk
liever apart, vertak dan van `add_aiia` en breng het daar weer terug.

Naamgeving: `aiia/<waar-het-over-gaat>`. Kort en beschrijvend.

De commando's staan in [`handleiding-git.md`](handleiding-git.md) onder
"Branches".

### Commits

Conventional Commits, zoals de rest van de repository:

```
feat(aiia): maak hoofdstuk 4 vragen ja/nee met toelichting
fix(aiia): herstel dependency-id in 5.2.2
docs(onboarding): vul de commando-lijst aan
```

Kleine commits die één ding doen. Een commit die zowel YAML omzet als een bug in
de engine fixt, is twee commits.

### Pull requests

Een PR beschrijft wat er is gewijzigd, waarom het zo is opgelost, en wat er is
gecontroleerd: gedraaide scripts, doorgelopen schermen.

Houd een PR klein genoeg om in een kwartier te reviewen. Eén hoofdstuk is een
prima PR. Vier hoofdstukken is er één te veel.

### CI

Bij elke PR draaien er controles. De belangrijkste voor jou: schema-validatie
van de bronnen, linting, en een link-checker. Faalt er iets, lees dan de
foutmelding voordat je iets aanpast; die noemt meestal het exacte pad naar de
task die niet klopt.

**De testdekking staat op 100% en dat wordt hard afgedwongen.** Elk bronbestand
telt mee, ook bestanden die geen enkele test importeert. Schrijf je een regel
TypeScript zonder test, dan faalt CI.

Eén bestand snel controleren:

```bash
pnpm --filter <pkg> exec vitest run <testbestand> \
  --coverage --coverage.include='<bronbestand>'
```

Exit 0 betekent dat dat bestand op 100% staat. De volledige regels staan in `.claude/CLAUDE.md` onder
"Testing & coverage".

### De CHANGELOG

Weeg bij elke PR af of `CHANGELOG.md` bijgewerkt moet worden; meestal wel.
Schrijf voor de mensen die de invulhulp gebruiken, niet voor reviewers: wat
merken zij ervan? Puur technische wijzigingen gaan kort onder "Onder de
motorkap". Bij twijfel: wel opnemen.

Niet zonder overleg: pushen naar `main`, dependencies toevoegen, gegenereerde
bestanden met de hand bewerken, en wijzigingen aan de inhoud van een vraag.

---

## Deel 6: Zelf opzoeken en controleren

### Vier plekken waar het antwoord meestal staat

| Je vraag | Waar je kijkt |
|---|---|
| Mag dit in de YAML? | `schemas/assessment-definition.v2.schema.json` |
| Doet de applicatie hier iets mee? | `packages/assessment-core/src/`, begin bij `models/dpia.ts` en zoek de term |
| Hoe leest deze vraag voor de invuller? | `docs/questions/questions_AIIA.md` |
| Is hier eerder over besloten? | `docs/pdr/`, `CHANGELOG.md`, en de git-historie |

De laatste rij is de meest onderschatte. Voor de vraag waarom iets is zoals het
is:

```bash
git log -S"multiselect_scrollable" --oneline    # wanneer kwam dit erin?
git log -p --follow sources/aiia.yaml | less    # wat is er met dit bestand gebeurd?
git log --oneline main..add_aiia                # wat is er op deze branch gedaan?
```

De redenen staan meestal in het commitbericht.

### Hoe je zelf weet of het klopt

Voor een groot deel van het werk geeft een script het antwoord al:

1. **Valideert het?** `./script/generate_sources.sh`. Faalt dit, dan is je
   YAML fout en zegt de melding waar.
2. **Ziet het eruit zoals je bedoelde?** Ververs het formulier in de browser en
   doorloop de vraag zoals een invuller dat zou doen. Verschijnt de toelichting
   op het goede moment?
3. **Werkt de rest nog?** De tests van de engine en het standalone formulier
   (zie bijlage B).
4. **Leest het goed?** `docs/questions/questions_AIIA.md` is na het genereren
   de leesbare versie van jouw wijziging.

Wat een script niet beoordeelt: of de vraag inhoudelijk klopt, of het gekozen
type past, en of twee vragen echt hetzelfde vragen. Dat is inhoud, en die ligt
bij het PAR en de AI-functie binnen BZK (pre-scan, DPIA, IAMA) of bij de
AI-functie binnen I&W (AIIA).

---

## Bijlage A: Woordenlijst

| Term | Betekenis |
|---|---|
| **AIIA** | AI Impact Assessment 2.0, het instrument waar je aan werkt |
| **AI-verordening** | Verordening (EU) 2024/1689, de Europese AI-wet |
| **AVG** | Algemene verordening gegevensbescherming |
| **Begrippenkader** | Lijst met begrippen en uitleg; wordt als tooltip in de vragen gehangen |
| **DPIA** | Data Protection Impact Assessment, AVG art. 35 |
| **DTIA** | Data Transfer Impact Assessment, bij doorgifte buiten de EER |
| **Engine** | `packages/assessment-core`: leest een definitie en maakt er een formulier van |
| **IAMA** | Impact Assessment Mensenrechten en Algoritmes |
| **JEXL** | Expressietaal waarin de berekeningen in de YAML geschreven zijn |
| **KIA** | Kinderrechten Impact Assessment, bij een digitale dienst voor minderjarigen |
| **PAR** | Privacy Adviseurs Rijk, inhoudelijk eigenaar van de pre-scan en DPIA |
| **PDR** | Product Decision Record: een vastgelegde ontwerpkeuze, zie `docs/pdr/` |
| **Pre-scan** | Snelle toets of een DPIA, DTIA, IAMA of KIA nodig is |
| **Reference** | Koppeling tussen twee vragen, binnen of tussen formulieren |
| **Task** | Alles in een definitie: hoofdstuk, paragraaf of vraag |
| **URN** | Unieke naam van een formulier, bijvoorbeeld `urn:nl:aiia` |

## Bijlage B: Commando-spiekbriefje

```bash
# Dagelijks
pnpm dev                        # standalone formulier, localhost:5175
./script/generate_sources.sh    # YAML valideren en JSON genereren

# Kwaliteit
pnpm lint
pnpm type-check
pnpm --filter @overheid-assessment/core test:coverage   # 1306 tests, de engine
pnpm --filter standalone-form test:coverage             # 91 tests

# Let op: `pnpm -r test:coverage` trekt ook de backend mee. Die tests draaien
# tegen een echte testdatabase (`TEST_DATABASE_URL`, default
# postgresql://parassessment:parassessment@localhost:5432/parassessment_test).
# Zonder draaiende containers falen ze allemaal met ECONNREFUSED. Dat is geen
# kapotte code. Zie .claude/CLAUDE.md voor het aanmaken van die database.

# Git: zie handleiding-git.md. Wat je na een YAML-wijziging vastlegt:
git add sources/aiia.yaml sources/generated/AIIA.json docs/questions/questions_AIIA.md

# Volledige stack, als je hem nodig hebt
podman compose -f containers/compose.dev.yaml up -d
pnpm db:seed
```

### Waar vind je wat

| Vraag | Bestand |
|---|---|
| Welke task-types bestaan er? | `packages/assessment-core/src/models/dpia.ts` |
| Wat mag er in de YAML? | [`handleiding-schema.md`](handleiding-schema.md) en `schemas/assessment-definition.v2.schema.json` |
| Hoe werken referenties? | `packages/assessment-core/src/composables/useReferences.ts` |
| Hoe werken berekeningen? | `packages/assessment-core/src/stores/calculations.ts` |
| Hoe zien de vragen eruit? | `docs/questions/questions_AIIA.md` |
| Wat is er eerder besloten? | `docs/pdr/` |
| Hoe draai ik de applicatie? | `README.md`, en deel 3 hierboven |
| Wat mag de AI-plugin wel en niet? | `docs/ai-assistent/verantwoording.md` |
| Wat zijn de afspraken in deze repo? | `.claude/CLAUDE.md` en `CONTRIBUTING.md` |
| Hoe werkt git ook alweer? | [`handleiding-git.md`](handleiding-git.md) |
