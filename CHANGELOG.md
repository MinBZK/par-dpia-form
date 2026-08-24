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

### Beveiliging

* Op de startpagina van het standalone formulier staat nu "Wis alle opgeslagen
  gegevens", die verschijnt zodra er iets in je browser is opgeslagen en zegt om
  welke invulhulpen het gaat. Handig op een gedeelde of openbare computer.
* De knop "Begin nieuwe..." in een invulhulp vraagt eerst om bevestiging, en
  noemt daarbij hoeveel antwoorden je kwijtraakt. Die knop wiste eerder alles in
  één klik. Dit geldt voor de pre-scan, de DPIA en de IAMA.
* Verzoeken naar routes die alleen een paar velden verwachten worden niet
  langer tot 25 MB ingelezen. Alleen het opslaan van een assessment, waar
  afbeeldingen in kunnen zitten, houdt die ruimte, en die is verruimd naar
  50 MB.
* Wordt een assessment toch te groot om op te slaan, dan zegt de melding nu
  waar het meestal aan ligt en wat je eraan kunt doen, in plaats van een
  technische foutcode.
* `/.well-known/security.txt` verwijst niet langer met een redirect naar het
  bestand van het NCSC, maar wordt nu zelf gehost, met een eigen
  beleidsverwijzing naar `SECURITY.md`. Het NCSC blijft het meldpunt voor
  kwetsbaarheden; wie liever via GitHub meldt kan dat nu ook rechtstreeks bij
  dit team, via private vulnerability reporting.
* De server bepaalt nu aan het adres van de directe verbinding of die van de
  eigen proxy komt, in plaats van af te gaan op het aantal tussenstations. Een
  bezoeker kan zich daarmee niet meer voordoen als iemand anders door zelf
  door-stuur-informatie mee te sturen, en de limiet op het aantal verzoeken
  blijft tellen per echte bezoeker.

### Gewijzigd

* Wie een vraag heeft, vindt nu op één plek waar die thuishoort: `SUPPORT.md`
  beschrijft per soort vraag het kanaal, van gebruik en bugs tot een melding
  over omgangsvormen. De startpagina van de repository verwijst er direct naar.
* Alle contactadressen wijzen nu naar dezelfde rol-mailbox
  (digigilde@rijksoverheid.nl), waaronder die in de privacyverklaring en de
  toegankelijkheidsverklaring.
* De IAMA-tekst benoemt samenwerking nadrukkelijker.
* Lange lijsten en overzichten laden nu in delen in plaats van in één
  keer, met een "Meer laden"-knop waar dat helpt. Zo blijven de
  projecten-, leden-, assessment- en versiegeschiedenislijst en lange
  opmerkingdiscussies ook bij honderden of duizenden regels vlot en
  volledig laden.
* Het terugkijken van een eerdere versie gaat merkbaar sneller: een al
  eerder opgebouwde versie wordt hergebruikt in plaats van opnieuw
  samengesteld.
* De invulhulp laadt sneller op een trage verbinding: pagina's, scripts en
  antwoorden gaan nu gecomprimeerd over de lijn.
* Afbeeldingen die je toevoegt worden op een hogere resolutie bewaard
  (tot 2400 bij 1800 in plaats van 1200 bij 900). Diagrammen en
  architectuurplaten blijven daardoor scherp, ook als je inzoomt of ze in de
  PDF terugziet.

### Opgelost

* Verwijderde je de eerste van twee herhaalbare groepen zonder de overgebleven
  groep in te vullen, dan stond die na opnieuw openen weer als de eerste groep
  genummerd. Verwees er iets naar, bijvoorbeeld een bijbehorende partij in een
  andere sectie, dan schoof die verwijzing mee. De groep houdt nu het nummer
  dat hij had.
* Loste een collega een opmerking op terwijl jij er een reactie bij aan het
  typen was, dan verdween de hele opmerking uit beeld en was je tekst weg.
  De opmerking blijft nu staan zolang je er iets openstaan hebt, met een
  regel erboven dat een collega hem heeft opgelost. Je tekst blijft staan.
* Ging je naar een ander assessment op het moment dat een collega net iets in
  hetzelfde assessment had opgeslagen, dan kon de DPIA die je verliet stilletjes
  zijn pre-scan-antwoorden kwijtraken. Er was niets aan te zien: de DPIA zelf
  bleef compleet, alleen de overgenomen antwoorden uit de pre-scan waren weg,
  ook na opnieuw laden. Een assessment dat je hebt verlaten slaat nu niets meer
  op. Wat je vlak voor het weggaan nog wijzigde, wordt in dat geval dus niet
  bewaard; je ziet dat bij terugkomst en kunt het opnieuw invullen.
* Lukte het niet om een opmerking te plaatsen, te beantwoorden, te bewerken,
  te verwijderen of op te lossen, dan gebeurde er zichtbaar niets: de knop
  reageerde, maar je hoorde nooit dat het mislukt was. Je krijgt nu een
  melding, met een knop om het opnieuw te proberen wanneer dat kan helpen.
  Bij een verlopen bevoegdheid of een inmiddels verwijderde opmerking staat
  er wat er aan de hand is, zonder zinloze herhaalknop.
* De bevestiging bij "Start nieuwe..." op de startpagina van het standalone
  formulier sluit nu ook met Escape, houdt de toetsenbordfocus binnen het
  venster en geeft die daarna terug aan de knop die hem opende.
* Opmerkingen die bij vragen vlak onder elkaar horen, schoven over elkaar
  heen zodra er een wat langere opmerking tussen zat. Daardoor viel een deel
  van de tekst weg en waren "Reageren", "Verwijderen" en "Oplossen" niet meer
  aan te klikken. Opmerkingen schuiven nu netjes onder elkaar door; ze staan
  dan iets lager dan hun vraag, maar blijven volledig leesbaar en bruikbaar.
* In de PDF- en Markdown-export stond bij DPIA-hoofdstuk 13 (Doelbinding) in
  plaats van je antwoord een lap opmaakcode die begon met `<span class=`. Het
  antwoord staat er nu gewoon als tekst. Bestaande DPIA's worden bij het openen
  automatisch bijgewerkt, dus ook eerder ingevulde antwoorden exporteren weer
  goed.
* De vervolgvraag "Specificatie van het wetsartikel" in hoofdstuk 13 verscheen
  nooit, ook niet na het kiezen van "Toelaatbaar op grond van Unie- of
  lidstaatrechtelijk recht". Die vraag komt nu wel op.
* Ben je aan een project toegevoegd op een e-mailadres dat je daarna bij de
  inlogdienst hebt gewijzigd, dan zag je dat project na het inloggen niet staan.
  Er bestonden dan twee accounts voor één persoon. Die worden nu samengevoegd
  zodra je inlogt; rollen die je al had veranderen niet.
* Een mislukte poging om je werk op te slaan of om de wijzigingen van
  collega's op te halen verdween stilletjes: je zag niets, terwijl je
  laatste tekst niet opgeslagen was of je naar een verouderde versie zat
  te kijken. Allebei melden nu, maar pas als het langer duurt dan een
  enkele hapering. Opslaan probeert het bovendien vanzelf opnieuw, met een
  knop om er niet op te hoeven wachten, en het sluiten van het tabblad
  levert een waarschuwing op zolang er nog iets niet is opgeslagen.
* Meldingen onderaan het scherm braken hun tekst af terwijl er ruimte naast
  stond, en waren op een telefoon onnodig smal. Ze gebruiken nu de
  beschikbare breedte.
* De verwijzingen naar het Model DPIA Rijksdienst wezen naar een verlopen
  KCBR-URL die een foutpagina toonde; ze verwijzen nu naar de actuele
  locatie van het model.
* Het standalone formulier op `/zonder-account/` toonde in productie
  "ontwikkel" met een commit in plaats van de release-versie; het laat nu
  dezelfde versie zien als de statuspagina.
* Was je aan een project toegevoegd met een e-mailadres dat bij de inlogdienst
  anders geschreven stond (hoofdletters), dan zag je dat project na het inloggen
  niet staan en kreeg je een tweede, leeg account. Adressen worden nu eenduidig
  vergeleken.
* Een tekstlabel in de DPIA bevatte een schrijffout.
* Een lege versiebeschrijving kon een nieuwe versie aanmaken zonder
  wijziging; dat kan niet meer.
* Een opgeloste opmerking kon kort daarna weer als openstaand tevoorschijn
  komen. Dat gebeurde wanneer je precies oploste terwijl de invulhulp
  achtergrondgegevens ophaalde: die iets oudere gegevens overschreven je
  wijziging. Hetzelfde gold voor een nieuwe reactie of een aanpassing van
  een opmerking. Wat je zelf doet gaat nu altijd voor.
* Een reactie van een collega kwam pas in beeld zodra er ook iets aan de
  hoofdopmerking veranderde. Reacties verschijnen nu direct, en een
  discussie die je voor het eerst te zien krijgt komt meteen compleet met
  alle bestaande reacties binnen.

### Beveiliging

* De API controleert nu elk verzoek voordat het wordt uitgevoerd: onbekende
  of te lange invoer, een ongeldig project- of assessment-adres en een
  onleesbare datum leveren een nette foutmelding in het Nederlands op in
  plaats van een serverfout. Ook gelden bij het wijzigen van een project
  dezelfde lengtegrenzen voor naam en omschrijving als bij het aanmaken.
* Alleen een eigenaar kan nog een nieuwe versie afdwingen. Een bewerker kon dat
  eerder ook, zolang hij geen omschrijving meestuurde, en zo ongelimiteerd lege
  versies aanmaken.
* Het tijdstip waarop een opmerking is afgehandeld, wordt door de server
  bepaald en niet meer door de browser meegestuurd.
* De weergave van opgemaakte tekst is verder dichtgezet met Trusted Types
  en een centrale opschoonstap, zodat er geen onveilige HTML in de pagina
  terecht kan komen.
* Het standalone formulier draait nu zonder `unsafe-inline` in de
  Content-Security-Policy; scripts en stijlen worden per build op hun
  vingerafdruk toegelaten.
* Aanvullende beveiligingsheaders op de webserver, en de toegangscontrole
  op projecten en assessments is aangescherpt.
* Bij uitloggen worden nu ook de niet-opgeslagen antwoorden en de laatst
  bekeken sectie van assessments uit de browser gewist. Op een gedeelde of
  publieke computer kan de volgende gebruiker die gegevens dus niet meer
  terugzien.
* Inloggen is strenger gecontroleerd: alleen een echt toegangsbewijs met een
  geldige vervaltijd wordt geaccepteerd, en de sleutels van de inlogdienst
  worden uitsluitend over een beveiligde verbinding opgehaald.
* Een e-mailadres dat de inlogdienst niet heeft bevestigd kan zich niet meer
  aan een account koppelen. Zo kan iemand die zich op jouw adres registreert
  niet het project overnemen waaraan jij was toegevoegd.
* Ook de pre-scan-antwoorden die bij een DPIA worden meegeladen gaan nu langs
  dezelfde controle als de gewone antwoorden.
* Een geïmporteerd bestand kan geen antwoorden meer binnensmokkelen die je
  niet zelf hebt ingevuld. Bestanden met veldnamen die geen vraagnummer zijn
  worden voortaan geweigerd in plaats van gedeeltelijk ingelezen.
* Afbeeldingen in een geïmporteerd bestand worden strenger gecontroleerd. Staat
  er een beeldformaat in dat de invulhulp niet opslaat, dan wordt het bestand
  geweigerd met een melding, in plaats van de afbeelding stil weg te laten.

### Onder de motorkap

* `GOVERNANCE.md` beschrijft wie de invulhulp onderhoudt, hoe besluiten tot stand
  komen en wanneer een wijziging door een tweede persoon wordt bekeken. Ook staat
  er waarom de inhoud van de assessments niet in deze repository wordt bepaald.
* Het metadatabestand `publiccode.yaml` heet nu `publiccode.yml`, de naam waar
  open-sourcecatalogi op zoeken, en noemt de laatste uitgebrachte versie.
* De repository is getoetst aan de Standard for Public Code, de gids voor open
  source in de publieke sector. De uitkomst staat per criterium in
  `docs/standard-for-public-code.md`, inclusief de punten die nog open staan en
  de keuze om de documentatie Nederlandstalig te houden.
* De linkcontrole sloeg alle verwijzingen tussen documenten in de repository
  over, waardoor kapotte links in de Product Decision Records ruim een jaar
  onopgemerkt bleven. Die uitzondering is weg en de kapotte links zijn
  hersteld; de map `docs/PDR` bestond bovendien in twee schrijfwijzen, wat op
  Linux twee losse mappen opleverde.
* De linkcontrole controleert `open.overheid.nl` en de eigen schema-URL's weer,
  nu de certificaatketen daar aan de kant van Logius is hersteld.
* De verwijzingen naar het meldpunt van het NCSC, in `SECURITY.md` en in
  `/.well-known/security.txt`, wezen naar verplaatste pagina's. Ze gaan nu
  rechtstreeks naar de huidige, en dat bestand wordt voortaan meegenomen in de
  linkcontrole.
* Het formaat van veld-identificatiecodes (waarmee de bewerkgeschiedenis en het
  herstellen van één antwoord werken) stond in vier losse kopieën, elk met een
  eigen reguliere expressie. Er is nu één implementatie per pakket, en een test
  bewaakt dat de kopie in de backend gelijk blijft aan die van de invulhulp.
* De ontwikkelinstructies voor knoppen beschreven nog de oude RVO-klassen, die
  sinds versie 4.16 van de componentenbibliotheek niet meer bestaan. Bijgewerkt,
  zodat er geen ongestileerde knoppen meer uit voortkomen.
* De wekelijkse beveiligingsscan keek alleen naar de acceptatie-omgeving en niet
  naar productie, terwijl juist die maandenlang stil kan staan en zo nieuwe
  meldingen verzamelt. Beide omgevingen worden nu gescand en apart gerapporteerd.
* De containerimages staan niet langer onder een pad met `dev` in de naam. Dat
  suggereerde een ontwikkelomgeving, terwijl er juist productie uit werd
  gedraaid.
* Een release wordt nu uitgebracht via een workflow die eerst alle controles
  draait en de versietag pas zet als die slagen. Eerder viel een misser pas op
  nadat de tag er stond, en moest die weer worden weggehaald en opnieuw gezet.
* De assessments-plugin voor ontwikkelaars volgt nu dezelfde CalVer als de
  applicatie zelf, in plaats van een eigen versienummer dat sinds de eerste
  versie was blijven staan. Het versienummer staat nog op één plek en wordt bij
  het uitbrengen van een release meegezet; de release stopt als plugin en tag
  niet overeenkomen.
* De API-container bevat geen pakketbeheerders meer. Die waren alleen nodig om
  de container te bouwen en bleven daarna achter, inclusief hun eigen bekende
  kwetsbaarheden die bij elke scan opnieuw werden gemeld.
* Containerimages worden nu bij elke pull request gescand, en een kwetsbaarheid
  waarvoor een oplossing bestaat blokkeert de merge. Het image dat gescand is,
  is ook het image dat wordt gepubliceerd en uitgerold: er wordt niet opnieuw
  gebouwd na de scan. Wekelijks worden de draaiende images bovendien volledig
  doorgelicht, en wat een oplossing heeft komt in een issue te staan in plaats
  van alleen in een tabblad.
* Een preview-omgeving wordt niet meer voor elke pull request opgezet, maar
  alleen wanneer er een `preview`-label op staat. Dat scheelt geheugen,
  processorkracht en databaseverbindingen op het gedeelde platform.
* Bij het uitbrengen van een release wordt het image dat naar productie gaat
  nog een keer gescand. Promotie bouwt niets opnieuw, dus dit houdt de release
  niet tegen; het laat zien wat er op dat moment bekend is.
* De databaseverbindingen van de API zijn expliciet begrensd en krijgen
  time-outs, zodat een vastgelopen query de rest niet blokkeert. Bij een
  nieuwe versie van de applicatie worden lopende verzoeken netjes
  afgerond in plaats van afgebroken.
* Het aantal verzoeken per minuut is nu instelbaar zonder nieuwe release en
  telt per ingelogde gebruiker. Collega's op één kantoornetwerk delen dus
  geen limiet meer; alleen verzoeken zonder geldig toegangsbewijs tellen
  nog per IP-adres.
* De identiteit van een ingelogde gebruiker wordt kortstondig onthouden,
  zodat pollende clients niet elke keer dezelfde opzoeking doen.
  Autorisatie wordt onveranderd per verzoek getoetst.
* Preview-omgevingen per pull request werkten niet meer doordat het
  platform de standaard hostnaam-indeling wijzigde; die is nu expliciet
  vastgelegd.
* Preview-omgevingen en de acceptatie-omgeving gaan na vier uur zonder
  nieuwe uitrol in slaapstand. Wie de link daarna opent, krijgt eerst een
  pagina met een startknop en wacht op een koude start; daarna blijft de
  omgeving weer vier uur wakker. Productie doet hier niet aan mee. Zo
  houden we geen rekenkracht bezet voor omgevingen die niemand gebruikt.
  Vastgelegd in `docs/deployment.md`.
* De nginx-configuratie van de frontend is gebundeld in
  `containers/frontend/nginx/`.
* Het uitwisselformaat van assessmentgegevens ligt strakker vast: alleen de
  beschreven velden worden nog opgeslagen. Velden uit een oudere versie van
  het formaat worden daarbij weggelaten in plaats van geweigerd, zodat een
  bestaand assessment gewoon te bewerken blijft.
* CI aangescherpt: minimale rechten voor tokens, controle op de integriteit
  van de lockfile, een bewaking tegen nieuwe ongecontroleerde `v-html` en
  robuustere linkcontrole.
* Diverse dependency- en container-updates.
* De bewaking tegen nieuwe ongecontroleerde `v-html` is verder aangescherpt:
  ze scant nu het hele bestand in plaats van regel voor regel (dus ook een
  binding die over meerdere regels loopt, of via `v-bind="{ innerHTML: ... }"`
  of zonder aanhalingstekens), controleert ook raw `innerHTML`/`outerHTML`/
  `insertAdjacentHTML` in `.ts`-bestanden, en neemt het standalone formulier
  mee (dat draait allang niet meer met `unsafe-inline`). Ook wordt voortaan
  de body van de onderliggende `computed` meegehasht, zodat het onopgemerkt
  verwijderen van de opschoonstap uit een al goedgekeurde binding CI alsnog
  laat falen.

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

[Unreleased]: https://github.com/MinBZK/par-dpia-form/compare/v2026.6.20...HEAD
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
