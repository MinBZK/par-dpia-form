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
- **`nldd-sidebar-section` kan zijn sticky-gedrag niet uit.** De sidebar plakt en
  wordt op viewporthoogte gekapt, met een eigen scrollgebied als gevolg. Er is
  geen attribuut om dat uit te zetten; wij duwen nu `sticky-top` en
  `sticky-bottom` naar `-200dvh` om de kolom gewoon mee te laten scrollen.
  Gevraagd: `sticky="never"` of een `no-sticky`-attribuut.
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
- **Component-tokens van het ene component werken niet in een ander.** De
  `--components-tooltip-*`-tokens leveren buiten `nldd-tooltip` wit op lichtgrijs,
  omdat achtergrond en tekstkleur alleen binnen dat component op elkaar zijn
  afgestemd. Gevraagd: in de documentatie benoemen welke tokens buiten hun
  component bruikbaar zijn.

## Opgelost of vervallen

(nog leeg)
