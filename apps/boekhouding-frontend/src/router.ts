import { ref } from 'vue'
import { createRouter, createWebHistory, type RouteRecordRaw } from 'vue-router'
import { useAuth } from './composables/useAuth'

const routes: RouteRecordRaw[] = [
  {
    path: '/',
    name: 'home',
    meta: { backLabel: 'Startpagina', public: true },
    component: () => import('./views/LandingPage.vue'),
  },
  {
    path: '/projecten',
    name: 'projects',
    meta: { backLabel: 'Projecten' },
    component: () => import('./views/ProjectList.vue'),
  },
  {
    path: '/project/:projectId',
    name: 'project',
    meta: { backLabel: 'Project' },
    component: () => import('./views/ProjectDetail.vue'),
    props: true,
  },
  {
    path: '/project/:projectId/leden',
    name: 'members',
    meta: { backLabel: 'Projectleden' },
    component: () => import('./views/ProjectMembers.vue'),
    props: true,
  },
  {
    path: '/assessment/:assessmentId',
    name: 'assessment-editor',
    meta: { backLabel: 'Assessment' },
    component: () => import('./views/AssessmentEditor.vue'),
    props: true,
  },
  {
    path: '/assessment/:assessmentId/versies',
    name: 'version-history',
    meta: { backLabel: 'Versiegeschiedenis' },
    component: () => import('./views/VersionHistory.vue'),
    props: true,
  },
  {
    path: '/privacy',
    name: 'privacy',
    meta: { informational: true, backLabel: 'Privacyverklaring', public: true },
    component: () => import('./views/PrivacyStatement.vue'),
  },
  {
    path: '/toegankelijkheid',
    name: 'accessibility',
    meta: { informational: true, backLabel: 'Toegankelijkheid', public: true },
    component: () => import('./views/AccessibilityStatement.vue'),
  },
  {
    path: '/over',
    name: 'about',
    meta: { informational: true, backLabel: 'Over Invulhulpen', public: true },
    component: () => import('./views/AboutAssessments.vue'),
  },
  {
    path: '/status',
    name: 'status',
    meta: { informational: true, backLabel: 'Status', public: true },
    component: () => import('./views/StatusPage.vue'),
  },
  {
    // Catch-all 404; public so it doesn't trigger the login redirect.
    // Must stay last so it only matches when no other route does.
    path: '/:pathMatch(.*)*',
    name: 'not-found',
    component: () => import('./views/NotFound.vue'),
    meta: { public: true },
  },
]

// Where a "back" from an informational page should point: the page the reader
// came from, named. Recorded in beforeEach so it is set before the next view's
// setup runs.
export const previousPage = ref<{ text: string; to: string } | null>(null)

export const router = createRouter({
  history: createWebHistory(),
  routes,
  // A new page starts at the top; only browser back/forward restores where the
  // reader was.
  scrollBehavior: (_to, _from, savedPosition) => savedPosition ?? { top: 0 },
})

router.beforeEach(async (to, from) => {
  // Informational pages are reachable from the footer of every page, so they
  // never become the place a reader goes "back" to: that would trap them in a
  // loop between two of them. The last working page stays the destination.
  if (from.name && !from.meta.informational && from.fullPath !== to.fullPath) {
    previousPage.value = { text: (from.meta.backLabel as string | undefined) ?? 'Vorige pagina', to: from.fullPath }
  }

  if (to.meta.public) return true

  const { isAuthenticated, login } = useAuth()
  if (!isAuthenticated.value) {
    await login()
    return false
  }

  return true
})
