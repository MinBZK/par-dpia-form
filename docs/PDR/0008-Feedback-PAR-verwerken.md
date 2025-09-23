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
- In de inleiding van de pre-scan wordt de vraag over grondslag (0.3) verwijderd. Hierdoor worden de vragen over cloud 0.4 ipv 0.5
- Bij vraag 15 in de DPIA vervalt de optie “Niet van toepassing”, en bij “Nee” moet altijd worden aangegeven dat het om een beperking van het recht gaat met een wettelijke grondslag. Hierdoor vervallen alle subvragen 15.x.3. En wordt er een extra tekstveld toegevoegd indien "Nee" bij vraag 15.x.1.

### Tekstuele correcties
- "Functionarissen/afdelingen" wijzigen naar "functies/afdelingen" in sectie 6. Betrokken partijen
- Voor de DPIA, 2.1.6 Persoonsgegevens, "bron betrokkenen" of "betrokken partij" wordt veranderd naar "bron persoonsgegevens"
- In de inleiding van de pre-scan wordt de bullet "• Proportionaliteit van de verwerking" verwijderd
- In de inleiding van de pre-scan wordt de zin "Welk doel wil de organisatie bereiken met de gegevensverwerking?" aangepast naar "Beschrijf kort het initiële doel van de gegevensverwerking"
- Uitleg bij vraag 3.3 "Samenhang gegevensverwerking" wordt aangepast van:
    "Beschrijf hier hoe de verschillende gegevensverwerkingen met elkaar samenhangen.
              Geef aan welke verwerkingen elkaar beïnvloeden, welke gegevens tussen verwerkingen worden uitgewisseld,
              en hoe de verwerkingen samen bijdragen aan het hoofddoel. Voor visualisatie kunt u een link toevoegen
              naar een schema of diagram dat is opgeslagen in een samenwerkruimte, gedeelde map of andere specifieke opslaglocatie."

    naar:
     "Omdat de gegevensverwerkingen binnen het voorstel gecompliceerd kunnen zijn en het niet altijd gemakkelijk is om het geheel van gegevensverwerkingen in woorden uit te drukken is het van belang om de gegevensverwerkingen te visualiseren, bijvoorbeeld aan de hand van een input-proces-output model, stroomschema of workflow. Voor het stroomschema kan ook gebruik worden gemaakt van diagrammen zoals (Enterprise) architecten gewoon zijn om op te stellen. Het belangrijkste punt is dat door het opnemen van een schema of workflow de “scope” van de DPIA ook voor de niet ingevoerde lezer duidelijk wordt.

### Ontbrekende informatie toevoegen
 - Uitleg van sectie 1.1.7 06. Betrokken partijen toevoegen aan invulmodel (inclusief rolbeperkingen) (Een verwerker kan niet tegelijkertijd sub-verwerker zijn, daarom is bij die rol een keuze te maken voor één van die rollen. Een gezamenlijke verwerkingsverantwoordelijke kan alleen een partij zijn die al. Alleen een verwerkingsverantwoordelijke kan een verstrekker zijn.Iedereen kan ook ontvanger zijn.)
- Verwerkingsdoeleinde overnemen uit sectie 5 naar sectie 10 (bewaartermijn)

### Functionaliteit uitbreiden
- Risiconiveau berekening implementeren op basis van kans × impact
- Risicobeoordeling voor verwerkingen buiten de EU toevoegen conform gegevensmodel 1.1.17

### Logica verbeteren
- Antwoordoptie "niet van toepassing" bij doelbinding (sectie 13) beter afhandelen - nog in afwachting van hoe
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
