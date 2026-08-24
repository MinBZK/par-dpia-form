---
name: RVO Styling
description: Use when writing Vue components, working with CSS/styling, button classes, design tokens, or the RVO component library in this project. Helps avoid common mistakes with Utrecht/RVO class naming.
version: 0.1.0
---

# RVO Component Library Styling

Guide for styling in this project using the RVO (Rijksdienst voor Ondernemend Nederland) component library CSS and Utrecht design system.

## Button Classes

### Correct pattern

```html
<button class="rvo-button rvo-button--primary rvo-button--size-md">
  Label
</button>
```

Structure: `rvo-button` + variant + size.

### Common mistake

Button moved from `utrecht-button*` to `rvo-button*` in `@nl-rvo/component-library-css` 4.16. The
`.utrecht-button` class is gone from the bundle, so the old markup renders as an unstyled browser
button. Only the design *tokens* still carry the old name (`--utrecht-button-background-color`).

```html
<!-- WRONG: these classes no longer exist -->
<button class="utrecht-button utrecht-button--primary-action utrecht-button--rvo-md">

<!-- CORRECT -->
<button class="rvo-button rvo-button--primary rvo-button--size-md">
```

### Variants

| Class | Usage |
|-------|-------|
| `rvo-button--primary` | Main action |
| `rvo-button--secondary` | Secondary action |
| `rvo-button--tertiary` | Tertiary action |
| `rvo-button--quaternary` | Quaternary action |
| `rvo-button--subtle` | Low-emphasis action |
| `rvo-button--warning` | Destructive action; combine with `--primary` (see UiButton.vue) |
| `rvo-button--warning-subtle` | Low-emphasis destructive action |

### Sizes

| Class | Usage |
|-------|-------|
| `rvo-button--size-xs` | Extra small |
| `rvo-button--size-sm` | Small |
| `rvo-button--size-md` | Medium (default) |

Full container width: `rvo-button--full-width`.

### Icon position is ours, not RVO's

`rvo-button--icon-before` and `rvo-button--icon-after` are **not** in the RVO bundle. They are
defined in `packages/assessment-core/src/assets/base.css` under `.rvo-theme`. They work in this
repo; do not expect them elsewhere.

### Reference implementation

`packages/assessment-core/src/components/ui/UiButton.vue` maps variant, size and icon position to
classes. Note that `warning` there emits `rvo-button--primary rvo-button--warning`.

### Button groups

There is no button-group component: `utrecht-button-group` and `rvo-button-group` exist neither in
the bundle nor in this repo. Lay buttons out with a plain flex container in the project's own CSS,
the way `.comment-item__edit-actions` does.

## Design Tokens

### Colors

- `--rvo-color-hemelblauw` — primary blue
- `--rvo-color-grijs-100` — light grey background
- `--rvo-color-grijs-200` — medium grey
- `--rvo-color-wit` — white
- `--rvo-color-zwart` — black

### Spacing

- `--rvo-space-sm`, `--rvo-space-md`, `--rvo-space-lg`, `--rvo-space-xl`, `--rvo-space-3xl`
- Utility class: `rvo-margin-block-end--md`

### Typography

- `--rvo-font-size-xs`

### Borders

- `--rvo-border-radius-xl`

## Vue Component Conventions

### No scoped styles

Do NOT use `<style scoped>` in Vue components. Use RVO utility classes and global CSS instead.

```vue
<!-- WRONG -->
<style scoped>
.my-button { color: blue; }
</style>

<!-- CORRECT: use RVO classes in template -->
<template>
  <button class="rvo-button rvo-button--primary rvo-button--size-md">
    Click
  </button>
</template>
```

### Global CSS

Custom styles go in `packages/assessment-core/src/assets/base.css` under the `.rvo-theme` selector:

```css
.rvo-theme .my-custom-class {
  background-color: var(--rvo-color-grijs-100);
}
```

### Background utilities

- `.background-grijs-100` — light grey background
- `.background-grijs-200` — medium grey background

## Layout

- `.rvo-sidebar-layout` — sidebar page layout
- `.rvo-max-width-layout` — constrained content width

## Common Patterns

### Accordion

```html
<div class="rvo-accordion__item-summary">
  <span class="rvo-accordion__item-icon"></span>
  Title
</div>
```

### Icons with spacing

```html
<span class="rvo-icon--with-spacing-right">icon</span>
<span class="rvo-icon--with-spacing-left">icon</span>
```

### Modal

```html
<div class="modal-overlay">
  <div class="save-modal">
    <!-- content -->
  </div>
</div>
```

### Text utilities

- `.small-text` — uses `--rvo-font-size-xs`
- `.preserve-whitespace` — preserves whitespace formatting
- `.font-hemelblauw` — blue text color
