<script setup lang="ts">
import '@nldd/design-system/card'
import '@nldd/design-system/container'
import '@nldd/design-system/icon'
import '@nldd/design-system/rich-text'
</script>

<template>
  <nldd-card class="export-pdf-info">
    <nldd-container padding="16" gap="8">
      <div class="export-pdf-info__heading-row">
        <nldd-icon name="info-circle" size="24" color="accent"></nldd-icon>
        <strong>Opslaan en delen van je werk</strong>
      </div>
      <nldd-rich-text>
        <p>
          Tijdens het invullen kun je je voortgang exporteren als PDF. Dit PDF-bestand bevat zowel het leesbare rapport als je ingevulde gegevens.
        </p>
        <p>
          Wat kun je <strong>wel</strong> met het geëxporteerde PDF-bestand?<br />
          ✅ Je kunt het PDF-bestand later opnieuw uploaden om verder te werken.<br />
          ✅ Je kunt het ook delen met een collega zodat die verder kan gaan.
        </p>
        <p>
          Wat kun je <strong>niet</strong> met het geëxporteerde PDF-bestand?<br />
          ❌ Zelf het PDF-bestand wijzigen en vervolgens dit bestand opnieuw importeren.
        </p>
      </nldd-rich-text>
    </nldd-container>
  </nldd-card>
</template>
