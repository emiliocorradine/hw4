import { useEffect, useRef } from 'react'
import { Outlet, useLocation } from 'react-router-dom'
import ChatWidget from './ChatWidget.tsx'
import Footer from './Footer.tsx'
import Navbar from './Navbar.tsx'

// Fade/slide in any `.reveal` element when it scrolls into view, including ones rendered later
// (product grids load after the page). With reduced motion, everything is shown immediately.
function useScrollReveal(root: React.RefObject<HTMLElement | null>) {
  useEffect(() => {
    const container = root.current
    if (!container) return
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    if (reduced || !('IntersectionObserver' in window)) {
      const showAll = () => container.querySelectorAll('.reveal').forEach((el) => el.classList.add('is-visible'))
      showAll()
      const mo = new MutationObserver(showAll)
      mo.observe(container, { childList: true, subtree: true })
      return () => mo.disconnect()
    }

    const io = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            entry.target.classList.add('is-visible')
            io.unobserve(entry.target)
          }
        }
      },
      { rootMargin: '0px 0px -40px 0px', threshold: 0.08 },
    )
    const observeNew = () =>
      container.querySelectorAll('.reveal:not(.is-visible)').forEach((el) => io.observe(el))
    observeNew()
    const mo = new MutationObserver(observeNew)
    mo.observe(container, { childList: true, subtree: true })
    return () => {
      mo.disconnect()
      io.disconnect()
    }
  }, [root])
}

export default function Layout() {
  const { pathname } = useLocation()
  const mainRef = useRef<HTMLElement>(null)
  useScrollReveal(mainRef)

  // Start each page at the top, like a normal page load.
  useEffect(() => {
    window.scrollTo(0, 0)
  }, [pathname])

  return (
    <div className="app">
      <div className="announcement">
        Officially Licensed Yale Merchandise <span aria-hidden="true">·</span> Visit us at 57 Broadway, New Haven
      </div>
      <Navbar />
      <main className="main" ref={mainRef}>
        <Outlet />
      </main>
      <Footer />
      <ChatWidget />
    </div>
  )
}
