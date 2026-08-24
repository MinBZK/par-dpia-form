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

### Onder de motorkap

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

[Unreleased]: https://github.com/MinBZK/par-dpia-form/compare/v2026.8.24...HEAD
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
