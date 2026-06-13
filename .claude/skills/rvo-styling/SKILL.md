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
<button class="utrecht-button utrecht-button--primary-action utrecht-button--rvo-md">
  Label
</button>
```

Structure: `utrecht-button` + variant + size

### Common mistake

```html
<!-- WRONG: --rvo-primary-action does not exist -->
<button class="utrecht-button utrecht-button--rvo-primary-action">

<!-- CORRECT: variant without rvo- prefix (except tertiary) -->
<button class="utrecht-button utrecht-button--primary-action">
```

### Variants

| Class | Usage |
|-------|-------|
| `utrecht-button--primary-action` | Main action (blue) |
| `utrecht-button--secondary-action` | Secondary action (outlined) |
| `utrecht-button--rvo-tertiary-action` | Tertiary action (text-only, has `rvo-` prefix) |
| `utrecht-button--primary-action utrecht-button--warning` | Destructive/warning action |

### Sizes

| Class | Usage |
|-------|-------|
| `utrecht-button--rvo-xs` | Extra small |
| `utrecht-button--rvo-md` | Medium (default) |
| `utrecht-button--rvo-full-width` | Full container width |

### Reference implementation

See `packages/assessment-core/src/components/ui/UiButton.vue` for the canonical button component that handles variant and size mapping.

## Button Groups

```html
<div class="utrecht-button-group" role="group" aria-label="Beschrijving van de groep">
  <button class="utrecht-button utrecht-button--primary-action utrecht-button--rvo-md">Opslaan</button>
  <button class="utrecht-button utrecht-button--secondary-action utrecht-button--rvo-md">Annuleer</button>
</div>
```

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
  <button class="utrecht-button utrecht-button--primary-action utrecht-button--rvo-md">
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
