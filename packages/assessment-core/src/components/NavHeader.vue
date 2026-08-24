<script setup lang="ts">
// Actions bar under the app header (reset/export in the standalone form).
// Back navigation lives in the top navigation bar itself.
</script>

<template>
  <div class="nav-header">
    <div class="nav-header__bar">
      <div class="nav-header__actions">
        <slot />
      </div>
    </div>
  </div>
</template>
