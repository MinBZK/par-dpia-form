import { useAuth, SessionExpiredError } from './composables/useAuth'

export { SessionExpiredError }

const BASE = ''

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const { getToken, sessionExpired } = useAuth()
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

  if (res.status === 401) {
    sessionExpired.value = true
    throw new SessionExpiredError()
  }

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
  state?: unknown
}

export interface AssessmentVersion {
  id: string
  version: number
  createdBy: string
  createdByName: string
  createdAt: string
  updatedAt: string
  changeDescription: string | null
  state?: unknown
}

export interface VersionEdit {
  id: string
  fieldId: string
  editType: string
  oldValue: unknown
  newValue: unknown
  editedBy: string
  editedAt: string
  version: number
}

export const assessments = {
  list: (projectId: string) =>
    request<AssessmentInstance[]>(`/api/v1/projects/${projectId}/assessments`),
  get: (assessmentId: string) =>
    request<AssessmentInstance>(`/api/v1/assessments/${assessmentId}`),
  create: (projectId: string, assessmentType: 'dpia' | 'prescan', name?: string, state?: unknown) =>
    request<AssessmentInstance>(`/api/v1/projects/${projectId}/assessments`, {
      method: 'POST',
      body: JSON.stringify({ assessmentType, ...(name && { name }), state }),
    }),
  update: (assessmentId: string, state: unknown, options?: { changeDescription?: string; expectedVersion?: number; newVersion?: boolean }) =>
    request<AssessmentInstance>(`/api/v1/assessments/${assessmentId}`, {
      method: 'PUT',
      body: JSON.stringify({ state, ...options }),
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
  version: (assessmentId: string, version: number, options?: { includeState?: boolean }) =>
    request<AssessmentVersion>(`/api/v1/assessments/${assessmentId}/versions/${version}${options?.includeState ? '?includeState=true' : ''}`),
  versionEdits: (assessmentId: string, version: number) =>
    request<VersionEdit[]>(`/api/v1/assessments/${assessmentId}/versions/${version}/edits`),
  updateVersionDescription: (assessmentId: string, version: number, changeDescription: string) =>
    request<AssessmentVersion>(`/api/v1/assessments/${assessmentId}/versions/${version}`, {
      method: 'PATCH',
      body: JSON.stringify({ changeDescription }),
    }),
}

// Comments
export interface CommentReply {
  id: string
  parentId: string
  authorId: string
  authorName: string
  body: string
  createdAt: string
  updatedAt: string
}

export interface CommentThread {
  id: string
  fieldId: string
  parentId: null
  authorId: string
  authorName: string
  body: string
  resolvedAt: string | null
  resolvedBy: string | null
  resolvedByName: string | null
  createdAt: string
  updatedAt: string
  replies: CommentReply[]
}

export interface CommentsResponse {
  comments: CommentThread[]
  lastModifiedAt: string | null
  currentUserId: string
}

export interface SyncResponse {
  version: number
  updatedAt: string
  lastModifiedBySelf: boolean
  commentCount: number
}

export const commentsApi = {
  list: (assessmentId: string, since?: string) =>
    request<CommentsResponse>(`/api/v1/assessments/${assessmentId}/comments${since ? `?since=${encodeURIComponent(since)}` : ''}`),
  create: (assessmentId: string, fieldId: string, body: string, parentId?: string) =>
    request<CommentThread>(`/api/v1/assessments/${assessmentId}/comments`, {
      method: 'POST',
      body: JSON.stringify({ fieldId, body, ...(parentId && { parentId }) }),
    }),
  update: (assessmentId: string, commentId: string, body: string) =>
    request<CommentThread>(`/api/v1/assessments/${assessmentId}/comments/${commentId}`, {
      method: 'PATCH',
      body: JSON.stringify({ body }),
    }),
  delete: (assessmentId: string, commentId: string) =>
    request<void>(`/api/v1/assessments/${assessmentId}/comments/${commentId}`, { method: 'DELETE' }),
  resolve: (assessmentId: string, commentId: string) =>
    request<CommentThread>(`/api/v1/assessments/${assessmentId}/comments/${commentId}/resolve`, { method: 'POST' }),
  reopen: (assessmentId: string, commentId: string) =>
    request<CommentThread>(`/api/v1/assessments/${assessmentId}/comments/${commentId}/reopen`, { method: 'POST' }),
}

export const syncApi = {
  get: (assessmentId: string) =>
    request<SyncResponse>(`/api/v1/assessments/${assessmentId}/sync`),
}
