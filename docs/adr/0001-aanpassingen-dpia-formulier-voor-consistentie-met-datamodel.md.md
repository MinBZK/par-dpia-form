# 0001: Aanpassingen DPIA-formulier voor consistentie met datamodel

Datum: 2025-05-13

## Status

Voorgesteld

## Context

Bij het ontwikkelen van het DPIA-formulier zijn enkele inconsistenties geïdentificeerd tussen het huidige formulier (Rapportagemodel) en het onderliggende datamodel. Deze inconsistenties hebben betrekking op:

1. **Verwerkingslocaties (vraag 9)**: Het ontbreken van expliciete controle op EU/niet-EU locaties en internationale organisaties, waardoor doorgiftemechanismen en automatische risico-signalering niet worden toegepast.

2. **Doelbinding (vraag 14)**: Het ontbreken van opties om expliciet aan te geven of verdere verwerking toelaatbaar is en op welke grond, of dat deze verenigbaar is met het oorspronkelijke doel.

3. **Risico's voor betrokkenen (vraag 17)**: Het ontbreken van een discriminatietoets en automatische risicosignalering bij verwerking in derde landen.

4. **Maatregelen (vraag 18)**: Het ontbreken van vragen over de locatie van monitoring/evaluatie en voorzieningen voor verplichte AP-raadpleging bij hoog resterend risico.

Deze inconsistenties maken dat het formulier niet volledig aansluit bij de wettelijke vereisten en best practices voor DPIA's, en kunnen leiden tot onvolledige risicoanalyses.

## Beslissing

We besluiten de volgende wijzigingen door te voeren in het DPIA-formulier:

1. **Verwerkingslocaties (vraag 9)**:
   - Toevoegen extra vraag: "Ligt de verwerkingslocatie binnen de EER?" [Ja/Nee]
   - Koppelen aan vraag 17: automatisch "risico op basis van doorgifte" als locatie buiten de EER ligt
   - In een volgende versie: uitbreiden met internationale organisaties

2. **Doelbinding (vraag 14)**:
   - Toevoegen vraag per doelbinding: "Wat is de beoordeling van de verdere verwerking?"
   - Antwoordopties:
     - Toelaatbaar op grond van Unie- of lidstaatrechtelijk recht
     - Verenigbaar met oorspronkelijk doeleinde
     - Niet van toepassing (geen verdere verwerking)
   - Bij "Toelaatbaar op grond van Unie- of lidstaatrechtelijk recht": extra tekstveld voor wetsartikel
   - Definitie van "Toelaatbaar" toevoegen aan begrippenkader

3. **Risico's voor betrokkenen (vraag 17)**:
   - Toevoegen (bij voorkeur in pre-scan, anders bij vraag 17): "Is er mogelijk sprake van discriminatie?" [Ja/Nee]
   - Bij "Ja": automatisch advies "Er dient een anti-discriminatietoets te worden uitgevoerd"
   - Koppelen verwerkingslocaties met risico's: bij verwerking buiten EER automatisch risico toevoegen

4. **Maatregelen (vraag 18)**:
   - Toevoegen: "In welk land vindt de monitoring en evaluatie van de maatregelen plaats?" [tekstveld]
   - Toevoegen conditioneel (alleen bij resterend risico = "hoog"): "Voeg een verwijzing of beschrijving van het AP-advies toe" [tekstveld]

## Consequenties

### Positieve consequenties:
- Betere aansluiting bij het datamodel en wettelijke vereisten
- Duidelijkere structuur voor doelbinding en validatie van verdere verwerking
- Efficiënter DPIA-proces, wat potentieel tot kostenbesparing kan leiden

### Negatieve consequenties:
- Niet meer volledig in lijn met het huidige Rapportagemodel

## Alternatieven

1. **Alleen minimale aanpassingen doorvoeren**:
   - Voordeel: Minder ontwikkelwerk nodig
   - Nadeel: Inconsistenties blijven bestaan, risico op onvolledige DPIA's

2. **Volledige herziening van het formulier**:
   - Voordeel: Mogelijk nog betere aansluiting bij wettelijke vereisten
   - Nadeel: Aanzienlijk meer werk, grotere impact op gebruikers

3. **Wachten met aanpassingen tot volgende grote update**:
   - Voordeel: Kan worden gecombineerd met andere gewenste wijzigingen
   - Nadeel: Huidige inconsistenties blijven langer bestaan

## Gerelateerde documenten
- Het DPIA datamodel
- Het DPIA rapportagemodel
