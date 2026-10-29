# 0011: Aanpassingen DPIA, pre-scan en projecten uit de backlog informatiemodel en invulhulpen

Datum: 2026-10-29

## Status

Voorgesteld

## Besluit

Op basis van de backlog "informatiemodel en invulhulpen" passen we de invulhulpen op zes punten aan:

1. DPIA-vraag 2.1.6 heet **Bron persoonsgegevens** in plaats van "Bron betrokkenen". De vraag luidt: "Zijn de persoonsgegevens via een derde partij gekomen?"
2. De pre-scan krijgt een colofon. De onderdelen 19 en 20 van de DPIA worden overgenomen als onderdeel 8 en 9 van de pre-scan.
3. Bij het inladen van een bestand staat dat alleen een PDF- of JSON-bestand kan worden ingeladen dat in deze invulhulp is geëxporteerd.
4. In het formulier zonder account neemt een formulier geen antwoorden meer over uit een ander formulier dat in dezelfde sessie is ingevuld. Wie de pre-scan wil meenemen in de DPIA, laadt het geëxporteerde pre-scan-bestand in bij de start van de DPIA.
5. Elk lid van een project ziet wie er lid is en met welke rol. Alleen eigenaren kunnen leden beheren.
6. De tekstvoorstellen uit de backlog voor de pre-scan, de startpagina, "Over Invulhulpen" en de privacyverklaring nemen we over. We corrigeren alleen de spelling en het klachtadres.

## Achtergrond

**Bron persoonsgegevens (2.1.6).** De titel "Bron betrokkenen" paste niet bij de vraag. Het veld gaat over de herkomst van de persoonsgegevens, niet over de betrokkenen. De term "Bron persoonsgegevens" staat al in het begrippenkader (`bron_persoonsgegevens`). Met de nieuwe titel toont de invulhulp ook de definitie uit het begrippenkader.

**Colofon pre-scan.** De DPIA heeft een colofon (onderdeel 19: versie, status, dossier, documentbeheerder en advies FG) en een onderdeel voor vaststelling en ondertekening (onderdeel 20). De pre-scan had dat niet. Daardoor was een pre-scan niet als formeel document vast te leggen en te ondertekenen.

**Importtekst.** Gebruikers probeerden pre-scans, DPIA's en IAMA's uit andere hulpmiddelen in te laden. Dat kan niet: de invulhulp leest alleen haar eigen export. De uploadtekst zei dat niet.

**Formulier zonder account.** Na het invullen van een pre-scan bleven de antwoorden in het geheugen van de browser staan. Een daarna gestarte DPIA nam ze over, ook na "Start nieuwe DPIA". Tussen DPIA en IAMA gebeurde hetzelfde. Een gebruiker kon niet zien waar die antwoorden vandaan kwamen. Ook kwam een ingeladen pre-scan-bestand op DPIA-vragen met hetzelfde nummer terecht, terwijl die vragen over iets anders gaan.

**Tekstvoorstellen.** De backlog bevat voor een aantal plekken een uitgeschreven tekstvoorstel. Die teksten zijn inhoudelijk afgestemd. Door ze letterlijk over te nemen, blijft de tekst in de invulhulp gelijk aan wat is afgesproken.

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

**6. Tekstvoorstellen.** De volgende teksten zijn overgenomen zoals voorgesteld, met de correcties die onder de tabel staan:

| Plek | Tekst |
|---|---|
| Pre-scan, inleiding (eerste blok) | "Met behulp van de Pre-scan DPIA beoordeelt een organisatie of er mogelijke hoge risico's bestaan voor de rechten en vrijheden van betrokkenen, zoals beschreven in de AVG. Indien de beoogde verwerking een hoog risico kent voor de rechten en de vrijheden van de betrokkenen, dan is de organisatie verplicht een DPIA uit te voeren. Ook kunnen er organisatiespecifieke afspraken zijn voor het uitvoeren van een DPIA." |
| Pre-scan, inleiding (laatste zin eerste blok) | "Ingevulde gegevens kunnen ook worden gebruikt (indien van toepassing) voor het verwerkingsregister, register van cloudactiviteiten etc. Ook in die gevallen dat er geen DPIA nodig is geeft dit herbruikbare informatie." |
| Pre-scan, inleiding (producten) | "Aan de hand van de Pre-scan DPIA wordt beoordeeld of een volledige DPIA nodig is, een DTIA (Data Transfer Impact Assessment), een Impact Assessment Mensenrechten en Algoritmes (IAMA), etc." |
| Pre-scan 0.4, grondslag | "Om persoonsgegevens te mogen verwerken is altijd een grondslag nodig. Ook als je geen DPIA hoeft te doen. Mocht je de grondslag (nog) niet weten, neem dan (alvast) contact op met de privacyprofessional van je organisatie. De grondslag kan gebruikt worden voor paragraaf 11 van het Model DPIA Rijksdienst." |
| Pre-scan 0.5.2, bij cloudgebruik "Ja" | "Omdat er een cloudoplossing wordt gebruikt moet er, overeenkomstig het cloudbeleid, ook contact worden opgenomen met CIO en CTO. Het cloudgebruik moet waarschijnlijk ook worden opgenomen in een cloudregister." |
| Pre-scan, resultaatpagina | "Advies: bespreek de resultaten van de pre-scan met de privacyprofessional van je organisatie." |
| Pre-scan 6.1.2, hoog-risico AI-systeem | "Raadpleeg artikel 6, bijlage I en bijlage III uit de AI Verordening, …", met links naar bijlage I en bijlage III op EUR-Lex. Was: "Raadpleeg artikel 6 en Annex III uit de AI Verordening". |
| Pre-scan, resultaatpagina (toegevoegd, geen voorstel uit de backlog) | "Dit advies is pas volledig als alle vragen zijn ingevuld." |
| Startpagina, bij Inloggen | "Op dit moment is alleen het SSO-systeem van de Rijksoverheid aangesloten." |
| Over Invulhulpen | "Heb je vragen of tips om de invulhulpen te verbeteren? Mail dan naar privacy-ciorijk@minbzk.nl." |
| Privacyverklaring, klacht indienen | "Als je een klacht hebt over de verwerking van je persoonsgegevens, kun je deze indienen via privacy-ciorijk@minbzk.nl. Word je klacht niet naar tevredenheid opgelost, dan kun je een klacht indienen bij de Functionaris gegevensbescherming van het ministerie van Binnenlandse Zaken of bij de Autoriteit Persoonsgegevens." |

Aangepast ten opzichte van het voorstel:

| Plek | Voorstel | Aangepast naar | Reden |
|---|---|---|---|
| Startpagina | SSO systeem | SSO-systeem | spelling |
| Startpagina | RIjksoverheid | Rijksoverheid | spelling |
| Privacyverklaring | vai | via | spelling |
| Privacyverklaring | RIG@rijksoverheid.nl | privacy-ciorijk@minbzk.nl | klachten gaan naar CIO Rijk |
| Privacyverklaring | "…minbzk.nl ." | "…minbzk.nl." | spatie voor de punt |
| Privacyverklaring | Wordt je klacht | Word je klacht | spelling |
| Privacyverklaring | Binnenlandse zaken | Binnenlandse Zaken | spelling |
| Pre-scan, inleiding | "DPIA  nodig" | "DPIA nodig" | dubbele spatie |
| Pre-scan, inleiding | "…herbruikbare informatie" | "…herbruikbare informatie." | ontbrekende punt |
| Pre-scan 0.5.2 | "…in een cloudregister" | "…in een cloudregister." | ontbrekende punt |
| Over Invulhulpen | "…privacy-ciorijk@minbzk.nl" | "…privacy-ciorijk@minbzk.nl." | ontbrekende punt |

Waar het voorstel de plek openliet, is gekozen voor: het mailadres op "Over Invulhulpen" (het voorstel noemde ook de startpagina), de SSO-zin alleen voor wie niet is ingelogd, en de cloudmelding als informatieblok dat alleen verschijnt bij "Ja" op 0.5.1.

## Impact

- Gebruikers: de pre-scan, de startpagina, "Over Invulhulpen" en de privacyverklaring tonen de afgestemde teksten. De titel van 2.1.6 wijzigt, de pre-scan heeft twee onderdelen meer en kan worden vastgesteld en ondertekend, en het formulier zonder account neemt alleen nog over wat de gebruiker zelf inlaadt. Iedereen in een project ziet de ledenlijst.
- Datamodel: nieuwe vraag-ID's 8 en 9 (met onderliggende vragen) in de pre-scan. De ID's en antwoorden van de DPIA veranderen niet.
- Bestaande pre-scans: wie bij het hervatten op de resultaatpagina stond, komt uit op het eerste colofononderdeel, twee stappen ervoor. Een voltooiing van nummer 8 kan niet zijn opgeslagen, omdat de resultaatpagina geen vinkje "Markeer als voltooid" heeft.
- Export: de nieuwe onderdelen komen mee in de PDF- en JSON-export. De PDF zet het colofon van de pre-scan nog als gewone onderdelen achteraan. Bij de DPIA staat het colofon apart.
- Ontwikkelteam: bij een wijziging van DPIA 19 of 20 ook pre-scan 8 en 9 bijwerken.

## Alternatieven

1. **De titel "Bron betrokkenen" houden en alleen de vraag aanpassen.** Niet gekozen: de titel zou dan blijven afwijken van het begrippenkader, en de definitie zou niet zichtbaar worden.
2. **Pre-scan-antwoorden in het formulier zonder account automatisch blijven overnemen, met een melding.** Niet gekozen: de antwoorden staan alleen in het geheugen van de browser en verdwijnen bij herladen. Een ingeladen bestand is controleerbaar en werkt na herladen nog.
3. **Het colofon van de pre-scan los van de DPIA ontwerpen.** Niet gekozen: twee verschillende colofons vragen van gebruikers en beheerders twee werkwijzen voor hetzelfde doel.

## Open punten

- Een pre-scan kan op "DPIA niet verplicht" uitkomen terwijl niet alle vragen zijn ingevuld. De resultaatpagina zegt nu dat het advies pas volledig is als alle vragen zijn ingevuld. Of de uitkomst bij een onvolledige pre-scan anders moet werken, bijvoorbeeld geen uitkomst tonen of de ontbrekende vragen noemen, is nog niet besloten.

- Het colofon van de pre-scan wijkt af van het voorstel in de backlog: daar is Advies FG niet nodig, en zijn afstemming met de PO (en waarom wel of niet) en ondertekening door de proceseigenaar wel nodig. Het voorstel noemt als plek "onder Resultaten".
- De vraag bij 2.1.6 spreekt van een "derde partij". De definitie van Bron persoonsgegevens in het begrippenkader spreekt van een "betrokken partij". In het begrippenkader is "derde" een smallere term dan "betrokken partij": een derde is onder meer geen verwerker of verwerkingsverantwoordelijke. Vraag en definitie moeten op elkaar worden afgestemd.
