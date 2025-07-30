# 0008: Feedback PAR verwerken

Datum: 2025-07-23

## Status

Voorgesteld

## Besluit

We verwerken de feedback van het PAR team door een reeks verbeteringen en correcties door te voeren in het DPIA formulier en het onderliggende datamodel om consistentie en gebruiksvriendelijkheid te verbeteren.

## Achtergrond

Het PAR team heeft uitgebreide feedback gegeven op het DPIA invulmodel na evaluatie. Deze feedback bevat concrete verbeterpunten voor tekstuele correcties, ontbrekende uitleg, inconsistenties tussen het invulmodel en het datamodel, en suggesties voor betere gebruikerservaring.

## Overweging

- Gebruikerservaring verbeteren door duidelijkere instructies en consistente terminologie
- Datamodel en invulmodel op elkaar afstemmen
- Tekstuele fouten corrigeren voor professionaliteit
- Functionaliteit uitbreiden waar nodig (zoals risicobeoordeling)

## Details

De volgende verbeteringen worden doorgevoerd:

### Structurele aanpassingen
- Samenhang gegevensverwerkingen verduidelijken

### Tekstuele correcties
- "Functionarissen/afdelingen" wijzigen naar "functies/afdelingen" in sectie 6. Betrokken partijen

### Ontbrekende informatie toevoegen
- Uitleg van sectie 1.1.7 06. Betrokken partijen toevoegen aan invulmodel (inclusief rolbeperkingen)
- Verwerkingsdoeleinde overnemen uit sectie 5 naar sectie 10 (bewaartermijn)

### Functionaliteit uitbreiden
- Mogelijkheid toevoegen om rechten van betrokkenen als "niet van toepassing" te markeren
- Risiconiveau berekening implementeren op basis van kans × impact
- Risicobeoordeling voor verwerkingen buiten de EU toevoegen conform gegevensmodel 1.1.17

### Logica verbeteren
- Antwoordoptie "niet van toepassing" bij doelbinding (sectie 13) beter afhandelen
- Relevantie van vervolgvragen automatisch bepalen

## Impact

### Gebruikers
- Duidelijkere instructies en betere gebruikerservaring
- Consistente terminologie door het hele formulier
- Minder verwarring door betere uitleg en structuur

### Ontwikkelteam
- Updates nodig in zowel frontend als datamodel
- Testcases aanpassen voor nieuwe functionaliteit

### Datamodel
- Synchronisatie tussen invulmodel en datamodel
- Nieuwe velden voor risicobeoordeling en EU-verwerkingen

## Alternatieven

- Gefaseerde implementatie: prioriteren op basis van impact
- Volledig nieuwe versie ontwikkelen: te tijdrovend en risicovol
- Alleen kritieke issues oplossen: mist kans op gebruikservaring verbetering
