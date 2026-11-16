# 0011: Overlap tussen de formulieren: wat gekoppeld is en hoe het werkt

Datum: 2026-11-16

## Status

Voorgesteld

## Besluit

Overlap tussen de pre-scan, de DPIA, het IAMA en de AIIA leggen we vast als `references` in de YAML-bronnen (`sources/*.yaml`). Een koppeling bestaat alleen als die daar staat. De engine leest de koppelingen en bepaalt aan de hand van het type of een antwoord wordt overgenomen, als context wordt getoond of als suggestie wordt aangeboden.

Dit PDR legt vast welke overlap al gekoppeld is, welke nog niet, en hoe de koppelingen werken. Werk het bij zodra er koppelingen bijkomen of vervallen.

## Achtergrond

De vier instrumenten overlappen bewust (zie `docs/onboarding/handleiding-project.md`). Wie een AI-systeem bouwt dat persoonsgegevens verwerkt, vult in de praktijk alle vier in en beantwoordt deels dezelfde vragen. Koppelingen voorkomen dat een antwoord twee keer getypt moet worden.

De code ondersteunt koppelingen tussen elk paar formulieren. Welke koppelingen er werkelijk zijn, was tot nu toe alleen af te lezen uit de YAML-bestanden. Deel 7 van `docs/onboarding/handleiding-schema.md` legt uit hoe een koppeling werkt, en bijlage A telt per formulier de taken met `references`. Waarheen ze verwijzen en welke paren ontbreken, staat nergens.

## Overweging

- Een koppeling hoort inhoudelijk te kloppen. De inhoud van de formulieren ligt bij de inhoudelijk eigenaren (PAR voor pre-scan en DPIA, BZK voor het IAMA, I&W voor de AIIA). Nieuwe koppelingen tussen formulieren van verschillende eigenaren vragen afstemming met beide.
- Een overzicht dat los van de YAML wordt bijgehouden, kan verouderen. De tabellen hieronder zijn daarom gegenereerd uit de YAML-bronnen op de datum van dit PDR.

## Details

### Stand per formulierpaar

| Van → naar | Gekoppeld | Aantal |
|---|---|---|
| Pre-scan → DPIA | Ja | 20 |
| IAMA → IAMA (binnen het eigen formulier) | Ja | 13 |
| Pre-scan → IAMA | Nee | 0 |
| Pre-scan → AIIA | Nee | 0 |
| DPIA → IAMA | Nee | 0 |
| DPIA → AIIA | Nee | 0 |
| IAMA → DPIA | Nee | 0 |
| IAMA → AIIA | Nee | 0 |
| AIIA → DPIA of IAMA | Nee | 0 |

De pre-scan kent daarnaast 32 keer de sleutel `prescanModelId`. Dat is geen koppeling, maar het nummer van de vraag in het Rijksmodel DPIA.

### Hoe een koppeling werkt

Een koppeling staat bij de **bronvraag** en noemt het formulier en de vraag waar het antwoord naartoe gaat:

```yaml
- task: Doel gegevensverwerking
  id: "0.3"
  references:
    DPIA:
      - id: "5.1.1"
        type: one-to-many
```

De sleutel (`DPIA`, `IAMA`, `AIIA`) is het **doelformulier**. De pre-scan is nooit een doel. Het type bepaalt wat de gebruiker in het doelformulier ziet:

| Type | Wat de gebruiker ziet | Waar |
|---|---|---|
| `pre-fill`, `one-to-one`, `one-to-many` | Het doelveld wordt vooraf ingevuld met het bronantwoord, zolang het doelveld nog leeg is | In het veld zelf (`FormField.vue`) |
| `pre-view`, `many-to-many` uit een **ander** formulier | Het bronantwoord staat als context bovenaan de sectie, gegroepeerd per bronformulier | Blok "Informatie uit …" (`PreScanPreview.vue`) |
| `pre-view`, `many-to-many` binnen **hetzelfde** formulier | Een suggestie bij de doelvraag; bij een open tekstveld met de knop "Neem antwoord over" | `ReferenceSuggestions.vue` |

Het schema accepteert ook `direct takeover` en `many-to-one`, maar de engine doet daar niets mee. Een koppeling zonder type wordt alleen vastgelegd. Bij een herhaalbare bronvraag gebruikt de engine het antwoord van de eerste herhaling. De logica staat in `packages/assessment-core/src/composables/useReferences.ts`.

### Waar de antwoorden van het bronformulier vandaan komen

Een koppeling werkt alleen als de antwoorden van het bronformulier geladen zijn. Dat verschilt per app:

- **Boekhouding (met backend), DPIA:** de DPIA bewaart een kopie van de pre-scan-antwoorden in `_prescanAnswers`. Die kopie ontstaat als de DPIA wordt aangemaakt vanuit een pre-scan in het project, of door een pre-scanbestand te importeren. Latere wijzigingen in de pre-scan komen niet automatisch in de DPIA.
- **Boekhouding, andere formulieren:** `loadSourceForms` (`apps/boekhouding-frontend/src/utils/sourceForms.ts`) laadt bij het openen de antwoorden van de andere assessments in hetzelfde project, steeds de meest recent bijgewerkte per type. Het laadt alleen formulieren die een koppeling naar het geopende formulier hebben. Omdat die koppelingen nog niet bestaan (zie de tabel), laadt het nu niets.
- **Standalone:** de app laadt bij het openen alleen het opgeslagen formulier zelf. Antwoorden uit een ander formulier zijn beschikbaar als dat formulier in dezelfde sessie is geopend.
- **Binnen hetzelfde formulier** zijn de antwoorden altijd beschikbaar.

### Gekoppeld: pre-scan → DPIA

| Bron | Bronvraag | Doel | Doelvraag | Type |
|---|---|---|---|---|
| 0.2 | Beschrijving van de verwerking | DPIA 1.1 | Voorstel | `one-to-one` |
| 0.3 | Doel gegevensverwerking | DPIA 5.1.1 | Verwerkingsdoeleinde | `one-to-many` |
| 0.4 | Wat is de grondslag voor de verwerking? | DPIA 11.1.1.1 | Rechtsgrond | `pre-fill` |
| 0.5.2 | Selecteer een of meer van onderstaande opties | DPIA 4 | Technieken en methoden van de gegevensverwerkingen | `pre-view` |
| 0.5.3 | Welke vorm van cloud betreft het? | DPIA 4 | Technieken en methoden van de gegevensverwerkingen | `pre-view` |
| 0.5.4 | Gaat het om materieel public cloudgebruik voor de primaire taak? | DPIA 4 | Technieken en methoden van de gegevensverwerkingen | `pre-view` |
| 1.1.2 | Gaat het systeem een van onderstaande gewone persoonsgegevens verwe… | DPIA 2.1.3 | Categorie persoonsgegevens | `pre-view` |
| 1.1.3 | Specificeer | DPIA 2.1.3 | Categorie persoonsgegevens | `pre-view` |
| 1.2.1 | Gaat het systeem bijzondere persoonsgegevens verwerken? | DPIA 12.1.1 | Bijzondere persoonsgegevens | `pre-fill` |
| 1.2.2 | Gaat het systeem een van onderstaande bijzondere persoonsgegevens v… | DPIA 2.1.3 | Categorie persoonsgegevens | `pre-view` |
| 1.2.2 | Gaat het systeem een van onderstaande bijzondere persoonsgegevens v… | DPIA 12.1.2.4 | Type bijzondere persoonsgegevens | `pre-fill` |
| 1.3.2 | Gaat het systeem een van onderstaande gevoelige persoonsgegevens ve… | DPIA 2.1.3 | Categorie persoonsgegevens | `pre-view` |
| 1.4.1 | Welke categorieën betrokkene kun je onderscheiden? | DPIA 2.1.2 | Categorie betrokkene | `pre-view` |
| 1.4.2 | Specificeer | DPIA 2.1.2 | Categorie betrokkene | `pre-view` |
| 1.5.4 | Wat is de bewaartermijn van de gegevens? | DPIA 10.1.1.4 | Bewaartermijn/archiveringsperiode | `pre-fill` |
| 2.1.2 | Waar is het hoofdkantoor van de cloudprovider gevestigd? | DPIA 8.1.1.1 | Verwerkingslocatie | `pre-fill` |
| 2.1.6 | Mechanisme(s) voor doorgifte | DPIA 8.1.1.2 | Doorgiftemechanisme | `pre-fill` |
| 3.1 | Welke groepen betrokkenen kun je onderscheiden? | DPIA 16.1.1 | Beschrijving van het risico | `many-to-many` |
| 4.1 | Welke categorieën betrokkenen kun je onderscheiden? | DPIA 16.1.1 | Beschrijving van het risico | `many-to-many` |
| 6.1.1 | Wordt er gebruik gemaakt van een algoritme? | DPIA 4 | Technieken en methoden van de gegevensverwerkingen | `pre-view` |

### Gekoppeld: IAMA → IAMA

Deze koppelingen staan binnen het IAMA zelf. Ze volgen de verwijzingen in het IAMA v2-document (zie ook PDR [0009](0009-IAMA-afwijkingen-invulhulp-ten-opzichte-van-iama-v2.md) voor 3.5.2 en 3.5.3) en verschijnen als suggestie bij de doelvraag.

| Bron | Bronvraag | Doel | Doelvraag | Type |
|---|---|---|---|---|
| 1.1.2 | Wat is het doel dat bereikt dient te worden met de inzet van het al… | IAMA 4.4.1 | Kijk nog een keer naar de doelen zoals die bij vraag 1.1.2 zijn gef… | `pre-view` |
| 1.1.2 | Wat is het doel dat bereikt dient te worden met de inzet van het al… | IAMA 4.5.1 | Zouden de bij vraag 1.1.2 geformuleerde doelen ook kunnen worden be… | `pre-view` |
| 1.1.2 | Wat is het doel dat bereikt dient te worden met de inzet van het al… | IAMA 5.A.1 | Gediende belangen | `pre-view` |
| 1.1.2 | Wat is het doel dat bereikt dient te worden met de inzet van het al… | IAMA 2.1.2 | Welke alternatieven zijn er? Waarom is dit type algoritme het meest… | `pre-view` |
| 1.2.1 | Wat zijn de publieke waarden die mogelijk positief geraakt worden d… | IAMA 3.5.3 | Welke positieve effecten introduceert de inzet van het algoritme vo… | `pre-view` |
| 1.2.1 | Wat zijn de publieke waarden die mogelijk positief geraakt worden d… | IAMA 5.A.1 | Gediende belangen | `pre-view` |
| 1.2.2 | Wat zijn de publieke waarden die mogelijk negatief geraakt worden d… | IAMA 3.5.2 | Welke risico's of nadelige effecten introduceert de inzet van het a… | `pre-view` |
| 3.5.2 | Welke risico's of nadelige effecten introduceert de inzet van het a… | IAMA 5.A.2 | Geschade belangen | `pre-view` |
| 3.5.6 | Zou de inzet van dit (soort) algoritme(s) kunnen leiden tot ongewen… | IAMA 5.A.2 | Geschade belangen | `pre-view` |
| 4.1.3 | Op welke (aspecten van) grondrechten zal het algoritme realistisch… | IAMA 5.A.1 | Gediende belangen | `pre-view` |
| 4.3.3 | Hoe 'ernstig' is de verwachte inbreuk op het grondrecht als de antw… | IAMA 5.A.2 | Geschade belangen | `pre-view` |
| 4.4.1 | Kijk nog een keer naar de doelen zoals die bij vraag 1.1.2 zijn gef… | IAMA 5.A.5 | Waarschijnlijkheid van belangen | `pre-view` |
| 4.5.1 | Zouden de bij vraag 1.1.2 geformuleerde doelen ook kunnen worden be… | IAMA 5.A.6 | Noodzakelijkheid van de inzet | `pre-view` |

### Nog niet gekoppeld

Voor de overige paren is nog geen overlapanalyse in de YAML vastgelegd. De AIIA verwijst in vraag 8.6 inhoudelijk wel naar andere instrumenten ("We proberen de overlap met andere assessments zoveel mogelijk te voorkomen"), maar zonder koppelingen op vraagniveau.

Een nieuwe koppeling toevoegen:

1. Bepaal per bronvraag welke doelvraag hetzelfde vraagt, en of het antwoord kan worden overgenomen (`pre-fill`) of alleen als context dient (`pre-view`). Stem dit af met de inhoudelijk eigenaren van beide formulieren.
2. Zet de koppeling bij de bronvraag in `sources/<bron>.yaml`, onder de sleutel van het doelformulier.
3. Draai `script/generate_sources.sh` en controleer het resultaat in beide apps.
4. Werk dit PDR bij.

## Impact

- **Gebruikers:** zien alleen overgenomen antwoorden of context voor de gekoppelde paren hierboven.
- **Ontwikkelteam:** heeft één plek om na te gaan welke overlap er is. Nieuwe koppelingen vragen geen codewijziging, alleen YAML.
- **Inhoudelijk eigenaren:** beslissen over nieuwe koppelingen tussen hun formulieren.

## Alternatieven

- **Alleen de YAML als bron, zonder overzicht.** Niet gekozen: om te zien welke overlap er is, moet dan elk bestand worden doorzocht, en ontbrekende paren vallen niet op.
- **Een losse overlapanalyse (bijvoorbeeld een spreadsheet) als bron.** Niet gekozen: de engine leest alleen de YAML. Een analyse buiten de repo is wel bruikbaar als voorbereiding op stap 1 hierboven.
