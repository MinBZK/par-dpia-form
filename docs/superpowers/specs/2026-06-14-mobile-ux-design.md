# Mobile-UX voor de boekhouding-frontend — ontwerp

- **Datum:** 2026-06-14
- **Status:** goedgekeurd (brainstorm), klaar voor implementatieplan PR1
- **Branch:** `worktree-feat+48-mobile-ux` (P1); P2/P3 op nieuwe branches
- **Voorgeschiedenis:** voortzetting van de Forgejo-branch `feat/48-mobile-ux`. Het netto CSS-werk daarvan (responsive header + 44px tap-targets, NeRDS-geverifieerd) is al gecommit op deze branch (`feat(mobile-ux): responsive header/form-layout met toegankelijke tap-targets`). De oudere backend-/tooling-commits van die branch zaten al op main via #283 en zijn bewust niet overgenomen.

## 1. Doel en context

De app (Pre-scan/DPIA/IAMA-invulhulpen, Vue 3 + RVO component library) is desktop-first gebouwd met een dunne mobiele retrofit. Ambtenaren gebruiken hem steeds vaker op tablet/telefoon. Doel: de app **mobiel-gereed** maken — eerst de echte WCAG-conformiteitsfouten wegnemen, daarna de lay-out-patronen die een telefoon vragen, daarna de structurele/cross-cutting zaken.

Styling-conventie van het project: **geen `<style scoped>`**; alle styling staat in `apps/boekhouding-frontend/src/assets/app.css` (frontend) en `packages/assessment-core/src/assets/base.css` (gedeeld met de standalone, wordt geïnlined). RVO design-tokens zijn gescoped op `body.rvo-theme`.

## 2. Audit-samenvatting

Een statische audit (10 surfaces, 58 bevindingen, NeRDS-/WCAG-gegrond, adversarieel geverifieerd) gaf als verdict: niet mobiel-gereed, maar de ergste gaten clusteren in een handvol gedeelde regels. Dominante problemen:

- **WCAG 1.4.10 Reflow (horizontale overflow @360px):** vaste-breedte tabellen (leden, versiegeschiedenis, diff, conflict) en RVO multi-koloms grids die op telefoon geforceerd meerdere kolommen blijven; de kebab-dropdown loopt over de rechterrand (één gedeelde oorzaak, 4 plekken); de aiv-begrip-tooltip heeft `min-width:500px`.
- **WCAG 2.5.5 Target Size (AAA, het doel dat het team elders al koos):** diverse bedieningselementen <44px (member-select/delete, comment-acties, sync-toast, "Nieuw project", "Leden beheren").
- **Dialogs** wrappen/scrollen niet en verspillen ruimte op telefoon.
- **iOS zoom-on-focus** bij selects met font <16px.

De completeness-critic vond bovendien cross-cutting gaten buiten de 10 surfaces (zie §6, PR3): geen 404-route, geen skip-link, FileUpload/ImageField leunen op drag-drop (bestaat niet op touch), `100vh` i.p.v. `100dvh`, globale input-font, en de formele 200%/400% zoom-reflow test.

## 3. Vastgelegde responsive-patronen (huisstijl, geldt over alle PR's)

Deze keuzes zijn met de visuele companion gemaakt en gelden consistent waar het patroon terugkeert:

| Surface | Patroon | Toelichting |
|---|---|---|
| Databeheer-tabellen (leden, versiegeschiedenis) | **Kaart per rij** | Elke rij → kaart; primaire waarde prominent, rol/actie eronder. Sluit aan op het bestaande `AssessmentCard`-idioom. |
| Vergelijkingstabellen (conflict, diff) | **Gestapelde vergelijkingskaart** | Per veld een kaart: "jouw versie" (blauw) bóven "hun versie" (oranje), met twee grote keuzeknoppen. Geen zijscroll; kleur onderscheidt de bron. |
| Comments op telefoon | **Bottom-sheet per veld** | Tik de comment-badge van een veld → sheet schuift omhoog met júist die thread; het veld blijft zichtbaar erboven. Vervangt de huidige "platte lijst onder het formulier". |
| RVO multi-koloms grids | **1 kolom op telefoon** | `--two` en (in P2) `--three` collapsen op smalle viewports. |

## 4. Routekaart (3 PR's)

Elke PR krijgt een eigen spec → plan → implementatie-cyclus. P1 → P2 → P3.

- **PR1 — CSS-only conformiteit** (deze branch). Alleen `app.css` + `base.css`, geen template-wijzigingen. Detail in §5.
- **PR2 — Responsive patronen** (nieuwe branch, component/template-werk). De vastgelegde patronen implementeren: ledentabel + versiegeschiedenis → kaart per rij; conflict/diff → gestapelde vergelijkingskaart; **comment-panel → bottom-sheet per veld**; LandingPage `--three` grid; kebab JS edge-detection (links uitlijnen i.p.v. de CSS-mitigatie uit P1); empty-states; FRIA-tag/toggle-herschikking; repeatable add/delete-knopgroottes.
- **PR3 — Structureel/cross-cutting** (nieuwe branch). 404-route; skip-link (WCAG 2.4.1); FileUpload/ImageField touch-affordance (drag-drop → tikbare knop + camera-capture); `100vh`→`100dvh`; PDF-export feedback/haalbaarheid op telefoon; formele 200%/400% zoom-reflow testronde en fixes.

## 5. PR1 — detailspec (CSS-only conformiteit)

Doel: de goedkope, geverifieerde WCAG-fouten wegnemen zonder template-wijzigingen. Alle wijzigingen in `apps/boekhouding-frontend/src/assets/app.css` tenzij anders vermeld. Bestaande breakpoints in de file: 480px (header), 551/552px (RVO grid-grens), 560px (tap-targets/fieldset), 768px (comment-panel/editor-kolom). We sluiten daarbij aan i.p.v. nieuwe breakpoints te verzinnen.

1. **Kebab-dropdown overflow** — `.kebab-menu__dropdown` (`right:0; min-width:14rem`). Voeg toe: `@media (max-width:560px){ .kebab-menu__dropdown{ min-width:auto; max-width:calc(100vw - 1rem); } }`. Lost de overflow in 4 surfaces tegelijk op. *WCAG 1.4.10.*
2. **aiv-begrip-tooltip** — `base.css` `.aiv-definition .aiv-definition-text` (`min-width:500px`). Cap op telefoon: `@media (max-width:560px){ min-width:auto; max-width:calc(100vw - 2rem); }`. Gedeeld → werkt ook in de standalone (geïnlined). *WCAG 1.4.10 / 1.4.4.*
3. **RVO 2-koloms grids → 1 kolom** — globale regel in app.css: `@media (max-width:551px){ .rvo-layout-grid-columns--two{ grid-template-columns:1fr; } }`. Dekt ProjectDetail + de assessment-kaartgrids. (`--three` van de LandingPage is P2.) *WCAG 1.4.10.*
4. **Tap-target-sweep ≥44px** — uitbreiden van het bestaande `@media (max-width:560px)`-blok (raak alleen sizing aan, geen gedrag):
   - `.member-select` + `.member-delete`: hoogte 2rem → 2.75rem; haal `white-space:nowrap` van `.member-delete` zodat "Verwijderen" wrapt i.p.v. clipt.
   - `.comment-action-btn`: `min-height:44px` (+ wat padding).
   - `.sync-toast__action`: `min-height:44px; white-space:normal`.
   - "Leden beheren"-knop: `.project-detail-header .utrecht-button { min-width:44px; min-height:44px }`.
   - "Nieuw project"-knop (`ProjectList.vue`): via zijn class/selector naar `min-height:44px`.
   *WCAG 2.5.5 (AAA), conform het doel dat elders in deze stylesheet al gehanteerd wordt.*
5. **Dialogs: wrap + scroll + padding** — uitlijnen met het bestaande core-patroon (`base.css` `.confirm-delete-dialog__*`):
   - `.confirm-dialog__actions` en `.start-dialog__actions`: `flex-wrap:wrap`.
   - `.confirm-dialog__content`: `max-height:80vh; overflow-y:auto` (in P3 evt. → `dvh`).
   - Dialog-padding op `@media (max-width:560px)`: 2rem → ~1.25rem voor `.confirm-dialog__content` en `.start-dialog__content`.
   *WCAG 1.4.10.*
6. **sync-toast mobiel** — `@media (max-width:560px){ .sync-toast{ flex-direction:column; align-items:stretch; max-width:calc(100vw - 1rem); } }`. *WCAG 1.4.10.*
7. **iOS zoom-on-focus** — selects die nu `sm` (14px) zijn → `font-size:16px` op mobiel (bv. `.member-select` en de form-selects via hun app.css-selector). RVO text-inputs zijn al `md` (16px) en blijven ongemoeid; alleen de sub-16px selects worden gelijkgetrokken. *UX (iOS Safari).*

**Bewust NIET in PR1** (→ PR2, want template-werk): de ledentabel en versiegeschiedenis-tabel zelf (kaart-per-rij vergt kleine template-aanpassingen zoals naam/e-mail splitsen en rol-label), de conflict/diff-tabellen, en het comment-bottom-sheet. PR1 brengt deze surfaces dus op tap-target- en grid-niveau op orde, maar de volledige tabel-reflow volgt in PR2. Dit is een bewuste, gecommuniceerde afbakening.

## 6. Verificatie

- **PR1:** Playwright-CSS-harness (echte RVO-CSS + `body.rvo-theme`) op 320/360/390px, zoals bij de header-fix — meet computed waarden (geen horizontale overflow, controls ≥44px, dropdown binnen viewport, dialog scrollt). `app.css`/`base.css` vallen onder `src/assets/**` → uitgesloten van de coverage-gate; geen testwijzigingen nodig.
- **PR2/PR3:** naast de harness ook tegen de draaiende stack (boekhouding-frontend + standalone) waar component-gedrag telt (bottom-sheet open/dicht, touch-upload, focus-volgorde). Component-/template-wijzigingen moeten de **100%-coverage-gate** houden — nieuwe of gewijzigde TS/Vue-code volledig dekken.

## 7. Risico's en aandachtspunten

- **Gedeelde `base.css`** raakt ook de standalone (single-file, offline). Wijzigingen daar (aiv-tooltip) verifiëren in beide builds.
- **Globale grid-regel** (`--two → 1fr`): controleren dat geen desktop-only grid onbedoeld op smalle desktop-vensters collapst (de 551px-grens sluit aan op de RVO-grid-grens).
- **`min-width:auto` op de kebab-dropdown**: bij heel smalle schermen kan de dropdown smal worden; `max-width:calc(100vw - 1rem)` voorkomt overflow, leesbaarheid checken in de harness.
- **PR-afbakening:** na PR1 blijft de ledentabel/versiegeschiedenis-tabel nog overlopen tot PR2 die landt; dit is bekend en geaccepteerd.

## 8. Uit scope

Niet-mobiele wijzigingen, backend, en de in §6 genoemde coverage zijn buiten dit ontwerp. P2 en P3 krijgen elk een eigen detailspec wanneer we ze oppakken.
