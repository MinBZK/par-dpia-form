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
- `dist/components/content/icon/icon-registry.js` — de 371 geldige icoonnamen.

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

Een foutmelding is een eis waar de waarde niet aan voldoet, dus ze staat in een
`nldd-validation-list`. De koppeling loopt over `unmet` op het veld, dat de
id's noemt van de items die niet gehaald zijn:

```html
<nldd-form-field label="E-mailadres">
  <nldd-text-field :invalid="err ? true : undefined" :unmet="err ? 'emailError' : undefined" />
  <nldd-validation-list v-if="err">
    <nldd-validation-item id="emailError">{{ err }}</nldd-validation-item>
  </nldd-validation-list>
</nldd-form-field>
```

Zonder `unmet` krijgt het item `display: none` en is de melding onzichtbaar,
ook voor een screenreader: het veld krijgt dan geen `aria-describedby` naar de
tekst. Dat is gemeten, niet aangenomen. Een item zonder regel is de vorm voor
een fout die alleen de server kan vaststellen; een item mét `minlength`,
`match` of `required` laat het component zelf oordelen.

Schrijf de tekst als de eis, niet als de opdracht: "Minimaal 8 tekens", niet
"Gebruik minimaal 8 tekens". Dezelfde regel staat er vooraf als voorwaarde en
achteraf als wat er nog mis is.

Tot 0.8.84 ging dit over `error-message` plus `nldd-form-field-error-text`.
Allebei zijn weg; wie ze laat staan, krijgt een melding die permanent in beeld
staat of helemaal niet.

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
voorkeur via attributen, slots en `--semantics-*`-tokens; die lees je op de
host en ze cascaderen de shadow DOM in. Grijp nooit in de shadow DOM zelf.

`--components-*` is sinds 0.10.0 terug, maar niet als stuurknop: de laag bevat
alleen de handvol waarden die een thema per component zet (de accent-badge, de
statusbalk, het icoon van de accent-banner, de mention in de tekstverwerker en
het huidige tabblad). Een component leest alleen zijn eigen tokens. Wat je
daarbuiten op die namen zet, doet niets.

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
