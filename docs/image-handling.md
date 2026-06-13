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
| PNG                 | Lossless WebP (kleiner dan PNG, geen kwaliteitsverlies) |
| JPEG                | Lossy WebP (quality 0.85)                               |
| WebP                | Opnieuw gecomprimeerd via canvas (stript metadata)      |
| GIF                 | Lossless WebP (alleen eerste frame)                     |
| SVG                 | Gerasterd op 2x resolutie, lossless WebP                |
| Overig (PDF, etc.)  | Geweigerd met foutmelding                               |

## Resize-strategie

Afbeeldingen worden verkleind tot binnen configureerbare maximale afmetingen (standaard: 1200x900 pixels).

Alle afbeeldingen worden opgeslagen als WebP voor optimale bestandsgrootte. WebP is ~25-30% kleiner dan JPEG bij vergelijkbare kwaliteit, en ~25-35% kleiner dan PNG voor lossless compressie ([bron: Google Developers](https://developers.google.com/speed/webp/docs/webp_study)).

1. **Foto's (JPEG)**: Lossy WebP (quality 0.85) — efficiënt voor fotografisch materiaal
2. **Diagrammen (PNG, SVG, WebP, GIF)**: Lossless WebP (quality 1.0) eerst — scherpe lijnen en tekst zonder artefacten
3. **SVG**: Gerasterd op 2x resolutie voor scherpe tekst, opgeslagen als lossless WebP
4. **Te groot na lossless**: Automatische fallback naar lossy WebP met afnemende quality (0.85 → 0.45)
5. **Maximale grootte**: 2 MB base64 (configureerbaar). Afbeeldingen die na alle compressie groter zijn worden geweigerd.

### PDF-compatibiliteit

pdfmake ondersteunt alleen JPEG en PNG. Bij PDF-export worden WebP afbeeldingen automatisch on-the-fly geconverteerd naar PNG via de Canvas API. De originele WebP data in de assessment-state wordt niet gewijzigd.

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

Afbeeldingen worden buiten tabellen gerenderd. De base64 data staat als referentie onderaan het document zodat de tekst leesbaar blijft:

```markdown
**Titel**

![Titel][img-1]

*Omschrijving*

*Bron: Bronvermelding*

...rest van document...

[img-1]: data:image/webp;base64,...
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
