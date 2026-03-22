# Afbeeldingen

## Overzicht

Het `image` veldtype maakt het mogelijk om afbeeldingen direct in een assessment te uploaden. Afbeeldingen worden opgeslagen als base64 data-URI's binnen de JSON assessment-state, waardoor exports (JSON, PDF, Markdown) volledig zelfstandig zijn zonder externe opslag.

## Privacy: metadata verwijderen

Geüploade afbeeldingen kunnen EXIF-metadata bevatten met privacygevoelige informatie:

- **GPS-coördinaten** van waar de foto is gemaakt
- **Naam van de auteur** en copyrightinformatie
- **Cameramodel** en serienummer
- **Datum en tijd** van de opname
- **Miniaturen** van de originele (mogelijk niet-bijgesneden) afbeelding

Alle geüploade afbeeldingen worden verwerkt via de [Canvas API](https://developer.mozilla.org/en-US/docs/Web/API/Canvas_API) voordat ze worden opgeslagen. Het tekenen van een afbeelding op een `<canvas>` en exporteren via [`toDataURL()`](https://developer.mozilla.org/en-US/docs/Web/API/HTMLCanvasElement/toDataURL) levert een schone rasterafbeelding op die alleen pixeldata bevat. Alle EXIF-, IPTC- en XMP-metadata wordt automatisch verwijderd. Dit is standaard browsergedrag — de canvas-export bevat uitsluitend pixeldata.

Er is geen doorgeefpad voor kleine afbeeldingen. Elke upload gaat door de canvas-pipeline om metadata-verwijdering te garanderen.

## Opslagformaat

Een afbeelding-antwoord wordt opgeslagen als een `ImageValue` object:

```json
{
  "data": "data:image/png;base64,iVBORw0KGgo...",
  "title": "Architectuurdiagram",
  "description": "Overzicht van datastromen tussen systemen",
  "source": "Projectplan v3, SharePoint"
}
```

| Veld          | Verplicht | Beschrijving                                                   |
|---------------|-----------|----------------------------------------------------------------|
| `data`        | Ja        | Base64 data-URI van de afbeelding                              |
| `title`       | Nee       | Onderschrift, ook gebruikt als alt-tekst voor toegankelijkheid  |
| `description` | Nee       | Toelichting bij de afbeelding                                  |
| `source`      | Nee       | Bronvermelding (URL, documentreferentie of vrije tekst)        |

De `ImageValue` wordt opgeslagen als de `value` eigenschap van een `Answer`, naast `lastEditedAt`.

## Ondersteunde formaten

| Formaat             | Verwerking                                            |
|---------------------|-------------------------------------------------------|
| PNG                 | Blijft PNG (lossless, behoudt transparantie)          |
| JPEG                | Blijft JPEG (quality 0.85)                            |
| WebP                | Geconverteerd via canvas                              |
| GIF                 | Geconverteerd via canvas (alleen eerste frame)         |
| SVG                 | Gerasterd naar PNG op 2x resolutie voor scherpe tekst |
| Overig (PDF, etc.)  | Geweigerd met foutmelding                             |

## Resize-strategie

Afbeeldingen worden verkleind tot binnen configureerbare maximale afmetingen (standaard: 1200x900 pixels).

1. **SVG**: Gerasterd naar PNG op 2x resolutie, daarna passend binnen maximale afmetingen
2. **Binnen limieten**: Toch verwerkt via canvas (voor metadata-verwijdering), uitvoer in oorspronkelijk formaat
3. **Verkleining nodig**: Verkleind met behoud van beeldverhouding, formaat behouden (PNG blijft PNG, JPEG blijft JPEG)
4. **Nog steeds te groot**: PNG valt terug naar JPEG; JPEG-kwaliteit wordt stapsgewijs verlaagd (minimaal 0.5)
5. **Maximale grootte**: 2 MB base64 (configureerbaar). Afbeeldingen die na alle compressie groter zijn worden geweigerd.

## SVG-beveiliging

SVG-bestanden kunnen `<script>`-tags, event handlers (`onload`, `onclick`) en `<foreignObject>`-elementen bevatten die XSS-risico's vormen. In plaats van SVG's te sanitizen (complex en foutgevoelig), rasteren we ze naar PNG via canvas. De SVG wordt geladen in een `<img>`-element (dat scripts sandboxt), getekend op een canvas op 2x resolutie voor scherpe tekstweergave, en geëxporteerd als PNG. Er wordt geen SVG-data opgeslagen.

## Migratie van bestaande data

Vóór het `image` veldtype was taak 1.2.1 een `text_input` waarin gebruikers een URL-referentie invoerden. Bij het importeren van oude assessment-data:

1. Het `ImageField`-component detecteert platte string-waarden (geen `ImageValue`-objecten)
2. Als de string een geldige URL is (`http://` of `https://`): weergegeven als klikbare referentielink
3. Als de string geen URL is: weergegeven als platte tekst
4. Wanneer de gebruiker een nieuwe afbeelding uploadt, wordt een geldige URL overgenomen als `source`-veld
5. Er vindt geen automatische migratie of datatransformatie plaats op importniveau

## Exportformaten

### JSON

Afbeeldingen worden opgenomen als `ImageValue`-object in de assessment-state. Het formaat is zelfstandig.

### PDF (pdfmake)

Afbeeldingen worden als losse blokken gerenderd (niet in tabelcellen) met:

- Titel als vetgedrukte tekst (indien aanwezig)
- Afbeelding passend binnen de volledige contentbreedte (455pt op A4), met behoud van beeldverhouding
- Omschrijving als cursieve tekst (indien aanwezig)
- Bron als kleine cursieve tekst (indien aanwezig)

### Markdown

Afbeeldingen worden buiten tabellen gerenderd (base64 in tabelcellen breekt de opmaak):

```markdown
**Titel**

![Titel](data:image/png;base64,...)

*Omschrijving*

*Bron: Bronvermelding*
```

## Schema

Het `imageValue`-type is gedefinieerd in `schemas/assessment-output.v2.schema.json`:

```json
{
  "imageValue": {
    "type": "object",
    "properties": {
      "data": { "type": "string", "pattern": "^data:image/" },
      "title": { "type": "string" },
      "description": { "type": "string" },
      "source": { "type": "string" }
    },
    "required": ["data"],
    "additionalProperties": false
  }
}
```

Het `image` taaktype is gedefinieerd in `schemas/assessment-definition.v2.schema.json`.

## Overwegingen qua grootte

- Een typische verkleinde afbeelding is 100-300 KB als base64
- De API body-limiet is 25 MB (ruim voldoende voor assessments met veel afbeeldingen)
- Het standalone formulier gebruikt localStorage (5-10 MB limiet in de meeste browsers, afhankelijk van de browser)
- Voor de multi-user backend worden afbeeldingen opgeslagen in de `cachedState` JSONB-kolom en in `assessment_edits` voor versiegeschiedenis
