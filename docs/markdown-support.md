# Markdown in open tekstvelden

## Overzicht

Open tekstvelden (`open_text` type) ondersteunen markdown-opmaak via [marked](https://marked.js.org/). Gebruikers schakelen tussen een bewerkbare textarea en een opgemaakte leesweergave via een toggle-button ("Lezen" / "Bewerken") naast het label van het veld.

Markdown-opmaak wordt op twee manieren verwerkt:

- **HTML-preview** in de browser via `renderMarkdownToHtml()` — voor de leesweergave in het formulier
- **PDF-export** via `markdownToPdfContent()` — zet markdown om naar pdfmake Content-objecten

Beide functies staan in `packages/assessment-core/src/utils/markdown.ts` en worden geëxporteerd via de core package.

## Ondersteunde opmaak

| Markdown | Voorbeeld | HTML-preview | PDF-export |
|----------|-----------|:---:|:---:|
| Paragrafen | Tekst met lege regel ertussen | ✅ | ✅ |
| **Vet** | `**vet**` | ✅ | ✅ |
| *Cursief* | `*cursief*` | ✅ | ✅ |
| ~~Doorgehaald~~ | `~~doorgehaald~~` | ✅ | Als platte tekst |
| Kopjes | `## Kop 2` | ✅ | ✅ |
| Ongeordende lijsten | `- item` | ✅ | ✅ |
| Geordende lijsten | `1. item` | ✅ | ✅ |
| Task lists | `- [x] klaar` | ✅ (unicode ☑/☐) | Niet ondersteund |
| Links | `[tekst](url)` | ✅ (nieuw tabblad) | ✅ (klikbaar) |
| Code (inline) | `` `code` `` | ✅ | ✅ (grijze achtergrond) |
| Code (blok) | ` ``` code ``` ` | ✅ | ✅ (grijze achtergrond) |
| Blockquotes | `> citaat` | ✅ | ✅ (grijze achtergrond) |
| Horizontale lijn | `---` | ✅ | ✅ |
| Tabellen | GFM tabel-syntax | ✅ (via default renderer) | Niet ondersteund |
| Afbeeldingen | `![alt](url)` | Gestript | Gestript |

## Beveiliging

De markdown-renderer gebruikt een **allowlist-aanpak**: een custom renderer op de `Marked` instantie bepaalt welke HTML-tags geproduceerd worden. Alleen veilige tags worden gegenereerd. Er is geen post-processing sanitizer (zoals DOMPurify) nodig, omdat onveilige output in deze opzet nooit geproduceerd wordt.

### Maatregelen

**1. Raw HTML wordt gestript**

Alle HTML-tags in de invoer worden genegeerd. De `html()` renderer retourneert een lege string:

```markdown
Invoer:  <script>alert('xss')</script>
Output:  (niets)
```

**2. Afbeeldingen worden gestript**

Zowel HTML `<img>` tags als markdown `![alt](url)` afbeeldingen worden verwijderd. Dit is een beveiligingsmaatregel om te voorkomen dat externe afbeeldingen geladen worden die tracking-pixels of andere payloads bevatten.

**3. Link-protocollen zijn beperkt tot een allowlist**

Alleen `https:`, `http:` en `mailto:` links zijn toegestaan. Alle andere protocollen (waaronder `javascript:`, `data:`, `vbscript:`) worden gestript — de link-tekst blijft zichtbaar, maar de `<a>` tag wordt niet gerenderd. Dit geldt zowel voor de HTML-preview als de PDF-export.

```markdown
Invoer:  [klik hier](javascript:alert(1))
Output:  klik hier              (geen link)

Invoer:  [website](https://example.com)
Output:  <a href="https://example.com" ...>website</a>
```

**4. Links openen in een nieuw tabblad**

Alle links krijgen `target="_blank"` en `rel="noopener noreferrer"` om tab-napping te voorkomen.

**5. Task list checkboxes zijn geen interactieve elementen**

GFM task lists produceren standaard `<input type="checkbox">` elementen. De renderer vervangt deze door unicode tekens (☐ en ☑) om ongewenste interactie in de preview te voorkomen.

## Bekende beperkingen

- **Tabellen** verschijnen in de HTML-preview (GFM is standaard ingeschakeld in marked) maar worden niet omgezet naar PDF-tabellen — ze vallen terug op platte tekst
- **Afbeeldingen** worden bewust gestript als beveiligingsmaatregel
- **Unicode checkboxes** (☐ vs ☑) renderen op macOS in subtiel verschillende stijlen doordat ☑ door het systeem als emoji-karakter behandeld wordt
