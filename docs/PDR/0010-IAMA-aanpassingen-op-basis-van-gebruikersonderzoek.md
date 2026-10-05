# 0010: Aanpassingen invulhulp IAMA op basis van gebruikersonderzoek

Datum: 2026-10-05

## Status

Voorgesteld

## Besluit

Op basis van gebruikersonderzoek passen we de invulhulp IAMA op drie punten aan:

1. Bij vraag 2.2B.4 (dataminimalisatie) en vraag 3.1.1 (het proces waar het algoritme onderdeel van is) kan de invuller naast het tekstantwoord optioneel een of meer afbeeldingen toevoegen.
2. Bij vraag 1.3.1 (verboden AI-systeem) en vraag 1.3.2 (wettelijke taak) komt onder de keuze Ja/Nee een optioneel toelichtingsveld.
3. In alle afbeeldingsvelden van de invulhulpen kan de invuller een afbeelding plakken vanuit het klembord, naast uploaden en slepen.

Punt 1 en 2 wijken af van het IAMA v2-document (versie februari 2026). Daar staan bij deze vragen alleen een tekstvak of alleen de keuze Ja/Nee.

## Achtergrond

Uit gebruikersonderzoek kwamen de volgende wensen naar voren.

**Afbeeldingen bij 2.2B.4 en 3.1.1.** Organisaties hebben het proces rond een algoritme vaak al vastgelegd in een procesplaat of een vergelijkbaar schema. Bij vraag 3.1.1 ("Hoe ziet het proces eruit waar het algoritme een onderdeel van is?") moeten invullers zo'n plaat nu in tekst omzetten. Hetzelfde geldt voor overzichten van gebruikte gegevens bij vraag 2.2B.4.

**Toelichting bij 1.3.1 en 1.3.2.** Vraag 1.3.1 en 1.3.2 bieden alleen de keuze Ja of Nee. Een invuller kan daardoor niet vastleggen waarom het antwoord Ja of Nee is (zie [issue #567](https://github.com/MinBZK/par-dpia-form/issues/567)). Alleen bij Ja op 1.3.2 volgt nu een tekstvak (1.3.4, de wettelijke grondslag).

**Plakken van afbeeldingen.** Invullers maken vaak een schermafbeelding van een bestaand schema. Die moesten ze eerst als bestand opslaan om hem te kunnen uploaden. In veel andere toepassingen kan zo'n schermafbeelding direct worden geplakt.

## Overweging

- De invulhulp moet aansluiten bij hoe invullers werken en de informatie die zij al hebben.
- Afwijkingen van het IAMA v2-document blijven beperkt tot aanvullingen: geen officiële vraag verandert of verdwijnt.
- Bestaande antwoorden moeten blijven werken.
- Afbeeldingen doorlopen dezelfde verwerking als bij het bestaande afbeeldingsveld: verkleinen, omzetten naar WebP en verwijderen van metadata (zie `docs/image-handling.md`).

## Details

In `sources/iama.yaml` komen de volgende velden bij, alle met `is_official_id: false`:

| Veld | Type | Plaats | Zichtbaar |
|---|---|---|---|
| `1.3.1.toelichting` | `open_text` | onder 1.3.1 | altijd, net als 1.3.1 |
| `1.3.2.toelichting` | `open_text` | onder 1.3.2 | als 1.3.1 = Nee, net als 1.3.2 |
| `2.2B.4.afbeeldingen` | herhaalbare `task_group` met `image` | onder 2.2B.4 | als 2.1.1.1 = zelflerend, net als 2.2B |
| `3.1.1.afbeeldingen` | herhaalbare `task_group` met `image` | onder 3.1.1 | altijd |

De afbeeldingsgroepen volgen het patroon van de groep Afbeeldingen in de DPIA (1.2): elke afbeelding krijgt optioneel een titel, omschrijving en bron.

Het plakken werkt als het afbeeldingsveld focus heeft: het upload- en sleepvlak, of de getoonde afbeelding om die te vervangen. Plakken in de tekstvakken voor titel, omschrijving en bron blijft gewoon tekst plakken. Staat er geen afbeelding op het klembord, dan meldt het veld dat.

## Impact

- Gebruikers: procesplaten en schema's kunnen als afbeelding worden toegevoegd, en een keuze bij 1.3.1 en 1.3.2 kan worden toegelicht. Het plakken geldt voor alle afbeeldingsvelden, ook in de DPIA.
- Datamodel: zes nieuwe vraag-ID's in de IAMA. Bestaande ID's en antwoorden veranderen niet.
- Export: de nieuwe velden komen mee in de PDF- en JSON-export, net als andere velden.
- Ontwikkelteam: bij een nieuwe versie van het IAMA-document controleren of deze aanvullingen nog passen.

## Alternatieven

1. **Afbeeldingen in het tekstveld zelf, zoals in GitHub.** Niet gekozen: dat vraagt een aparte opslag van bijlagen en een herziening van de keuze om afbeeldingen in markdown te weren (zie `docs/markdown-support.md`).
2. **Het type van 3.1.1 en 2.2B.4 wijzigen naar afbeelding.** Niet gekozen: dan verdwijnt het tekstantwoord, en bestaande antwoorden zouden niet meer passen.
3. **Eén toelichtingsveld onder de hele groep 1.3.** Niet gekozen: een toelichting per vraag sluit beter aan bij de vraag waar ze over gaat.
