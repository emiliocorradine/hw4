import { Link } from 'react-router-dom'

export default function NotFound() {
  return (
    <section className="section">
      <div className="container empty">
        <h1 className="page-title">Page not found</h1>
        <p>The page you're looking for doesn't exist.</p>
        <Link to="/" className="btn">
          Go home
        </Link>
      </div>
    </section>
  )
}
