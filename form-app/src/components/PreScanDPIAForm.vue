<script setup lang="ts">
import Banner from '@/components/AppBanner.vue'
import NavHeader from '@/components/NavHeader.vue'
import { type NavigationFunctions } from '@/models/navigation'

const props = defineProps<{
  navigation: NavigationFunctions
}>()

</script>

<template>
  <Banner />
  <NavHeader :navigation="navigation" />
  <div class="rvo-layout-column rvo-layout-gap--3xl rvo-margin-block-start--3xl">
    <div class="rvo-max-width-layout rvo-max-width-layout--md
        rvo-max-width-layout-inline-padding--md">
      <div class="rvo-alert rvo-alert--info rvo-alert--padding-md">
        <span class="utrecht-icon rvo-icon rvo-icon-info rvo-icon--xl rvo-status-icon-info" role="img"
          aria-label="Info"></span>
        <div class="rvo-alert-text">
          <div>
            <div>
              DPIA Pre Scan is in ontwikkeling.
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>

</template>
