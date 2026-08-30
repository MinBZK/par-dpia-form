# Changelog

Alle noemenswaardige wijzigingen aan dit project worden gedocumenteerd in dit
bestand. Het formaat is gebaseerd op
[Keep a Changelog](https://keepachangelog.com/nl/1.1.0/). Het project volgt
[Calendar Versioning](https://calver.org/) in de vorm `YYYY.M.D`
(bijvoorbeeld `2026.6.6`). Releases tot en met [0.1.3] (4 juni 2026) volgden
Semantic Versioning; daarna is het project overgestapt op Calendar Versioning.
De versie is sindsdien de datum, dus staat er geen datum meer naast; de oudere
SemVer-secties houden die wel.

Per release staan eerst de wijzigingen die voor gebruikers van de invulhulp
merkbaar zijn. Meer technische wijzigingen (zoals dependency-updates, CI en
build) staan kort onder "Onder de motorkap".

## [Unreleased]

### Gewijzigd

* De hele interface is overgezet naar het NLDD Design System van de
  Nederlandse Digitale Dienst. De vormgeving is vernieuwd (Rijkshuisstijl
  blijft), met onder meer een inhoudsopgave die op smalle schermen inklapt,
  duidelijker statuslabels bij de pre-scan-uitkomst en toegankelijkere
  menu's en dialogen. Alle functionaliteit werkt zoals voorheen.
* Het exportmenu noemt onder de knop "Exporteer" alleen nog het formaat
  ("PDF", "JSON", "Markdown") in plaats van drie keer "Exporteer als ...".
* De melding dat Invulhulpen in ontwikkeling is, staat nu als smalle
  statusbalk boven aan het scherm in plaats van als blok in de pagina.
* De terugkoppeling naar het overzicht of het project staat nu als
  terugknop in de bovenbalk, niet meer als losse link in de pagina. De
  knop noemt de bestemming ("Projecten", "Assessment"), niet "Terug
  naar ...", zodat hij ook op een smal scherm past.
* Onder aan elke pagina staat een voettekst met de verwijzingen naar de
  privacyverklaring, de toegankelijkheidsverklaring en de uitleg.
* De interface volgt standaard de donker- of lichtstand van je apparaat.
  Wil je daarvan afwijken, dan kies je dat onder Weergave in het
  accountmenu; die keuze wordt onthouden.
* Lopende tekst is groter en rustiger gezet, en tekstpagina's zoals de
  uitleg, de privacyverklaring en de toegankelijkheidsverklaring hebben
  een beperkte regelbreedte zodat ze prettiger lezen.
* Meldingen tijdens het samenwerken, zoals wijzigingen van anderen,
  verschijnen nu rechtsboven in beeld en op smalle schermen boven aan.
* Project- en assessmentkaarten zijn nu echte links: je kunt ze met het
  toetsenbord bereiken, ze krijgen een zichtbare focusring en je kunt ze
  met ctrl- of cmd-klik in een nieuw tabblad openen. Ze lichten niet meer
  op bij hover; de muisaanwijzer wijst de link aan.
* De sluitknop van het opmerkingenpaneel is nu overal groot genoeg om op
  een aanraakscherm te raken.
* De ledenlijst is een lijst geworden in plaats van een tabel: de naam
  staat boven het e-mailadres, de kolomkoppen zijn verdwenen en de rijen
  passen zich vanzelf aan smalle schermen aan.
* Bij een bewerkingsconflict kies je nu per vraag tussen twee duidelijk
  benoemde opties ("Jouw waarde" en "Andere waarde") in plaats van in een
  tabel met drie kolommen. Het venster is daardoor ook niet meer extra
  breed.
* De wijzigingen tussen twee versies staan nu per vraag als een paar
  "Was" en "Wordt", naast elkaar waar het past en onder elkaar waar het
  niet past, met de vertrouwde rode en groene achtergrond en even hoge
  vlakken.
* In de ledenlijst staan de rolkeuzes onder elkaar uitgelijnd. De knop
  "Verwijderen" staat bij elk lid, maar is uitgeschakeld bij de laatste
  eigenaar, net als diens rolkeuze. Het formulier om iemand toe te voegen
  is niet langer zo breed als de pagina.
* De kolomkoppen in de versiegeschiedenis blijven staan tijdens het
  scrollen, en de regels staan iets dichter op elkaar.
* De drie puntjes van een actiemenu staan nu rechtop.
* "Leden beheren" staat bij de projectacties achter dezelfde drie puntjes
  als "Project verwijderen", in plaats van als losse knop ernaast.
* De inhoudsopgave is een echte lijst geworden: de hele regel licht op
  als je erover beweegt of hem met het toetsenbord bereikt, je loopt er
  met de pijltjestoetsen doorheen, de regels staan compacter en nog niet
  bezochte hoofdstukken hebben de gewone tekstkleur; het bolletje geeft
  de status al aan.
* De inhoudsopgave heeft geen eigen schuifbalk meer maar scrollt mee met
  de pagina.
* In de inhoudsopgave blijft het hoofdstuknummer staan als een hoofdstuk is
  afgevinkt; de gevulde stip geeft aan dat het klaar is, zonder tweede vinkje.
* De toelichting onder een vraag staat in de gewone tekstkleur; het is tekst
  die je moet lezen, geen bijschrift.
* De knop "Lezen" staat bij het tekstvak waar hij bij hoort, niet meer
  rechtsboven bij de vraag.
* De uitleg bij een begrip leest op dezelfde tekstgrootte als de rest van de
  pagina en blijft binnen beeld, ook bij een begrip aan de rand.
* De uitleg bij een begrip is nu ook zonder muis te openen: je bereikt een
  begrip met de tab-toets en de uitleg verschijnt zodra het de focus heeft.
  De muisaanwijzer is de gewone pijl, net als bij de andere onderdelen van
  het ontwerpsysteem; de stippellijn onder het begrip geeft aan dat er
  uitleg is.
* Selectievakjes en keuzerondjes staan weer op één lijn met hun label.
* De vragen staan op een vaste leesbreedte in plaats van de volle
  paginabreedte.
* Bij het standalone formulier staan "Begin nieuwe ..." en "Exporteer" in de
  bovenbalk, zodat de pagina zelf alleen nog inhoud bevat.
* De versie leest zonder de "v" van de tag: "2026.8.24" in plaats van
  "v2026.8.24".
* Een hoofdstuk waar je in bezig bent houdt zijn nummer in de inhoudsopgave;
  de kleur van de stip geeft aan dat je ermee bezig bent.
* De blokken op de startpagina van het standalone formulier staan verder uit
  elkaar.
* De tussenresultaten van de pre-scan hebben echte kopjes per assessment, meer
  ruimte boven dan onder een kopje, en geen extra lijnen meer in de kaart.
* Onder aan een stap staat "Markeer als voltooid" op zijn eigen regel boven de
  knoppen, op elke schermbreedte hetzelfde.
* De titelbalk van een assessment (naam, opmerkingen, menu) lijnt uit met de
  inhoudsopgave en de vragen eronder, in plaats van met een eigen kolom.
* De toelichting onder een startkeuze leest in de gewone tekstkleur.
* De uitleg- en verklaringpagina's staan in het midden van het scherm, op een
  leesbare regelbreedte.
* De terugknop noemt de pagina waar je vandaan komt, in plaats van "Terug".
* Op de statuspagina is de uitkomst per onderdeel een gekleurd vlak in plaats
  van een klein labeltje, en het icoon voor de achterkant is een server.
* Elke pagina gebruikt dezelfde paginabreedte en marges van het design system,
  zodat koppen, kaarten en tekst overal op dezelfde lijn beginnen.
* De startpagina en de statuspagina staan weer op een leesbare breedte in
  plaats van schermbreed, en er zit minder lucht tussen de bovenbalk en de
  eerste inhoud.
* Tussen een paginakop en de kaarten eronder zit meer ruimte.
* De terugknop op een uitleg- of verklaringpagina brengt je terug naar de
  pagina waar je aan het werk was, ook als je eerst nog een andere uitlegpagina
  opende.
* Onder aan elke pagina staat nu ook wie de invulhulp uitgeeft.
* In het opmerkingenpaneel is de sluitknop kleiner, staat de kop op één regel
  met de knoppen, en lijnt het paneel uit met de inhoud ernaast. De knoppen
  onder een nieuwe opmerking zijn beter aanklikbaar.
* De datum onder de toegankelijkheidsverklaring leest als gewone (cursieve)
  tekst.
* Als je alleen mag lezen of alleen mag reageren, kun je nog steeds door
  de inhoudsopgave navigeren. Eerder lag de hele kolom vast.
* De vragen krijgen meer ruimte: de kolom is breder en de inhoudsopgave
  staat verder naar links.
* De uitleg bij een begrip heeft niet langer een bijna zwarte achtergrond
  in donker thema, maar dezelfde als een kaart op de pagina.
* Bij het uploaden van een eerder bestand stond het label "Optioneel"
  midden in de vraagzin; dat is weggehaald.
* Het e-mailadres bij "Lid toevoegen" wordt gecontroleerd voor het
  versturen, met de melding onder het veld in plaats van een
  browservenstertje.
* De hoofdnavigatie toont niet langer een knop "Projecten" naast de
  terugknop; het logo brengt je naar het projectoverzicht.

### Opgelost

* Op smalle schermen kon de pagina horizontaal meeschuiven; dat is
  verholpen, tot en met een schermbreedte van 320 pixels.
* Wie een assessment alleen mag lezen of becommentariëren, kon de
  toelichting bij een begrip niet meer openen en de knoppen onder de vragen
  niet gebruiken. Alleen de invoervelden staan nu op slot.
* De inhoudsopgave had een eigen, onzichtbare schuifbalk waardoor de laatste
  hoofdstukken buiten beeld bleven; hij schuift nu gewoon met de pagina mee.
* Bij de pre-scan verschoof de pagina zijwaarts bij elke volgende stap: korte
  stappen passen op het scherm en lange niet, waardoor de schuifbalk steeds
  verscheen en verdween. De ruimte voor de schuifbalk blijft nu gereserveerd,
  zodat de vragen en de inhoudsopgave op hun plek blijven staan.

### Onder de motorkap

* De RVO component library (`@nl-rvo/*`) is volledig vervangen door
  `@nldd/design-system` (Lit web components). De styling gebruikt nu de
  NLDD design-tokens; de Trusted-Types-CSP staat de `lit-html`-policy toe.
  Het standalone single-file formulier is hierdoor fors kleiner (de losse
  RVO-CSS met fonts en iconenset verviel).
* Het formulier "Nieuw project" gebruikt nu `nldd-form` voor zijn
  velduitlijning in plaats van eigen marges, zodat het ritme meebeweegt met
  het design system.
* De valkuilen van het design system die de NLDD-plugin niet dekt, staan nu
  in `.claude/rules/nldd-integration.md` (namen verifiëren tegen het
  package, foutmeldingen koppelen, eigen CSS verantwoorden).

## [2026.8.25]

### Gewijzigd

* De invulhulp laadt sneller bij een tweede bezoek. Afbeeldingen, pictogrammen
  en lettertypen worden nu net zo lang bewaard als scripts en stijlen, in plaats
  van bij elk bezoek opnieuw te worden gecontroleerd. Een nieuwe versie komt nog
  steeds meteen door.

### Opgelost

* Een IAMA bewaart weer alle antwoorden. Vanaf stap 2 gingen antwoorden
  verloren bij het opnieuw openen, en een geëxporteerd IAMA-bestand werd
  geweigerd met "ongeldige veldnamen". De oorzaak zat in de controle op
  veldnamen, die alleen cijfers toestond, terwijl het IAMA vraagnummers als
  "2.2A.1" en "5.A.grp-gediend" gebruikt.

### Beveiliging

* De invulhulp stuurt nu ook `X-Permitted-Cross-Domain-Policies: none` mee, zodat
  oudere browserplug-ins geen eigen regels kunnen aannemen over het ophalen van
  gegevens van het domein.
* De browser wordt gevraagd de invulhulp apart te houden van andere applicaties
  op rijksapp.nl. Een handvol browserfuncties waarmee pagina's binnen hetzelfde
  domein onderling gegevens kunnen uitwisselen, werkt daardoor niet meer voor de
  invulhulp.

### Onder de motorkap

* Twee guards in CI houden de beveiligingsinstellingen op hun plek: de build
  valt om als nginx ooit weer door de Alpine-variant wordt vervangen, en een
  check bewaakt dat de security-headers van de website en de API niet
  ongemerkt uit elkaar lopen.
* De frontend-container start zonder foutmelding over een logbestand dat niet
  geschreven kan worden. Bij het bijwerken van beveiligingspatches werd nginx
  zelf vervangen door de Alpine-variant, die bij het opstarten een ander,
  onbereikbaar logpad probeerde te openen.


## [2026.8.24]

### Toegevoegd

* Op de startpagina van het standalone formulier staat nu "Wis alle opgeslagen
  gegevens". Die verschijnt zodra er iets in je browser is opgeslagen en noemt
  om welke invulhulpen het gaat.

### Gewijzigd

* Lange lijsten laden in delen, met een "Meer laden"-knop. Projecten, leden,
  assessments, versiegeschiedenis en opmerkingdiscussies blijven zo ook bij
  duizenden regels vlot.
* De invulhulp laadt sneller op een trage verbinding: pagina's, scripts en
  antwoorden gaan gecomprimeerd over de lijn.
* Een eerdere versie terugkijken gaat merkbaar sneller, doordat een al
  opgebouwde versie wordt hergebruikt.
* Afbeeldingen mogen nu tot 2400 bij 1800 groot zijn, in plaats van 1200 bij
  900. Grote diagrammen worden dus minder verkleind en blijven scherp in de
  PDF; kleinere afbeeldingen houden hun eigen formaat.
* "Begin nieuwe..." vraagt eerst om bevestiging en noemt hoeveel antwoorden je
  kwijtraakt. Die knop wiste eerder alles in één klik.
* Is een assessment te groot om op te slaan, dan noemt de melding de
  vermoedelijke oorzaak in plaats van een technische foutcode.
* `SUPPORT.md` beschrijft per soort vraag waar je terechtkunt. Alle
  contactadressen wijzen nu naar één rol-mailbox (digigilde@rijksoverheid.nl),
  ook die in de privacyverklaring en de toegankelijkheidsverklaring.
* De IAMA-tekst benoemt samenwerking nadrukkelijker.

### Opgelost

* Verliet je een DPIA precies toen een collega iets opsloeg, dan kon die
  stilletjes zijn overgenomen pre-scan-antwoorden kwijtraken, ook na opnieuw
  laden. Een assessment dat je hebt verlaten slaat nu niets meer op; wat je
  vlak voor je vertrek wijzigde gaat daarmee verloren en kun je opnieuw
  invullen.
* Verwijderde je de eerste van twee herhaalbare groepen, dan kreeg de
  overgebleven groep na opnieuw openen nummer 1, en verwijzingen ernaar
  schoven mee. De groep houdt nu zijn eigen nummer.
* Doortypen kon twee gelijktijdige opslagpogingen veroorzaken, met een extra
  versie in de geschiedenis en soms een conflictvenster met je eigen vorige
  opslag. Er gaat nu één opslag tegelijk de deur uit.
* Mislukte het opslaan, het ophalen van wijzigingen of een opmerkingactie, dan
  gebeurde er zichtbaar niets. Alle drie melden dat nu, opslaan en ophalen pas
  na meer dan een enkele hapering. Opslaan probeert het vanzelf opnieuw, ook na
  een samenvoeging met het werk van een collega, met een knop om niet te hoeven
  wachten. Bij een verlopen bevoegdheid of een verwijderde opmerking staat er
  wat er aan de hand is, zonder zinloze herhaalknop.
* Opmerkingen liepen achter: een opgeloste kon weer als openstaand terugkomen,
  en een reactie van een collega verscheen pas als er ook iets aan de
  hoofdopmerking veranderde. Wat je zelf doet gaat nu voor, en reacties
  verschijnen direct.
* Loste een collega een opmerking op terwijl jij een reactie typte, dan
  verdween de opmerking met je tekst. Die blijft nu staan zolang je iets
  openstaan hebt, met een regel erboven dat een collega hem heeft opgelost.
* Opmerkingen bij vragen vlak onder elkaar schoven over elkaar heen, waardoor
  tekst wegviel en "Reageren", "Verwijderen" en "Oplossen" onbereikbaar werden.
  Ze schuiven nu netjes onder elkaar door.
* Was je toegevoegd op een e-mailadres dat bij de inlogdienst anders geschreven
  stond of dat je daarna wijzigde, dan zag je je project niet staan en kreeg je
  een tweede, leeg account. Adressen worden nu eenduidig vergeleken en dubbele
  accounts samengevoegd, met behoud van je rollen.
* In de PDF- en Markdown-export stond bij DPIA-hoofdstuk 13 (Doelbinding)
  opmaakcode in plaats van je antwoord. Bestaande DPIA's worden bij het openen
  bijgewerkt, dus ook eerdere antwoorden exporteren weer goed.
* De vervolgvraag "Specificatie van het wetsartikel" in hoofdstuk 13 verscheen
  nooit, ook niet na het kiezen van "Toelaatbaar op grond van Unie- of
  lidstaatrechtelijk recht".
* Een lege versiebeschrijving kon een nieuwe versie zonder wijziging aanmaken.
* Meldingen onderaan het scherm braken hun tekst onnodig af, vooral op een
  telefoon. Ze gebruiken nu de volle breedte.
* De bevestiging bij "Start nieuwe..." in het standalone formulier sluit nu met
  Escape, houdt de toetsenbordfocus binnen het venster en geeft die daarna
  terug aan de knop die hem opende.
* Het standalone formulier op `/zonder-account/` toonde in productie
  "ontwikkel" met een commit. Het toont nu de release-versie, en het uitbrengen
  stopt als dat versienummer er niet in komt.
* De verwijzingen naar het Model DPIA Rijksdienst wezen naar een verlopen
  KCBR-URL met een foutpagina.
* Een tekstlabel in de DPIA bevatte een schrijffout.

### Beveiliging

* Bij uitloggen worden nu ook de niet-opgeslagen antwoorden en de laatst
  bekeken sectie uit de browser gewist. Op een gedeelde computer kan de
  volgende gebruiker die niet meer terugzien.
* Inloggen is strenger gecontroleerd: alleen een toegangsbewijs met een geldige
  vervaltijd telt, en de sleutels van de inlogdienst komen uitsluitend over een
  beveiligde verbinding.
* Een e-mailadres dat de inlogdienst niet heeft bevestigd kan zich niet meer
  aan een account koppelen. Zo neemt iemand die zich op jouw adres registreert
  je project niet over.
* De server herkent zijn eigen proxy nu aan het adres van de directe
  verbinding, niet meer aan het aantal tussenstations. Een bezoeker kan zich
  daarmee niet voordoen als iemand anders, en de verzoeklimiet telt per echte
  bezoeker.
* De API controleert elk verzoek vooraf: onbekende of te lange invoer, een
  ongeldig project- of assessment-adres en een onleesbare datum geven een nette
  Nederlandse foutmelding in plaats van een serverfout. Naam en omschrijving
  van een project hebben bij wijzigen dezelfde lengtegrenzen als bij aanmaken.
* Alleen het opslaan van een assessment leest nog een groot verzoek in, tot
  50 MB (was 25 MB). Andere routes verwachten een paar velden en krijgen die
  ruimte niet meer.
* Alleen een eigenaar kan nog een nieuwe versie afdwingen. Een bewerker kon dat
  eerder ook, zolang hij geen omschrijving meestuurde.
* Het tijdstip waarop een opmerking is afgehandeld bepaalt de server, niet de
  browser.
* Pre-scan-antwoorden die bij een DPIA worden meegeladen gaan nu langs dezelfde
  controle als gewone antwoorden.
* Een geïmporteerd bestand kan geen antwoorden meer binnensmokkelen: veldnamen
  die geen vraagnummer zijn en beeldformaten die de invulhulp niet opslaat
  leiden tot een weigering met melding, niet tot gedeeltelijk inlezen.
* De weergave van opgemaakte tekst is dichtgezet met Trusted Types en een
  centrale opschoonstap.
* Het standalone formulier draait zonder `unsafe-inline` in de
  Content-Security-Policy; scripts en stijlen worden per build op hun
  vingerafdruk toegelaten.
* De webserver stuurt drie extra beveiligingsheaders mee, die een andere site
  afschermen van deze pagina en die bij uitloggen de opslag van de browser
  laten wissen. De Content-Security-Policy dwingt daarnaast Trusted Types af en
  schakelt verbindingen naar https.
* Het overzicht van assessments in een project haalt niet langer de volledige
  inhoud van elk assessment op. Een lijst die alleen namen en datums toont,
  vraagt nu ook alleen die op; antwoorden en afbeeldingen komen pas binnen als
  je het assessment zelf opent.
* `/.well-known/security.txt` wordt nu zelf gehost in plaats van doorverwezen
  naar het NCSC, met een beleidsverwijzing naar `SECURITY.md`. Het NCSC blijft
  het meldpunt; melden via GitHub kan nu ook rechtstreeks bij dit team.

### Onder de motorkap

* `GOVERNANCE.md` beschrijft wie de invulhulp onderhoudt, hoe besluiten tot
  stand komen en wanneer een tweede persoon meekijkt. Ook waarom de inhoud van
  de assessments niet in deze repository wordt bepaald.
* De repository is getoetst aan de Standard for Public Code. De uitkomst staat
  per criterium in `docs/standard-for-public-code.md`, inclusief de punten die
  nog open staan.
* Het metadatabestand `publiccode.yaml` heet nu `publiccode.yml`, de naam waar
  open-sourcecatalogi op zoeken, en noemt de laatste uitgebrachte versie plus
  het ministerie met zijn officiële overheidsidentificatie.
* Van elk bestand is machine-leesbaar onder welke licentie het valt, volgens de
  REUSE-specificatie. De fontbestanden van de Rijkshuisstijl zijn expliciet als
  uitzondering vastgelegd.
* Het licentieoverzicht van gebruikte bibliotheken is bijgewerkt en staat nu in
  `docs/third-party-licenses.txt`, met een CI-controle die het bijhoudt.
* Het uitwisselformaat van assessmentgegevens ligt strakker vast: alleen de
  beschreven velden worden opgeslagen. Velden uit een oudere versie worden
  weggelaten in plaats van geweigerd, zodat een bestaand assessment te bewerken
  blijft.
* Het formaat van veld-identificatiecodes stond in vier kopieën, elk met een
  eigen reguliere expressie. Er is nu één implementatie per pakket, met een
  test die backend en invulhulp gelijk houdt.
* De databaseverbindingen van de API zijn begrensd en krijgen time-outs. Bij
  een nieuwe versie worden lopende verzoeken netjes afgerond.
* Het aantal verzoeken per minuut is instelbaar zonder release en telt per
  ingelogde gebruiker. Alleen verzoeken zonder geldig toegangsbewijs tellen nog
  per IP-adres.
* De identiteit van een ingelogde gebruiker wordt kortstondig onthouden, zodat
  pollende clients niet elke keer dezelfde opzoeking doen. Autorisatie wordt
  onveranderd per verzoek getoetst.
* Een release draait eerst alle controles en zet de versietag pas als die
  slagen. Eerder viel een misser pas op nadat de tag er stond.
* De assessments-plugin voor ontwikkelaars volgt nu dezelfde CalVer als de
  applicatie; de release stopt als plugin en tag niet overeenkomen.
* Containerimages worden gescand bij elke pull request (een kwetsbaarheid met
  een oplossing blokkeert de merge), bij het uitbrengen van een release, en
  wekelijks op de draaiende omgevingen. Het gescande image is ook het
  uitgerolde image. De wekelijkse scan keek eerder alleen naar acceptatie.
* De API-container bevat geen pakketbeheerders meer. Die waren alleen nodig om
  te bouwen en brachten hun eigen kwetsbaarheden mee.
* De containerimages staan niet langer onder een pad met `dev` in de naam.
* De nginx-configuratie van de frontend is gebundeld in
  `containers/frontend/nginx/`.
* Preview-omgevingen worden alleen nog opgezet bij een `preview`-label, en gaan
  net als acceptatie na vier uur zonder uitrol in slaapstand; de eerste
  bezoeker daarna wacht op een koude start. Productie doet niet mee. Vastgelegd
  in `docs/deployment.md`.
* Preview-omgevingen werkten niet meer doordat het platform de hostnaam-indeling
  wijzigde; die ligt nu expliciet vast.
* CI aangescherpt: minimale rechten voor tokens en controle op de integriteit
  van de lockfile.
* De bewaking tegen ongecontroleerde `v-html` scant nu hele bestanden in plaats
  van losse regels, dekt ook raw `innerHTML`/`outerHTML`/`insertAdjacentHTML`
  in `.ts` en het standalone formulier, en hasht de body van de onderliggende
  `computed` mee.
* De linkcontrole sloeg alle verwijzingen tussen documenten over, waardoor
  kapotte links in de Product Decision Records ruim een jaar onopgemerkt
  bleven. Die uitzondering is weg, de links zijn hersteld, en
  `open.overheid.nl`, de eigen schema-URL's en `/.well-known/security.txt`
  worden weer meegenomen.
* De verwijzingen naar het meldpunt van het NCSC wezen naar verplaatste
  pagina's.
* De ontwikkelinstructies voor knoppen beschreven nog RVO-klassen die sinds
  versie 4.16 van de componentenbibliotheek niet meer bestaan.
* Diverse dependency- en container-updates.

## [2026.6.20]

### Toegevoegd

* Samenwerkomgeving: log in en werk met meerdere mensen aan dezelfde
  assessments. Maak projecten aan, nodig collega's uit per e-mailadres en
  bepaal per lid de rol (eigenaar, bewerker, commentator of lezer).
* Opmerkingen per vraag: plaats opmerkingen en reacties bij individuele
  velden, markeer discussies als opgelost en zie per assessment hoeveel
  open opmerkingen er zijn.
* Versiegeschiedenis: bekijk per versie wie wat wanneer heeft gewijzigd
  (per veld, met oude en nieuwe waarde), zet een individueel antwoord
  terug of herstel een volledige eerdere versie.
* Gelijktijdig werken: wijzigingen van collega's worden automatisch
  gesignaleerd en bij een opslagconflict kies je per veld welke versie
  behouden blijft.
* Markdown-opmaak in open tekstvelden, met een lees-/bewerkknop en
  veilige weergave (HTML en onveilige links worden gestript).
* Afbeeldingen toevoegen aan assessments; metadata (zoals EXIF) wordt
  bij het uploaden automatisch verwijderd.
* De invulhulp blijft zonder account te gebruiken via `/zonder-account/`:
  formulieren invullen zonder in te loggen, met opslag in de browser en
  import/export via JSON en PDF.
* Mobiele weergave: de invulhulp is geoptimaliseerd voor telefoons met een
  responsieve lay-out; het opmerkingen-paneel verschijnt als bottom-sheet en
  er is een skip-link toegevoegd voor toetsenbord- en screenreadergebruik.
* Versie-informatie en statuspagina: in de interface is zichtbaar welke versie
  draait en een statuspagina toont de beschikbaarheid van de dienst.

### Opgelost

* Kapotte link naar het IAMA-toelichtingsdocument hersteld.

### Onder de motorkap

* Herbouwd als pnpm-monorepo: gedeelde assessment-engine
  (`packages/assessment-core`), Vue-frontend met projectbeheer,
  Fastify-API met PostgreSQL en het standalone formulier als aparte app.
  Authenticatie via Keycloak, API onder `/api/v1/` met foutmeldingen
  volgens RFC 9457.
* Deploystraat heringericht: elke push naar `main` werkt de
  acceptatie-omgeving op ZAD bij, een CalVer-tag (`vJJJJ.M.D`) promoot de
  geteste images zonder rebuild naar productie en pull requests krijgen
  een eigen preview-omgeving.
* Geautomatiseerde releases ingericht op basis van deze changelog; de
  release hangt ook het standalone formulier (offline single-file) als
  downloadbare asset aan.
* Testdekking van 100% afgedwongen in CI voor alle workspaces.
* Beveiliging aangescherpt: de server valideert de begintoestand bij het
  aanmaken én de volledige assessment-state server-side, geüploade
  afbeeldingen worden tegen een allowlist gecontroleerd (SVG wordt geweigerd,
  ook in de versievergelijking) en de frontend-container draait met een
  alleen-lezen rootbestandssysteem.
* `@nl-rvo/component-library-css` bijgewerkt naar 4.20.2 (met design-tokens
  2.4.1); knoppen gemigreerd van `utrecht-button` naar `rvo-button`.
* `publiccode.yml` bijgewerkt naar v0.5 en de landingspagina omgezet naar
  invulhulpen.rijksapp.nl.
* Externe links openen nu met `rel="noopener noreferrer"`.
* Linkcontrole (lychee) robuuster gemaakt bij tijdelijke fouten en
  root-relatieve links; Dependabot bewaakt nu ook GitHub Actions,
  containers en de Python-pipeline (configuratie samengevoegd in
  `dependabot.yml`).
* Diverse dependency-updates (@types/node 25, @vitejs/plugin-vue 6.0.6,
  @types/pdfmake 0.3, string-strip-html 13.5, en aanvullende npm-, GitHub
  Actions- en Python-bumps).

## [0.1.3] - 2026-06-04

### Toegevoegd

* IAMA (Impact Assessment Mensenrechten en Algoritmes) toegevoegd aan de
  invulhulp.

### Gewijzigd

* Links in de beslishulp voor de AI-verordening gecorrigeerd.

### Onder de motorkap

* `publiccode.yml` toegevoegd voor publicatie als open source.
* pre-commit en PR-preview toegevoegd aan de CI.
* Diverse dependency-updates (o.a. Vite 7, pdfmake 0.3, ESLint 9.38).

## [0.1.2] - 2025-06-26

### Gewijzigd

* Het begrippenkader wordt automatisch gesynchroniseerd met de externe bron,
  zodat definities actueel blijven.

### Onder de motorkap

* Release-workflow aangepast: via een pull request in plaats van een push naar
  `main`.
* Diverse dependency-updates.

## [0.1.1] - 2025-06-18

### Gewijzigd

* Tekstuele aanpassingen aan de IAMA-teksten.

## [0.1.0] - 2025-06-02

### Gewijzigd

* Naam en introductietekst van de tool bijgewerkt.

## [0.0.013] - 2025-05-27

### Gewijzigd

* Nummering van de vragen gedetailleerder en consistenter gemaakt.
* Begrippenkader en datamodel bijgewerkt.

### Verwijderd

* Pre-scan: vragen over gebruikersgroepen verwijderd.

### Onder de motorkap

* Beschrijvingen toegevoegd aan de documentatiebestanden.
* Diverse dependency-updates.

## [0.0.12] - 2025-05-22

### Toegevoegd

* Vragen over bewaartermijn en omvang van de gegevensset.

## [0.0.11] - 2025-05-22

### Gewijzigd

* Rechtsgrond afgestemd op het datamodel.
* Diverse tekst- en lay-outverbeteringen.

### Onder de motorkap

* Aanvullende Product Decision Records (PDR's) toegevoegd.

## [0.0.10] - 2025-05-20

### Gewijzigd

* Pre-scan en DPIA kunnen nu ongeacht de namespace worden geüpload.

### Onder de motorkap

* Diverse dependency-updates.

## [0.0.9] - 2025-05-19

### Onder de motorkap

* Diverse dependency-updates.

## [0.0.8] - 2025-05-13

### Onder de motorkap

* Controle op kapotte links en op ontbrekende definities toegevoegd aan de CI.

## [0.0.7] - 2025-05-09

### Opgelost

* Diverse fouten hersteld.

## [0.0.6] - 2025-05-09

### Opgelost

* Diverse fouten hersteld.

## [0.0.5] - 2025-05-09

### Toegevoegd

* Fijnmazigere resultaten van de pre-scan.

## [0.0.4] - 2025-05-09

### Toegevoegd

* Pre-scan is verplicht bij beleid of wetgeving.

### Gewijzigd

* Homepagina en styling bijgewerkt.

### Onder de motorkap

* Contributing-bestanden en bekende beperkingen gedocumenteerd.

## [0.0.3] - 2025-05-08

### Onder de motorkap

* Releaseproces via Git-tags ingericht.

## [0.0.2] - 2025-05-08

### Onder de motorkap

* Releaseproces via Git-tags ingericht.

## [0.0.1] - 2025-05-08

### Toegevoegd

* Eerste versie van de invulhulp: een DPIA-formulier op basis van het NL Design
  System, met formulierlogica, voortgangsindicatie en navigatie.

### Onder de motorkap

* Projectopzet en eerste dependency-configuratie.

[Unreleased]: https://github.com/MinBZK/par-dpia-form/compare/v2026.8.25...HEAD
[2026.8.25]: https://github.com/MinBZK/par-dpia-form/releases/tag/v2026.8.25
[2026.8.24]: https://github.com/MinBZK/par-dpia-form/releases/tag/v2026.8.24
[2026.6.20]: https://github.com/MinBZK/par-dpia-form/releases/tag/v2026.6.20
[0.1.3]: https://github.com/MinBZK/par-dpia-form/releases/tag/v0.1.3
[0.1.2]: https://github.com/MinBZK/par-dpia-form/releases/tag/v0.1.2
[0.1.1]: https://github.com/MinBZK/par-dpia-form/releases/tag/v0.1.1
[0.1.0]: https://github.com/MinBZK/par-dpia-form/releases/tag/v0.1.0
[0.0.013]: https://github.com/MinBZK/par-dpia-form/releases/tag/v0.0.013
[0.0.12]: https://github.com/MinBZK/par-dpia-form/releases/tag/v0.0.12
[0.0.11]: https://github.com/MinBZK/par-dpia-form/releases/tag/v0.0.11
[0.0.10]: https://github.com/MinBZK/par-dpia-form/releases/tag/v0.0.10
[0.0.9]: https://github.com/MinBZK/par-dpia-form/releases/tag/v0.0.9
[0.0.8]: https://github.com/MinBZK/par-dpia-form/releases/tag/v0.0.8
[0.0.7]: https://github.com/MinBZK/par-dpia-form/releases/tag/v0.0.7
[0.0.6]: https://github.com/MinBZK/par-dpia-form/releases/tag/v0.0.6
[0.0.5]: https://github.com/MinBZK/par-dpia-form/releases/tag/v0.0.5
[0.0.4]: https://github.com/MinBZK/par-dpia-form/releases/tag/v0.0.4
[0.0.3]: https://github.com/MinBZK/par-dpia-form/releases/tag/v0.0.3
[0.0.2]: https://github.com/MinBZK/par-dpia-form/releases/tag/v0.0.2
[0.0.1]: https://github.com/MinBZK/par-dpia-form/releases/tag/v0.0.1
