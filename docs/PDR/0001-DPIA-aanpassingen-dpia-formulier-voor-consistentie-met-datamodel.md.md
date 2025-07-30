# 0001: Aanpassingen DPIA-formulier voor consistentie met datamodel

Datum: 2025-05-13

## Status

Goedgekeurd - PAR team

## Besluit

We voeren meerdere aanpassingen door in het DPIA-formulier om inconsistenties met het datamodel op te lossen en de formulierfunctionaliteit te verbeteren.

## Achtergrond

Bij het ontwikkelen van het DPIA-formulier zijn enkele inconsistenties geïdentificeerd tussen het huidige formulier (Rapportagemodel) en het onderliggende datamodel. Deze inconsistenties hebben betrekking op verwerkingslocaties, doelbinding, risico's voor betrokkenen en maatregelen. Deze inconsistenties maken dat het formulier niet volledig aansluit bij de wettelijke vereisten en best practices voor DPIA's, en kunnen leiden tot onvolledige risicoanalyses.

## Overwegingen

- Wettelijke vereisten vanuit de AVG
- Gebruiksvriendelijkheid van het formulier
- Correcte risico-identificatie
- Efficiëntie van het DPIA-proces
- Aansluiting bij het bestaande datamodel
- Impact op het rapportagemodel

## Details

We implementeren de volgende wijzigingen:

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

## Impact

### Gebruikers
- Duidelijkere instructies voor het invullen van het DPIA-formulier
- Betere begeleiding bij het identificeren van risico's
- Uitgebreidere ondersteuning bij juridische compliance

### Ontwikkelteam
- Aanpassingen vereist in frontend (form-app) en datamodel
- Updates nodig in de begrippenkader-dpia.yaml
- Aanvullende validatie-regels implementeren

### Datamodel
- Aanpassingen in schema's voor verwerkingslocaties, doelbinding, risico's en maatregelen
- Nieuwe velden en relaties toevoegen
- Automatische risico-identificatie logica implementeren

### Andere componenten
- Rapportagemodel mogelijk niet meer volledig in lijn - verdere afstemming nodig

## Alternatieven

1. **Alleen minimale aanpassingen doorvoeren**:
   - Voordeel: Minder ontwikkelwerk nodig
   - Nadeel: Inconsistenties blijven bestaan, risico op onvolledige DPIA's


## Gerelateerde documenten
- Het DPIA datamodel
- Het DPIA rapportagemodel
