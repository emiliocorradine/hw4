import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import * as authApi from './api/auth.ts'
import type { SignupData, User } from './api/auth.ts'

const TOKEN_KEY = 'cc_token'

type AuthContextValue = {
  user: User | null
  token: string | null
  login: (email: string, password: string) => Promise<void>
  signup: (data: SignupData) => Promise<void>
  logout: () => void
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [token, setToken] = useState<string | null>(() => localStorage.getItem(TOKEN_KEY))
  const [user, setUser] = useState<User | null>(null)

  // Restore the logged-in user after a page reload; drop the token if it's no longer valid.
  useEffect(() => {
    if (!token || user) return
    let active = true
    authApi
      .fetchMe(token)
      .then((u) => active && setUser(u))
      .catch(() => {
        if (!active) return
        localStorage.removeItem(TOKEN_KEY)
        setToken(null)
      })
    return () => {
      active = false
    }
  }, [token, user])

  const save = useCallback((res: authApi.AuthResponse) => {
    localStorage.setItem(TOKEN_KEY, res.token)
    setToken(res.token)
    setUser(res.user)
  }, [])

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      token,
      login: async (email, password) => save(await authApi.login(email, password)),
      signup: async (data) => save(await authApi.signup(data)),
      logout: () => {
        localStorage.removeItem(TOKEN_KEY)
        setToken(null)
        setUser(null)
      },
    }),
    [user, token, save],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider')
  return ctx
}
