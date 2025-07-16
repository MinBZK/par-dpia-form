---
title: Rapport invulhulp DPIA
Status: Definitief
Versie: 0.1.1
Datum: 17 juli 2025
Contact: 
- robbert.bos@rijksoverheid.nl
- ravi.meijer@rijksoverheid.nl
- RIG@rijksoverheid.nl
GitHub: https://github.com/MinBZK/par-dpia-form
Tool: https://minbzk.github.io/par-dpia-form/
---

# 1. Inleiding 

In dit rapport presenteren we onze bevindingen en aanbevelingen met betrekking
tot de ontwikkelde invulhulp DPIA. Deze tool is specifiek ontworpen om het
invullen van het Rapportagemodel DPIA Rijksdienst gebruiksvriendelijker te
maken. Daarnaast is standaardisatie van informatie een belangrijke pijler.
De tool bestaat uit twee hoofdcomponenten welke zijn afgestemd op het
Rapportagemodel DPIA Rijksdienst:
  1. een pre-scan DPIA voor initiële risico-inschatting voor DPIA, IAMA, KIA en DTIA
  2. het Rapportagemodel DPIA

De aanleiding voor dit project was de constatering dat het bestaande DPIA
invulproces vaak als complex en tijdrovend wordt ervaren. Overheidsorganisaties
hebben behoefte aan een gestructureerde, toegankelijkere en efficiëntere methode
om DPIA's uit te voeren. Daarbij kan door te werken vanuit een gestandaardiseerd
model de vastgelegde informatie ook worden verwerkt in de context van
informatiehuishouding.
Om deze uitdaging aan te pakken, hebben we een browsergebaseerde applicatie
ontwikkeld die zonder installatie of serverhosting kan worden gebruikt. Gebruikers
kunnen hun voortgang opslaan in een downloadbaar bestand en eerder opgeslagen
sessies hervatten door het bestand in te laden. Uiteindelijk kan een versie worden
geëxporteerd als PDF, en verder te verwerken in een tekst-editor.
Om te valideren of we daadwerkelijk een gebruiksvriendelijkere oplossing hebben
gecreëerd voor DPIA-uitvoerders, zijn twee gebruikersonderzoeken uitgevoerd:
één voor de pre-scan DPIA en één voor de DPIA. Dit rapport presenteert de
bevindingen vanuit het Rijks ICT Gilde, de bevindingen van de
gebruiksonderzoeken en doet aanbevelingen voor verdere ontwikkeling.

## 2. Behaalde resultaten en successen
Het doel van de invulhulp DPIA is om bij de dragen aan het rapporteren over de
uitvoering van pre-scan DPIA's en DPIA's binnen de Rijksoverheid:
-  **Gebruiksvriendelijk alternatief**: Het oorspronkelijke DPIA-invulproces,
dat bestond uit afzonderlijke Word- en Excel-documenten, is
getransformeerd naar een geïntegreerde tool. Beide componenten, pre-
scan DPIA en DPIA, delen informatie vanuit dezelfde digitale omgeving,
wat dubbele invoer elimineert.
-  **Verbeterde standaardisatie**: Door een [standaard formulierdefinitie](https://github.com/MinBZK/par-dpia-form/blob/main/docs/standard/form_standard.md) te
gebruiken is er een gestructureerde toepassing ontwikkeld met het oog op
de toekomst. De standaard legt de vragen uit het Rapportagemodel DPIA,
[begrippenkader](https://modellen.jenvgegevens.nl) en hun onderlinge relaties en de antwoorden van de
gebruiker op een gestructureerde wijze vast.
-  **Optimalisatie informatiehuishouding**: De gestandaardiseerde
vastlegging van informatie in een machine-leesbaar formaat maakt het
mogelijk deze data effectief te verwerken in de bredere context van de
informatiehuishouding binnen de Rijksoverheid.
-  **Laagdrempelige technische oplossing**: De browsergebaseerde
applicatie werkt zonder installatie of serverhosting, wat de
toegangsdrempel verlaagt en adoptie bevordert.
-  **Praktijkvalidatie**: Door middel van gebruikersonderzoeken voor zowel de
pre-scan DPIA als de DPIA hebben we geverifieerd dat de tool inderdaad
een gebruiksvriendelijkere oplossing biedt dan het huidige invulproces. De
eerste reacties zijn positief en de gebruikers kunnen zich voorstellen dat
dit bijdraagt aan het efficiënter uitvoeren van DPIA's.

## 3. Methodiek gebruikersonderzoeken
In totaal zijn 6 gebruikerssessies uitgevoerd voor beide componenten, waarbij
deelnemers gedurende 30 minuten de tool actief gebruikten en hun gedachten en
ervaringen hardop deelden. Interviewers stelden gerichte vragen en maakten
aantekeningen.

## 4. Gerealiseerde verbeteringen
Op basis van de feedback van de gebruikers, van het Privacyteam CIO Rijk en van
het Justitie & Veiligheid (J&V) datamodel-team zijn de volgende verbeteringen
gerealiseerd:
### 4.1 Toegankelijkheid en distributie
- **Weblink implementatie**: De tool is nu beschikbaar via een weblink, wat
de cybersecurity-zorgen bij de gebruikers wegneemt. Het HTML-bestand
kan nog steeds los aangeboden worden voor bijvoorbeeld lokaal gebruik.
- **Verbeterde distributie**: Gebruikers hoeven geen bestanden te
downloaden om de tool te gebruiken.
### 4.2 Gebruikersinterface
- **Verbeterde navigatie**: Duidelijkere markering van secties als voltooid.
- **Verbeterde informatieoverdracht**: Verbeterde begeleiding bij
automatisch overgenomen antwoorden.
- **Resultaatverklaring**: Verbeterde uitleg over hoe de ingevulde
antwoorden in de pre-scan DPIA tot een conclusies komen.
- **Uitgebreide definities**: De matching tussen het begrippenkader uit het
datamodel en de invulhulp DPIA is verbeterd door uitbreiding van
alternatieve spellingen en termen. Daarnaast zorgt een dagelijkse
automatische synchronisatie met het datamodel van J&V ervoor dat het
begrippenkader actueel blijft.
- **Verbeterde begeleiding**: Meer uitleg bij 'delen', 'opslaan', 'verder
werken' en 'opnieuw beginnen’.
- **Vergroot tekstvelden**: Het standaard formaat van tekstvelden is
vergroot voor betere leesbaarheid.

## 5. Aanbevelingen
### 5.1 Inhoudelijke verbeteringen
- **Vraagcomplexiteit en terminologie**: Uit feedback en onze ervaring
blijkt dat de grootste winst te behalen valt bij de inhoud en
begrijpbaarheid van de vragen. De doelgroep die een DPIA invult is
multidisciplinair (van projectleiders tot beleidsmedewerkers en IT-
specialisten), terwijl de gehanteerde terminologie vaak vakspecifiek en
complex is. Dit vergroot de drempel voor niet-privacyspecialisten om het
instrument effectief te gebruiken. Door de formulering en structuur van de
vragen te vereenvoudigen - zonder afbreuk te doen aan de inhoudelijke
kwaliteit - wordt het instrument toegankelijker. Het betrekken van een
communicatiespecialist bij dit proces zou waardevol kunnen zijn.
- **Onderbouwing instrumentselectie**: Toevoegen van duidelijke uitleg
waarom KIA, DTIA, IAMA en DPIA worden uitgevraagd in de pre-scan.
Deze selectie van instrumenten is momenteel niet beargumenteerd, wat
tot verwarring leidt bij gebruikers.
- **Harmonisatie datamodel en formuliervragen**: De eerste stappen naar
een single-source-of-truth zijn gezet. Dit draagt bij aan zowel technische
correctheid als gebruiksvriendelijkheid, en vereenvoudigt het onderhoud
aanzienlijk doordat wijzigingen centraal worden beheerd. De verschillen
tussen het Rapportagemodel en de invulhulp DPIA zijn gedocumenteerd in
[Product Decision Records (PDR)](https://github.com/MinBZK/par-dpia-form/tree/main/docs/PDR). Daarnaast worden automatisch twee
bestanden toegevoegd aan de GitHub-repository als naslagwerk: één voor
de [pre-scan DPIA](https://github.com/MinBZK/par-dpia-form/blob/main/docs/tasks/tasks_prescan_DPIA.md) en één voor de [DPIA](https://github.com/MinBZK/par-dpia-form/blob/main/docs/tasks/tasks_DPIA.md), beide met de verwoording van de
vragen en hun onderlinge relaties. De volgende stap is het verder
standaardiseren van de vraagteksten.

### 5.2 Gebruikerservaring verbeteren
- **Integratie van tool in werkprocessen**: De invulhulp DPIA moet
aansluiten bij bestaande werkprocessen van privacy-professionals. Dit
vereist duidelijke documentatie over de inpassing binnen de bredere DPIA-
procedure, met nadruk op een gestructureerd reviewproces en
versiebeheer. Handleidingen kunnen tonen hoe gebruikers efficiënt kunnen
schakelen tussen de tool en andere formats, waarbij wijzigingen
traceerbaar blijven voor teams die gezamenlijk aan een DPIA werken.
- **Feedback-loop implementeren**: Voor continue verbetering is een
eenvoudig feedbackmechanisme nodig. Implementeer concrete opties
zoals een geïntegreerde feedbackknop met e-mailfunctionaliteit of GitHub
issue-tracking waar gebruikers feedback achter kunnen laten. Tijdens het
gebruik moeten suggesties of problemen kunnen worden gemeld zonder
hun werk te veel te onderbreken. De verzamelde feedback moet
systematisch worden geanalyseerd om structurele verbetermogelijkheden
te identificeren.

### 5.3 Technische uitdagingen
- **Serverloze beperkingen (o.a. samenwerking)**: De standalone HTML-
applicatie zonder servercomponent biedt voordelen qua portabiliteit, maar
beperkt gewenste functionaliteiten zoals realtime samenwerking. Ook zou
een serveroplossing het mogelijk maken om een dossier te beheren met
zowel meerdere versies van dezelfde DPIA als verschillende DPIA's voor
diverse projecten, waardoor gebruikers eenvoudig hiertussen kunnen
wisselen. Evaluatie van lichtgewicht serveroplossingen of hybride modellen
is gewenst om deze extra functionaliteit te bieden zonder de
laagdrempeligheid te verliezen.
- **WCAG-conformiteit verbeteren**: Huidige PDF-export voldoet niet
volledig aan de WCAG toegankelijkheids-standaarden, wat de
bruikbaarheid beperkt voor gebruikers met een beperking. Prioriteit ligt bij
het verbeteren van de pagina-structuur, het toevoegen van beschrijvende
teksten voor afbeeldingen, betere navigatie met het toetsenbord en
verhogen van kleurcontrast. Regelmatige toegankelijkheidstests kunnen
knelpunten identificeren en oplossen voor alle gebruikers.
- **Testdekking uitbreiden**: De codebase heeft momenteel geen
geautomatiseerde testing, wat de betrouwbaarheid en onderhoudbaarheid
van de applicatie beïnvloedt. Het implementeren van een uitgebreide
testsuite met unit tests, integratie tests en end-to-end tests is essentieel
voor stabiele doorontwikkeling.
### 5.4 Functionele verbeteringen
- **Opmaakopties onderzoeken**: Gebruikers hebben behoefte aan meer
mogelijkheden in tekstvelden, zoals tabellen, kopniveaus en basisopmaak.
Binnen de serverloze beperkingen kunnen lichte markup-oplossingen
worden onderzocht, zoals ondersteuning voor Markdown of eenvoudige
editors die ook lokaal kunnen draaien. Voor tabellen zou onderzocht
kunnen worden of voorgedefinieerde sjablonen een werkbare oplossing
bieden zodat die ook correct in PDF-exports kan worden weergegeven.
- **JSON als onderdeel van PDF**: Door de JSON-gegevens als metadata in
de PDF op te slaan, vervalt de noodzaak voor losse opslag en het
handmatig herladen van JSON-bestanden. Dit zou een aanzienlijke
verbetering betekenen voor de gebruikerservaring, aangezien de
doelgroep doorgaans niet vertrouwd is met JSON-bestanden en dit
technische aspect wegneemt uit hun workflow.
## 6. Conclusie
De invulhulp DPIA heeft belangrijke stappen gezet in het gebruiksvriendelijker
maken van het DPIA-invulproces. Binnen de huidige technische en inhoudelijke
kaders zijn gerichte verbeteringen doorgevoerd die impact hebben op de
gebruikerservaring.
De huidige versie is geschikt voor gebruik in de praktijk en kan beschikbaar
worden gesteld via platforms zoals [digitaleoverheid.nl](https://www.digitaleoverheid.nl) of een andere website in
gebruik bij het Privacyteam CIO Rijk. Het eindresultaat kan worden geëxporteerd
als PDF zodat het eenvoudig kan worden verwerkt en bewaard bij de
projectadministratie. Dit maakt de tool inzetbaar in bestaande werkprocessen.

Ondanks de gebruikerstesten, is de applicatie nog niet volledig getest door
eindgebruikers in een werkomgeving. Voor optimaal gebruik in de dagelijkse
praktijk zijn verdere verbeteringen wenselijk die een meer fundamentele
herziening vereisen. Dit betreft zowel inhoudelijke aspecten (complexiteit en
hoeveelheid van vragen) als technische keuzes (serverloze beperkingen). Op korte
termijn kan met het versimpelen van de inhoud meer winst worden behaald, dan
met technische verbeteringen. Het versimpelen van de inhoud vormt de sleutel tot
bredere adoptie en effectiever gebruik.
Als volgende stap maken wij nog een voorstel voor beheer en doorontwikkeling. In
het beheerplan staat onder andere een voorstel hoe we de invulhulp DPIA aan
kunnen bieden via de Rijkscloud. Met betrekking tot doorontwikkeling proberen we
in dat voorstel op een praktische manier te beschrijven hoe we ondersteuning
kunnen bieden nu we een eerste versie van deze invulhulp DPIA hebben
opgeleverd.

