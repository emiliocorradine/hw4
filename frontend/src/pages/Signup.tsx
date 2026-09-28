import { useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../auth.tsx'

const MIN_PASSWORD = 8

export default function Signup() {
  const { signup } = useAuth()
  const navigate = useNavigate()
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const onSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    const form = new FormData(e.currentTarget)
    setError('')
    setSubmitting(true)
    try {
      await signup({
        first_name: String(form.get('first_name')),
        last_name: String(form.get('last_name')),
        email: String(form.get('email')),
        password: String(form.get('password')),
      })
      navigate('/products')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong. Please try again.')
      setSubmitting(false)
    }
  }

  return (
    <section className="section section--gray auth">
      <form className="auth__card" onSubmit={onSubmit}>
        <h1 className="page-title">Create account</h1>
        <p className="auth__sub">Join Campus Customs to save your details.</p>

        <div className="field-row">
          <label className="field">
            <span>First name</span>
            <input className="input" name="first_name" autoComplete="given-name" required />
          </label>
          <label className="field">
            <span>Last name</span>
            <input className="input" name="last_name" autoComplete="family-name" required />
          </label>
        </div>
        <label className="field">
          <span>Email</span>
          <input className="input" type="email" name="email" autoComplete="email" required />
        </label>
        <label className="field">
          <span>Password</span>
          <input
            className="input"
            type="password"
            name="password"
            autoComplete="new-password"
            minLength={MIN_PASSWORD}
            required
          />
          <small className="field__hint">At least {MIN_PASSWORD} characters.</small>
        </label>

        <button type="submit" className="btn btn--block" disabled={submitting}>
          {submitting ? 'Creating account…' : 'Create account'}
        </button>
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}

        <p className="auth__switch">
          Already have an account? <Link to="/login">Log in</Link>
        </p>
      </form>
    </section>
  )
}
