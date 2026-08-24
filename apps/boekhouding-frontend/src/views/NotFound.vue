<script setup lang="ts">
import '@nldd/design-system/button'
import '@nldd/design-system/simple-section'
import '@nldd/design-system/title'
</script>

<template>
  <nldd-simple-section width="45rem">
    <nldd-title size="3"><h1>Pagina niet gevonden</h1></nldd-title>
    <p>
      De pagina die je zoekt bestaat niet (meer). Controleer de link, of ga
      terug naar het overzicht.
    </p>
    <p>
      <nldd-button
        variant="primary"
        size="md"
        href="/"
        text="Naar de startpagina"
      ></nldd-button>
    </p>
  </nldd-simple-section>
</template>
