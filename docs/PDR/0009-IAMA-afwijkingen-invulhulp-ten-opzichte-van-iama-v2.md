# 0009: Afwijkingen invulhulp IAMA ten opzichte van IAMA v2

Datum: 2026-10-05

## Status

Voorgesteld

## Besluit

De invulhulp IAMA wijkt op twee punten bewust af van het IAMA v2-document (versie februari 2026):

1. Bij vraag 4.1.1 staan de antwoordvelden in de volgorde van de vraagtekst: eerst de aangetaste grondrechten (negatieve impact), daarna de beschermde grondrechten (positieve impact).
2. De kruisverwijzingen tussen 3.5.2/3.5.3 en 1.2.1/1.2.2 zijn gecorrigeerd: nadelige effecten verwijzen naar de negatief geraakte publieke waarden, positieve effecten naar de positief geraakte publieke waarden.

Dit PDR legt beide keuzes terugwerkend vast. Ze zijn doorgevoerd bij het toevoegen van de IAMA aan de invulhulp en zijn destijds niet opgeschreven.

## Achtergrond

De invulhulp volgt het IAMA v2-document zo dicht mogelijk. Gebruikers die het document naast de invulhulp leggen, merken afwijkingen daarom snel op. Over beide punten zijn vragen binnengekomen. Zonder vastgelegde reden is voor het team niet na te gaan of een afwijking bewust is of per ongeluk is ontstaan.

### Volgorde bij vraag 4.1.1

De vraagtekst van 4.1.1 in het IAMA v2-document luidt: "Brainstorm: welke grondrechten en aspecten van grondrechten kunnen potentieel door het algoritme worden aangetast (negatieve impact) of juist beschermd (positieve impact)?". Ook vraag 4.1.2 (Verfijning) noemt eerst negatief en dan positief: "(negatief of positief)". De antwoordvakken in het document staan bij beide vragen echter in de omgekeerde volgorde: eerst "Positief", dan "Negatief".

Het team vond deze tegenstrijdigheid verwarrend voor de invuller.

### Kruisverwijzingen bij 3.5.2 en 3.5.3

In het IAMA v2-document staan de volgende verwijzingen:

- 3.5.2 (risico's of nadelige effecten) verwijst naar de geraakte publieke waarden in 1.2.1;
- 3.5.3 (positieve effecten) verwijst naar de gediende publieke waarden in 1.2.2.

Vraag 1.2.1 gaat echter over de publieke waarden die mogelijk *positief* geraakt worden, en vraag 1.2.2 over de publieke waarden die mogelijk *negatief* geraakt worden. De verwijzingen in het document zijn daarmee vermoedelijk omgewisseld.

## Overweging

- De invulhulp moet inhoudelijk kloppen en voor de invuller eenduidig zijn.
- Afwijkingen van het IAMA v2-document moeten tot een minimum beperkt blijven en, waar ze nodig zijn, te verantwoorden zijn.
- Bij 4.1.1 sluit de volgorde negatief-positief aan bij de rest van deel 4: de vervolgvragen in 4.2 tot en met 4.5 gaan over de negatieve impact op grondrechten.
- Bij 3.5.2 en 3.5.3 zou het overnemen van de verwijzingen uit het document de invuller naar de verkeerde vraag sturen.

## Details

### Vraag 4.1.1

In `sources/iama.yaml` is de officiële vraag 4.1.1 opgesplitst in twee taakgroepen, elk met een keuzelijst van grondrechten en een toelichtingsveld:

| Invulhulp | Inhoud | IAMA v2-document |
|---|---|---|
| 4.1.1 Aangetaste grondrechten | negatieve impact | 4.1.1, vak "Negatief" (tweede vak) |
| 4.1.2 Beschermde grondrechten | positieve impact | 4.1.1, vak "Positief" (eerste vak) |
| 4.1.3 Verfijning | open tekst | 4.1.2 |

Door de opsplitsing heeft de vraag Verfijning in de invulhulp nummer 4.1.3, waar het IAMA v2-document 4.1.2 gebruikt. De verwijzing in de belangenafweging van deel 5, "de grondrechten waarop het algoritme mogelijk positieve impact heeft (vraag 4.1.2)", verwijst in de invulhulp naar de taakgroep Beschermde grondrechten.

### Vragen 3.5.2 en 3.5.3

In `sources/iama.yaml` gelden de volgende verwijzingen:

- 3.5.2 (risico's of nadelige effecten) verwijst naar 1.2.2 (negatief geraakte publieke waarden);
- 3.5.3 (positieve effecten) verwijst naar 1.2.1 (positief geraakte publieke waarden).

De `references`-blokken bij 1.2.1 en 1.2.2 zijn op dezelfde manier ingericht: 1.2.1 toont een voorvertoning bij 3.5.3, 1.2.2 bij 3.5.2.

## Impact

- Gebruikers: eenduidige volgorde bij 4.1.1 en kloppende verwijzingen bij 3.5.2 en 3.5.3. Wie het IAMA v2-document naast de invulhulp gebruikt, ziet op deze punten een verschil.
- Ontwikkelteam: bij een nieuwe versie van het IAMA-document controleren of deze afwijkingen nog nodig zijn.
- Utrecht Data School: de omgewisselde verwijzingen bij 3.5.2 en 3.5.3 zijn aangekaart. De volgorde bij 4.1.1 is nog niet aangekaart.

## Alternatieven

1. **Het IAMA v2-document letterlijk volgen.** Niet gekozen: bij 4.1.1 blijft de tegenstrijdigheid tussen vraagtekst en antwoordvakken bestaan, en bij 3.5.2 en 3.5.3 zou de invulhulp naar de verkeerde vraag verwijzen.
2. **Bij 4.1.1 de volgorde van de antwoordvakken aanhouden (eerst positief).** Niet gekozen: de invulhulp zou dan afwijken van de vraagtekst en van de opbouw van deel 4.
3. **De nummering van 4.1 gelijktrekken met het document**, met 4.1.1 als één taakgroep met de onderdelen negatief en positief, en Verfijning als 4.1.2. Niet in dit PDR meegenomen: dat wijzigt vraag-ID's en vraagt een controle op bestaande ingevulde formulieren en verwijzingen.
