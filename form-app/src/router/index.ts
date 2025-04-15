import { createRouter, createWebHistory } from 'vue-router'
import LandingPage from '@/views/LandingPage.vue'
import PreScanDPIA from '@/views/PreScanDPIAForm.vue'
import DPIAForm from '@/components/DPIAForm.vue'

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    {
      path: '/',
      name: 'home',
      component: LandingPage
    },
    {
      path: '/dpia',
      name: 'dpia',
      component: DPIAForm
    },
    {
      path: '/prescan-dpia',
      name: 'prescan-dpia',
      component: PreScanDPIA
    }
  ]
})

export default router
