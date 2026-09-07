# Terugkoppeling NLDD Design System

Wat we tijdens de overstap naar `@nldd/design-system` tegenkwamen en niet via
attributen of tokens konden oplossen. Deze lijst gaat vóór de merge langs het
NLDD-team: wat een issue verdient wordt ingediend, de rest vervalt.

Werkwijze: houd het concreet (versie, wat je verwachtte, wat er gebeurt, wat we
nu doen). Een regel verdwijnt hier zodra hij een issue heeft of achterhaald is.

Getest tegen `@nldd/design-system` 0.8.83, Chrome 151, licht en donker thema.

## Ingediend

- **[storybook#217](https://github.com/MinBZK/storybook/issues/217) —
  `nldd-timeline-track-cell` in een gemarkeerde `nldd-list-item`.** De trackkleur
  en `--components-list-item-is-highlighted-background-color` wijzen naar
  dezelfde primitive, dus het spoor boven de marker verdwijnt in het vlak
  (contrast 1.00 in beide thema's). We wachten de fix af.

## Nog in te dienen

- **`nldd-checkbox` en `nldd-radio-button` nemen alleen platte tekst als label.**
  Onze antwoordopties dragen begrippen-uitleg in hun label (opmaak, geen tekst),
  en die kan niet door de shadow-DOM-grens. Daardoor blijven radio's en
  checkboxes bij ons native inputs in light DOM, met eigen uitlijning. Gevraagd:
  een slot voor het label, of een gedocumenteerde route voor opmaak in een
  keuzelabel. Bijvangst: de JSDoc van `nldd-radio-button` toont een voorbeeld met
  een geslot label dat de template niet rendert.
- **`nldd-tooltip` toont alleen platte tekst.** De template rendert
  `${component.text}`; er is geen slot voor de inhoud. Onze begripsuitleg bevat
  een definitie plus "Toelichting" en "Voorbeeld(en)" als aparte regels met
  nadruk. Daarmee kunnen we het component niet gebruiken zonder die structuur te
  verliezen. Gevraagd: een content-slot (of een `nldd-popover`-variant die als
  tooltip te gebruiken is).
- **Geen component voor een gedefinieerd begrip.** Onze begrippenuitleg komt als
  gegenereerde HTML uit de YAML-bronnen en gaat via `v-html` het scherm op;
  daar kan geen component in staan. Wij tekenen de stippellijn, het paneel en
  het openen op hover én focus daarom zelf, met de DS-tokens voor oppervlak,
  rand en focusring. Gevraagd: een `nldd-definition`-achtig component, of een
  gedocumenteerd patroon (tokens + gedrag) voor een begrip in lopende tekst.
- **`nldd-sidebar-section` kan zijn sticky-gedrag niet uit.** De sidebar plakt en
  wordt op viewporthoogte gekapt, met een eigen scrollgebied als gevolg. Er is
  geen attribuut om dat uit te zetten; wij duwen nu `sticky-top` en
  `sticky-bottom` naar `-200dvh` om de kolom gewoon mee te laten scrollen.
  Gevraagd: `sticky="never"` of een `no-sticky`-attribuut.
- **Geen tag-vormige link.** Wij zetten bij een vraag een verwijzing naar
  art. 27 AI-verordening als klein gekaderd label. `nldd-tag` zegt expliciet
  "a tag is not interactive"; `nldd-token` is voor data die de gebruiker
  hanteert (dismiss/menu), en `nldd-link` heeft geen tag-vorm. Wij tekenen de
  vorm daarom zelf met de `--semantics-categories-accent-tinted-*`-tokens en
  `--components-tag-md-corner-radius`. Gevraagd: een `href` op `nldd-tag`, of
  een gedocumenteerde route voor een tag die ergens heen wijst.
- **Geen verticaal ellips-icoon.** Een kebab-menu is de standaardplek voor
  rij-acties, maar de iconenset heeft alleen de horizontale variant. Wij draaien
  hem 90 graden met CSS. Gevraagd: `ellipsis-vertical` in de registry.
- **`nldd-collection` verbergt items voorbij `max-items` ook zonder eigen
  "meer"-knop**, en `_visibleCount` wordt alleen in `connectedCallback` gezet.
  Wie zelf pagineert moet daardoor `max-items` op het totaal blijven zetten.
  Gevraagd: `max-items` los kunnen laten, of de waarde reactief maken.
- **`nldd-box` rekt niet mee in een grid, `nldd-card` wel.** Twee vlakken naast
  elkaar even hoog krijgen lukt met kaarten vanzelf en met boxen niet (de host is
  geen flex/grid-item dat groeit). Wij zetten `display: grid` op de host.
  Gevraagd: gelijk gedrag, of documenteer het verschil.
- **`nldd-menu` kan geen toegankelijke naam krijgen.** Het component heeft geen
  `accessible-label` (anders dan `nldd-menu-bar`, `nldd-menu-bar-item` en
  `nldd-icon-button`, die hem wel hebben), en zet zelf geen `aria-label` of
  `aria-labelledby` op zijn `role="menu"`. Wij zetten de naam nu op de knop die
  het menu opent; dat dekt de trigger, maar het menu zelf blijft naamloos.
  Gevraagd: `accessible-label` op `nldd-menu`, of documenteren dat de naam
  bewust van de trigger komt.
- **Geen favicon-variant van een icoon.** Elke applicatie heeft een
  tabbladpictogram nodig, en de logische bron is de iconenset van het systeem.
  De registry levert alleen een 24x24-pad met `currentColor`, bedoeld voor
  `nldd-icon`. Wij bouwen de tegel (Rijksblauw, ronde hoeken) en de
  16/32/48-varianten daarom zelf, inclusief een vereenvoudigde tekening voor
  16 pixels, want de gewone iconen lopen op die maat dicht. Gevraagd: per icoon
  een favicon-uitvoer (SVG-tegel plus meergrootte-ICO), of een gedocumenteerd
  recept met de juiste tegelkleur en marges.
- **`nldd-modal-dialog` geeft maar een deel van `nldd-inline-dialog` door.** De
  modal rendert intern een inline-dialog, maar spiegelt alleen `variant`,
  `icon`, `text`, `supporting-text` en `accessible-label`. `size="lg"`,
  `icon-color` en `heading-level` blijven onbereikbaar. Gevolg: het icoon is
  altijd 40px terwijl de titel `body-md-bold` blijft, dus in een bevestiging
  weegt het icoon zwaarder dan de vraag; en de titel blijft een `<p>`, dus de
  dialoog heeft geen kop voor een screenreader. Bij `variant="alert"` overrulet
  het component bovendien een eigen `icon`. Gevraagd: `size`, `icon-color` en
  `heading-level` doorgeven, of documenteren waarom niet.
- **Onduidelijk welke component-tokens buiten hun component bruikbaar zijn.**
  Nagemeten leveren de `--components-tooltip-*`-tokens buiten `nldd-tooltip`
  wel degelijk een correct paar (contrast 6.2 in licht, 9.9 in donker), maar
  dat staat nergens; je moet het uitproberen. Gevraagd: in de documentatie
  benoemen welke tokens los van hun component gebruikt mogen worden.
- **`nldd-navigation-split-view` meldt niet dat zijn inspector-sheet sluit.**
  De sheet is een native `<dialog>` in de shadow root. Sluit de gebruiker hem
  met Esc of een klik op de achtergrond, dan roept het component intern
  `hideInspectorSheet()` aan, maar er komt geen event naar buiten: `close` van
  een `<dialog>` bubbelt niet en passeert de shadow-grens dus niet. De
  consument die zelf bijhoudt of het paneel open is (nodig, want
  `showInspectorSheet()` moet je zelf aanroepen) loopt daardoor uit de pas:
  onze knop bleef "open" wijzen terwijl de sheet al weg was. We binden nu een
  listener rechtstreeks op de dialog in de shadow root - precies wat de
  richtlijn afraadt, maar er is geen andere weg. Gevraagd: een `close`- (en
  `open`-) event op de host, zoals `nldd-sidebar-section` die wel heeft.
- **`nldd-sidebar-section` laat de trigger aan de consument, maar zonder
  trigger is de inhoud onbereikbaar.** Onder de lg-grens vouwt de sidebar in
  een sheet; wie geen knop bouwt, heeft een inhoudsopgave die weg is en niet
  meer terugkomt. Dat is een makkelijke fout om te maken (wij maakten hem) en
  hij is stil: er is geen waarschuwing. Gevraagd: overwegen of het component
  bij een ontbrekende trigger zelf iets kan tonen, of anders in de
  documentatie expliciet waarschuwen dat de consument die knop *moet* leveren.
- **`nldd-button-bar` kan geen tweewegschakelaar bevatten, en kent maar twee
  varianten.** Wij wilden een opmerkingenknop en een bewerken/lezen-schakelaar
  als één werkbalkje. De bar tekent een eigen ondergrond met vaste hoogte en
  geeft `size`/`variant` alleen door aan `nldd-button` en `nldd-icon-button`.
  Een `nldd-segmented-control` erin houdt zijn eigen ondergrond én zijn
  geselecteerde vlak, wat als twee gestapelde oppervlakken leest; en
  `nldd-icon-button` heeft geen ingedrukte staat (alleen `expanded`, voor
  popups), dus de schakelaar kan ook niet uit losse knoppen bestaan. Daarbij
  styelt `button-bar.styles.js` alleen `accent-filled`/`primary` en
  `neutral-base`: een `variant="neutral-transparent"` wordt stil genegeerd en
  laat de divider in de verkeerde kleur staan. Wij tekenen die rij nu zelf.
  Gevraagd: ofwel een ingedrukte staat op `nldd-icon-button`, ofwel
  `nldd-segmented-control` als erkend kind van de bar (zonder eigen ondergrond),
  en documenteren welke varianten de bar echt ondersteunt.
- **`nldd-timeline-track-cell` in een gemarkeerde `nldd-list-item`: de ring en
  het nummer vechten om één token.** Een inhoudsopgave is een tijdlijn waarin
  één stap de huidige is, dus de rij krijgt `current` (donkere balk) en de cel
  `status="current"`. Twee botsingen: (1) de marker tekent zijn ring in
  `--context-parent-background-color`, die terugvalt op de paginakleur, dus op de
  donkere balk snijdt hij er een lichte halo uit — op te lossen door die token op
  de rij te zetten, maar dat moet je zelf bedenken; (2) de lijn en het cijfer ín
  de marker delen `--components-timeline-track-cell-color`, en die twee kunnen
  hier niet dezelfde waarde hebben. Gemeten (canvas, sRGB): de standaardwaarde
  geeft 7.76:1 op de markervulling maar 1.00:1 op de balk (lijn onzichtbaar);
  wit geeft 9.76:1 op de balk maar 1.26:1 op de vulling (cijfer onzichtbaar).
  Wij laten de lijn nu wegvallen achter de balk. Gevraagd: een eigen token voor
  de lijnkleur, los van de tekst in de marker — en overwegen of de cel
  `--context-parent-background-color` zelf van zijn rij kan overnemen.
  (3) De marker van de huidige stap is niet bij te sturen: zijn vulling komt uit
  `--_current-fill-color` en zijn cijfer uit `--_marker-content-color`, allebei
  private locals zonder `--components-*` erachter, en er zijn geen `part`-
  attributen in de template. Op een donkere rij zou wit logischer zijn dan het
  lichte accent — gemeten 9.76:1 tegen de balk versus 7.76:1 — maar dat kan
  alleen door die locals te overschrijven. Gevraagd: publieke tokens voor de
  vulling en de tekst van de marker, of `part`-attributen op marker en lijnen.

## Bespreekpunten met het team

Geen issues voor NLDD, maar keuzes die we met het team (en de inhoudelijke
eigenaren) moeten maken voordat we mergen.

- **Hoofdstuknummers in de inhoudsopgave: DPIA wel, IAMA niet.** In
  `sources/iama.yaml` staat op elk hoofdstuk `is_official_id: false`, wat
  betekent "dit nummer komt niet uit het officiële rapportagemodel"; de
  inhoudsopgave laat het nummer dan weg. De IAMA-hoofdstukken heten bovendien
  "Deel 1 - Waarom?" tot "Deel 5 - Afsluiting", dus het nummer zit al in de
  titel. Drie richtingen:
  1. laten zoals het is - eerlijk, maar de IAMA-tijdlijn bestaat dan uit
     identieke stippen zonder oriëntatiepunt;
  2. in de inhoudsopgave altijd 1..n nummeren als pure navigatie, en de
     officiële nummering in de vraaglabels laten (waar `prefixQuestionIds` hem
     al zet) - bij het IAMA staat het deelnummer dan twee keer;
  3. de bron aanpassen: is "Deel 1..5" de officiële indeling van IAMA v2.0, zet
     dan `is_official_id: true` en haal "Deel N -" uit de titel.

  Voorkeur van dit team: 3, met 2 als terugval. Vraag uitstaand bij de
  inhoudelijke eigenaren van het IAMA.

## Opgelost of vervallen

(nog leeg)
