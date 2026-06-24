import { createRouter, createWebHistory, type RouteRecordRaw } from 'vue-router'
import { useAuth } from './composables/useAuth'

const routes: RouteRecordRaw[] = [
  {
    path: '/',
    name: 'home',
    component: () => import('./views/LandingPage.vue'),
    meta: { public: true },
  },
  {
    path: '/projecten',
    name: 'projects',
    component: () => import('./views/ProjectList.vue'),
  },
  {
    path: '/project/:projectId',
    name: 'project',
    component: () => import('./views/ProjectDetail.vue'),
    props: true,
  },
  {
    path: '/project/:projectId/leden',
    name: 'members',
    component: () => import('./views/ProjectMembers.vue'),
    props: true,
  },
  {
    path: '/assessment/:assessmentId',
    name: 'assessment-editor',
    component: () => import('./views/AssessmentEditor.vue'),
    props: true,
  },
  {
    path: '/assessment/:assessmentId/versies',
    name: 'version-history',
    component: () => import('./views/VersionHistory.vue'),
    props: true,
  },
  {
    path: '/privacy',
    name: 'privacy',
    component: () => import('./views/PrivacyStatement.vue'),
    meta: { public: true },
  },
  {
    path: '/toegankelijkheid',
    name: 'accessibility',
    component: () => import('./views/AccessibilityStatement.vue'),
    meta: { public: true },
  },
  {
    path: '/over',
    name: 'about',
    component: () => import('./views/AboutAssessments.vue'),
    meta: { public: true },
  },
  {
    path: '/status',
    name: 'status',
    component: () => import('./views/StatusPage.vue'),
    meta: { public: true },
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

export const router = createRouter({
  history: createWebHistory(),
  routes,
})

router.beforeEach(async (to) => {
  if (to.meta.public) return true

  const { isAuthenticated, login } = useAuth()
  if (!isAuthenticated.value) {
    await login()
    return false
  }

  return true
})
