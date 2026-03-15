import { useAuth } from './composables/useAuth'

const BASE = ''

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const { getToken } = useAuth()
  const token = await getToken()

  const headers: Record<string, string> = {
    Authorization: `Bearer ${token}`,
    ...options.headers as Record<string, string>,
  }
  if (options.body) {
    headers['Content-Type'] = 'application/json'
  }

  const res = await fetch(`${BASE}${path}`, {
    ...options,
    headers,
  })

  if (res.status === 204) return undefined as T

  const data = await res.json()

  if (!res.ok) {
    const message = data.detail || data.error || 'Verzoek mislukt'
    throw new ApiError(message, res.status)
  }

  return data as T
}

export class ApiError extends Error {
  constructor(message: string, public status: number) {
    super(message)
    this.name = 'ApiError'
  }
}

// Projects
export interface Project {
  id: string
  name: string
  description: string
  createdAt: string
  updatedAt: string
  role?: string
}

export const projects = {
  list: () =>
    request<Project[]>('/api/v1/projects'),
  get: (id: string) =>
    request<Project>(`/api/v1/projects/${id}`),
  create: (name: string, description?: string) =>
    request<Project>('/api/v1/projects', {
      method: 'POST',
      body: JSON.stringify({ name, description }),
    }),
  update: (id: string, data: { name?: string; description?: string }) =>
    request<Project>(`/api/v1/projects/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    }),
  delete: (id: string) =>
    request<void>(`/api/v1/projects/${id}`, { method: 'DELETE' }),
}

// Members
export interface Member {
  userId: string
  email: string
  displayName: string
  role: string
  invitedAt: string
  acceptedAt: string | null
}

export const members = {
  list: (projectId: string) =>
    request<Member[]>(`/api/v1/projects/${projectId}/members`),
  add: (projectId: string, email: string, role?: string) =>
    request<{ userId: string; role: string }>(`/api/v1/projects/${projectId}/members`, {
      method: 'POST',
      body: JSON.stringify({ email, role }),
    }),
  update: (projectId: string, userId: string, role: string) =>
    request<Member>(`/api/v1/projects/${projectId}/members/${userId}`, {
      method: 'PUT',
      body: JSON.stringify({ role }),
    }),
  remove: (projectId: string, userId: string) =>
    request<void>(`/api/v1/projects/${projectId}/members/${userId}`, { method: 'DELETE' }),
}

// Assessments
export interface AssessmentInstance {
  id: string
  projectId: string
  assessmentType: 'dpia' | 'prescan'
  name: string
  currentVersion: number
  createdAt: string
  updatedAt: string
  snapshot?: unknown
}

export interface AssessmentVersion {
  id: string
  version: number
  savedBy: string
  savedByName: string
  savedAt: string
  changeDescription: string | null
  snapshot?: unknown
}

export const assessments = {
  list: (projectId: string) =>
    request<AssessmentInstance[]>(`/api/v1/projects/${projectId}/assessments`),
  get: (assessmentId: string) =>
    request<AssessmentInstance>(`/api/v1/assessments/${assessmentId}`),
  create: (projectId: string, assessmentType: 'dpia' | 'prescan', name?: string, snapshot?: unknown) =>
    request<AssessmentInstance>(`/api/v1/projects/${projectId}/assessments`, {
      method: 'POST',
      body: JSON.stringify({ assessmentType, ...(name && { name }), snapshot }),
    }),
  update: (assessmentId: string, snapshot: unknown, changeDescription?: string) =>
    request<AssessmentInstance>(`/api/v1/assessments/${assessmentId}`, {
      method: 'PUT',
      body: JSON.stringify({ snapshot, changeDescription }),
    }),
  rename: (assessmentId: string, name: string) =>
    request<AssessmentInstance>(`/api/v1/assessments/${assessmentId}`, {
      method: 'PUT',
      body: JSON.stringify({ name }),
    }),
  delete: (assessmentId: string) =>
    request<void>(`/api/v1/assessments/${assessmentId}`, { method: 'DELETE' }),
  versions: (assessmentId: string) =>
    request<AssessmentVersion[]>(`/api/v1/assessments/${assessmentId}/versions`),
  version: (assessmentId: string, version: number) =>
    request<AssessmentVersion>(`/api/v1/assessments/${assessmentId}/versions/${version}`),
  updateVersionDescription: (assessmentId: string, version: number, changeDescription: string) =>
    request<AssessmentVersion>(`/api/v1/assessments/${assessmentId}/versions/${version}`, {
      method: 'PATCH',
      body: JSON.stringify({ changeDescription }),
    }),
}
