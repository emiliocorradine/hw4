export type User = {
  id: number
  first_name: string
  last_name: string
  email: string
}

export type AuthResponse = {
  user: User
  token: string
}

export type SignupData = {
  first_name: string
  last_name: string
  email: string
  password: string
}

async function request<T>(path: string, init: RequestInit): Promise<T> {
  const res = await fetch(path, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...init.headers },
  })
  const body = await res.json().catch(() => null)
  if (!res.ok) {
    const detail = body?.detail
    throw new Error(typeof detail === 'string' ? detail : 'Something went wrong. Please try again.')
  }
  return body as T
}

export const signup = (data: SignupData) =>
  request<AuthResponse>('/api/signup', { method: 'POST', body: JSON.stringify(data) })

export const login = (email: string, password: string) =>
  request<AuthResponse>('/api/login', { method: 'POST', body: JSON.stringify({ email, password }) })

export const fetchMe = (token: string) =>
  request<User>('/api/me', { method: 'GET', headers: { Authorization: `Bearer ${token}` } })
