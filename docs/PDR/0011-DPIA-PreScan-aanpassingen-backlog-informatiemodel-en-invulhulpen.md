# 0011: Aanpassingen DPIA, pre-scan en projecten uit de backlog informatiemodel en invulhulpen

Datum: 2026-10-29

## Status

Voorgesteld

## Besluit

Op basis van de backlog "informatiemodel en invulhulpen" passen we de invulhulpen op vijf punten aan:

1. DPIA-vraag 2.1.6 heet **Bron persoonsgegevens** in plaats van "Bron betrokkenen". De vraag luidt: "Zijn de persoonsgegevens via een derde partij gekomen?"
2. De pre-scan krijgt een colofon. De onderdelen 19 en 20 van de DPIA worden overgenomen als onderdeel 8 en 9 van de pre-scan.
3. Bij het inladen van een bestand staat dat alleen een PDF- of JSON-bestand kan worden ingeladen dat in deze invulhulp is geëxporteerd.
4. In het formulier zonder account neemt een formulier geen antwoorden meer over uit een ander formulier dat in dezelfde sessie is ingevuld. Wie de pre-scan wil meenemen in de DPIA, laadt het geëxporteerde pre-scan-bestand in bij de start van de DPIA.
5. Elk lid van een project ziet wie er lid is en met welke rol. Alleen eigenaren kunnen leden beheren.

## Achtergrond

**Bron persoonsgegevens (2.1.6).** De titel "Bron betrokkenen" paste niet bij de vraag. Het veld gaat over de herkomst van de persoonsgegevens, niet over de betrokkenen. De term "Bron persoonsgegevens" staat al in het begrippenkader (`bron_persoonsgegevens`). Met de nieuwe titel toont de invulhulp ook de definitie uit het begrippenkader.

**Colofon pre-scan.** De DPIA heeft een colofon (onderdeel 19: versie, status, dossier, documentbeheerder en advies FG) en een onderdeel voor vaststelling en ondertekening (onderdeel 20). De pre-scan had dat niet. Daardoor was een pre-scan niet als formeel document vast te leggen en te ondertekenen.

**Importtekst.** Gebruikers probeerden pre-scans, DPIA's en IAMA's uit andere hulpmiddelen in te laden. Dat kan niet: de invulhulp leest alleen haar eigen export. De uploadtekst zei dat niet.

**Formulier zonder account.** Na het invullen van een pre-scan bleven de antwoorden in het geheugen van de browser staan. Een daarna gestarte DPIA nam ze over, ook na "Start nieuwe DPIA". Tussen DPIA en IAMA gebeurde hetzelfde. Een gebruiker kon niet zien waar die antwoorden vandaan kwamen. Ook kwam een ingeladen pre-scan-bestand op DPIA-vragen met hetzelfde nummer terecht, terwijl die vragen over iets anders gaan.

**Ledenlijst.** De API gaf de ledenlijst al aan elk lid, maar de knop ernaartoe stond alleen bij eigenaren. Bewerkers en lezers konden niet zien met wie zij samenwerkten.

## Overweging

- Titels en vragen volgen de termen uit het begrippenkader, zodat de invulhulp en het informatiemodel dezelfde taal spreken.
- De pre-scan en de DPIA leggen hun administratieve gegevens op dezelfde manier vast, zodat een gebruiker niet twee werkwijzen hoeft te kennen.
- Een gebruiker moet kunnen zien waar een vooraf ingevuld antwoord vandaan komt. Een overname die alleen in het geheugen van de browser bestaat, voldoet daar niet aan. Een ingeladen bestand wel: de gebruiker kiest het zelf.
- Het formulier zonder account gedraagt zich bij het meenemen van een pre-scan zoveel mogelijk als de projectomgeving.
- Wie in een project werkt, mag weten wie er nog meer toegang heeft. Beheer blijft bij de eigenaar.

## Details

**1. DPIA 2.1.6.** In `sources/dpia.yaml` wijzigen titel en omschrijving van vraag 2.1.6. Het ID en de antwoordopties blijven gelijk.

**2. Colofon pre-scan.** In `sources/prescan.yaml` komen twee onderdelen bij, met dezelfde velden als DPIA 19 en 20:

| Onderdeel pre-scan | Overgenomen uit DPIA | Inhoud |
|---|---|---|
| 8. Versie, Status, Dossier, Documentbeheerder en Advies FG | 19 | versie, status, dossier, documentbeheerder, advies FG |
| 9. Vaststelling en ondertekening | 20 | vaststelling en ondertekening door de verwerkingsverantwoordelijke(n) |

Waar de DPIA zichzelf noemt, staat in de pre-scan "pre-scan". De automatisch toegevoegde resultaatpagina van de pre-scan schuift daardoor van nummer 8 naar 10.

**3. Importtekst.** De uploadtekst en de importopties in een project vermelden dat alleen een in deze invulhulp geëxporteerd PDF- of JSON-bestand kan worden ingeladen.

**4. Formulier zonder account.** Bij het openen van een formulier worden de antwoorden van de andere formulieren uit het geheugen gewist. Het formulier laadt zijn eigen antwoorden opnieuw uit de browseropslag. "Start nieuwe …" wist ook het formulier zelf. Een pre-scan-bestand dat bij de start van een DPIA wordt ingeladen, wordt als bron gebruikt en vult de DPIA vooraf in, zoals `_prescanAnswers` in de projectomgeving.

**5. Ledenlijst.** De knop "Leden" staat bij iedereen in het project. Niet-eigenaren zien de lijst alleen-lezen. De rol wordt los van de ledenlijst geladen en na een rolwijziging opnieuw gelezen.

## Impact

- Gebruikers: de titel van 2.1.6 wijzigt, de pre-scan heeft twee onderdelen meer en kan worden vastgesteld en ondertekend, en het formulier zonder account neemt alleen nog over wat de gebruiker zelf inlaadt. Iedereen in een project ziet de ledenlijst.
- Datamodel: nieuwe vraag-ID's 8 en 9 (met onderliggende vragen) in de pre-scan. De ID's en antwoorden van de DPIA veranderen niet.
- Bestaande pre-scans: wie bij het hervatten op de resultaatpagina stond, komt uit op het eerste colofononderdeel, twee stappen ervoor. Een voltooiing van nummer 8 kan niet zijn opgeslagen, omdat de resultaatpagina geen vinkje "Markeer als voltooid" heeft.
- Export: de nieuwe onderdelen komen mee in de PDF- en JSON-export. De PDF zet het colofon van de pre-scan nog als gewone onderdelen achteraan. Bij de DPIA staat het colofon apart.
- Ontwikkelteam: bij een wijziging van DPIA 19 of 20 ook pre-scan 8 en 9 bijwerken.

## Alternatieven

1. **De titel "Bron betrokkenen" houden en alleen de vraag aanpassen.** Niet gekozen: de titel zou dan blijven afwijken van het begrippenkader, en de definitie zou niet zichtbaar worden.
2. **Pre-scan-antwoorden in het formulier zonder account automatisch blijven overnemen, met een melding.** Niet gekozen: de antwoorden staan alleen in het geheugen van de browser en verdwijnen bij herladen. Een ingeladen bestand is controleerbaar en werkt na herladen nog.
3. **Het colofon van de pre-scan los van de DPIA ontwerpen.** Niet gekozen: twee verschillende colofons vragen van gebruikers en beheerders twee werkwijzen voor hetzelfde doel.

## Open punt

De vraag bij 2.1.6 spreekt van een "derde partij". De definitie van Bron persoonsgegevens in het begrippenkader spreekt van een "betrokken partij". In het begrippenkader is "derde" een smallere term dan "betrokken partij": een derde is onder meer geen verwerker of verwerkingsverantwoordelijke. Vraag en definitie moeten op elkaar worden afgestemd.
