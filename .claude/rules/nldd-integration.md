# NLDD in een Vue-SPA

De componenten van `@nldd/design-system` zijn Lit web components met een shadow
root. Deze repo rendert ze vanuit Vue-templates. De officiële `nldd`-skill is
op client-side apps geschreven en dekt dat grotendeels; wat hieronder staat is
wat we in *deze* repo zijn tegengekomen en niet uit die referentie volgt.

Zusterproject: Wies (`~/wies`) gebruikt hetzelfde design system server-gerenderd
met htmx. De lessen daar over swap-timing (`await el.updateComplete` voor
`show()`, `href` naast `hx-get`) gelden hier niet — Vue kent die swap-grens niet.
Wat wél overdraagbaar is, staat hieronder.

## Importeren: per component, niet de hele bundle

Wies vendort `nldd.min.js` als één `<script>`-tag, want daar is geen bundler.
Hier is Vite er wel, dus importeer per component:

```ts
import '@nldd/design-system/button'
import '@nldd/design-system/form-field'
```

Eén `import '@nldd/design-system/styles'` per app laadt `global.css` — de
variant *met* `rijksoverheid-fonts.css`. Er bestaat ook `styles/system-font`
zonder RijksSans (het font is licentiebeperkt tot Rijksoverheidspublicaties,
zie `NOTICES.md`); die willen we hier niet, anders valt de huisstijl terug op
`system-ui`.

## Namen en attributen niet raden

Een onbekende icoonnaam rendert **stil niets**, een onbekende `variant` valt
terug op de default, en een attribuut dat niet bestaat wordt genegeerd zonder
waarschuwing. De naam die logisch klinkt is vaak net niet de echte
(`edit` → `pencil`, `tertiary` → `neutral-transparent`).

Twee bronnen die niet kunnen liegen, allebei in het geïnstalleerde package:

- `custom-elements.json` — per component alle attributen, slots en events.
- `dist/components/content/icon/icon-registry.js` — de 353 geldige icoonnamen.

```js
// alle geldige icoonnamen
const { iconRegistry } = await import('@nldd/design-system/dist/components/content/icon/icon-registry.js')
console.log([...iconRegistry.keys()])
```

Niet gissen in de geminificeerde bundle.

### `accessible-label` bestaat niet op elk component

`nldd-menu-bar`, `nldd-menu-bar-item` en `nldd-icon-button` hebben het;
**`nldd-menu` niet** — daar wordt het genegeerd en belandt het nergens in de
shadow DOM. Het menu ontleent zijn naam aan de trigger die het opent, dus zet
het label daar (`text` of `accessible-label` op de knop).

## Formuliervalidatie koppelt zichzelf niet

De foutweergave werkt op `invalid` op het veld **plus** `error-message` met de
id van de fouttekst:

```html
<nldd-form-field label="E-mailadres">
  <nldd-text-field :invalid="err ? true : undefined" error-message="emailError" />
  <nldd-form-field-error-text id="emailError">{{ err }}</nldd-form-field-error-text>
</nldd-form-field>
```

Zonder `error-message` krijgt de melding **hoogte 0** en is ze onzichtbaar —
ook voor een screenreader, want `nldd-form-field` zet dan geen
`aria-describedby`. Dat is gemeten, niet aangenomen. `error-message` staat niet
in `custom-elements.json` (het is geen property), maar `nldd-form-field` leest
het wel degelijk uit het DOM-attribuut.

## Gebruik wat het DS al heeft

Voor je eigen CSS schrijft: bestaat er een component voor?

- **Formulierritme**: `nldd-form` zet de verticale gaps zelf, met container
  queries en een `:has()`-guard zodat verborgen velden geen ruimte innemen.
  Eigen `margin-block-end` op `nldd-form-field` doet dat allemaal niet.
  Zet je eigen `<form>` als direct kind van `nldd-form` — dan spiegelt het
  component de attributen in plaats van Vue's nodes te verplaatsen.
- **Afstand en kolommen**: `nldd-container`, `nldd-spacer`, `nldd-box`.
- **Lijsten en tabellen**: `nldd-list`, `nldd-table` en de cellen.

Een eigen media query voor een mobiele variant is bijna altijd een teken dat je
het verkeerde component gebruikt.

## Eigen CSS op een `nldd-*` element

Mag, maar alleen met een comment erboven die uitlegt **waarom het component het
zelf niet kan** (render-timing, shadow-DOM-grens, of een gat in het DS). Lukt
die zin niet, dan is het smaak-styling en hoort de regel weg. Stuur bij
voorkeur via attributen, slots en `--components-*`-tokens; die lees je op de
host en ze cascaderen de shadow DOM in. Grijp nooit in de shadow DOM zelf.

Kan iets écht niet via die weg, noteer het in [`docs/nldd-feedback.md`](../../docs/nldd-feedback.md)
in plaats van er stil omheen te werken.

## Kleur: controleer in beide thema's

`--semantics-*` en `--primitives-color-*` zijn `light-dark()`-paren; alleen
`--primitives-color-reference-*` staat vast. Een hardcoded hex ziet er in het
lichte thema goed uit en breekt pas in het donkere.

Let op de fallback in `var(--token, #eef7fb)`: die hex is *niet* themabewust en
slaat aan zodra de tokennaam een typefout heeft — een niet-bestaand token is
geldige CSS. Meet contrast met canvas-rasterisatie, niet met een regex op
`rgb()`: het DS levert `oklch()` en een regex meet dan stilletjes niets.
