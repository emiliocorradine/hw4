import { useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../auth.tsx'

export default function Login() {
  const { login } = useAuth()
  const navigate = useNavigate()
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const onSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    const form = new FormData(e.currentTarget)
    setError('')
    setSubmitting(true)
    try {
      await login(String(form.get('email')), String(form.get('password')))
      navigate('/products')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong. Please try again.')
      setSubmitting(false)
    }
  }

  return (
    <section className="section section--gray auth">
      <form className="auth__card" onSubmit={onSubmit}>
        <h1 className="page-title">Log in</h1>
        <p className="auth__sub">Welcome back to Campus Customs.</p>

        <label className="field">
          <span>Email</span>
          <input className="input" type="email" name="email" autoComplete="email" required />
        </label>
        <label className="field">
          <span>Password</span>
          <input className="input" type="password" name="password" autoComplete="current-password" required />
        </label>

        <button type="submit" className="btn btn--block" disabled={submitting}>
          {submitting ? 'Logging in…' : 'Log in'}
        </button>
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}

        <p className="auth__switch">
          New here? <Link to="/signup">Create an account</Link>
        </p>
      </form>
    </section>
  )
}
