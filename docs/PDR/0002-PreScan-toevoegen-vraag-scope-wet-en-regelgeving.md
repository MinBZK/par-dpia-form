# 0002: Toevoegen DPIA-verplichting vraag voor wet- en regelgeving

Datum: 2025-05-13

## Status

Geaccepteerd - PAR team

## Besluit

We voegen aan het begin van de DPIA een nieuwe vraag toe om direct te identificeren of de DPIA betrekking heeft op nieuwe wet- of regelgeving, waarbij een DPIA altijd verplicht is.

## Achtergrond

In het huidige DPIA-formulier en pre-scan ontbreekt een expliciete vraag omtrent wet- en regelgeving. Volgens de AVG is een DPIA verplicht wanneer het nieuwe wet- of regelgeving betreft. Momenteel wordt dit niet direct uitgevraagd, waardoor gebruikers mogelijk onnodig de volledige pre-scan doorlopen terwijl een DPIA direct verplicht zou zijn.

## Overwegingen

- Wettelijke vereisten vanuit de AVG
- Gebruiksvriendelijkheid en efficiëntie van het proces
- Impact op de bestaande formulierflow
- Consistentie met het datamodel
- Eenvoud van implementatie

## Details

We implementeren de volgende wijziging:

- **Vraag**: "Betreft de scope nieuwe wet- of regelgeving?"
- **Opties**: [Ja/Nee]
- **Gevolg bij "Ja"**: Toon het bericht "Bij wetgeving of regelgeving is een DPIA altijd verplicht. De rest van de pre-scan hoeft niet ingevuld."
- **Flow bij "Ja"**: Gebruiker krijgt de beoordeling 'DPIA-verplicht'
- **Flow bij "Nee"**: Gebruiker krijgt geen beoordeling

De vraag zal worden toegevoegd als allereerste vraag in de pre-scan, voordat andere vragen worden getoond.

## Impact

### Gebruikers
- Efficiënter proces voor DPIA's in het kader van wet- en regelgeving
- Duidelijkere instructies over wanneer een DPIA verplicht is
- Verminderde formulier-invultijd voor bepaalde gebruikers

### Ontwikkelteam
- Aanpassing in de frontend logica voor de pre-scan
- Toevoeging van een veld in het datamodel
- Implementatie van conditionele logica om de pre-scan over te slaan

### Datamodel
- Nieuw veld voor het vastleggen van de wet- en regelgeving status
- Mogelijk aanpassingen in validatieregels


## Alternatieven

1. **Huidige situatie handhaven**:
   - Voordeel: Geen aanpassingen nodig
   - Nadeel: Minder efficiënt proces, mogelijk verwarring bij gebruikers

## Gerelateerde documenten
- Het DPIA datamodel
- AVG vereisten rondom DPIA's voor wetgeving
