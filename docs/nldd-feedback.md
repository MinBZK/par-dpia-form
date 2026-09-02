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
