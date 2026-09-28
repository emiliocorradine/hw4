import { useState } from 'react'
import { Link, NavLink } from 'react-router-dom'
import { useAuth } from '../auth.tsx'

const LINKS = [
  { to: '/', label: 'Home', end: true },
  { to: '/products', label: 'Products', end: false },
  { to: '/about', label: 'About Us', end: false },
]

const GUEST_LINKS = [
  { to: '/login', label: 'Login', end: false },
  { to: '/signup', label: 'Create Account', end: false },
]

export default function Navbar() {
  const [open, setOpen] = useState(false)
  const { user, logout } = useAuth()
  const links = user ? LINKS : [...LINKS, ...GUEST_LINKS]

  return (
    <header className="navbar">
      <div className="navbar__inner container">
        <Link to="/" className="navbar__brand" onClick={() => setOpen(false)}>
          Campus Customs
        </Link>
        <button
          type="button"
          className="navbar__toggle"
          aria-expanded={open}
          aria-controls="main-nav"
          aria-label="Toggle navigation"
          onClick={() => setOpen((o) => !o)}
        >
          <span />
          <span />
          <span />
        </button>
        <nav id="main-nav" className={`navbar__links${open ? ' is-open' : ''}`} aria-label="Main">
          {links.map((link) => (
            <NavLink
              key={link.to}
              to={link.to}
              end={link.end}
              className={({ isActive }) => `navbar__link${isActive ? ' is-active' : ''}`}
              onClick={() => setOpen(false)}
            >
              {link.label}
            </NavLink>
          ))}
          {user && (
            <>
              <span className="navbar__greeting">Hi, {user.first_name}</span>
              <button
                type="button"
                className="navbar__logout"
                onClick={() => {
                  logout()
                  setOpen(false)
                }}
              >
                Logout
              </button>
            </>
          )}
        </nav>
      </div>
    </header>
  )
}
