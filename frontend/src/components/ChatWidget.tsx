import { useEffect, useRef, useState, type FormEvent } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { formatPrice } from '../api/products.ts'
import { clearChatHistory, fetchChatHistory, sendMessage, type ChatMessage, type ProductCard } from '../api/chat.ts'
import { useAuth } from '../auth.tsx'
import { useChatResults } from '../chatResults.tsx'
import { StockBadge } from './ProductCard.tsx'

type Entry = ChatMessage & { products?: ProductCard[]; error?: boolean; greeting?: boolean }

// Shown in an empty chat so shoppers can see what the assistant can do.
const QUICK_QUESTIONS = [
  'What hoodies do you have?',
  'Gifts under $30',
  "What's in stock in size M?",
  'Where is your store?',
]

const greeting = (firstName?: string): Entry => ({
  role: 'assistant',
  content: `Hello${firstName ? `, ${firstName}` : ''}. I can help you find Campus Customs products and check prices and sizes.`,
  greeting: true,
})

export default function ChatWidget() {
  const [open, setOpen] = useState(false)
  const [entries, setEntries] = useState<Entry[]>([greeting()])
  const [draft, setDraft] = useState('')
  const [sending, setSending] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLDivElement>(null)
  const navigate = useNavigate()
  const { pathname } = useLocation()
  const { user, token } = useAuth()
  const { show, clear, currentProduct } = useChatResults()
  const loadedFor = useRef<number | null>(null)

  // Logged in: load saved history (cards included). Logged out: clear the panel.
  useEffect(() => {
    if (!user || !token) {
      if (loadedFor.current !== null) {
        loadedFor.current = null
        setEntries([greeting()])
        clear()
      }
      return
    }
    if (loadedFor.current === user.id) return
    loadedFor.current = user.id
    let active = true
    setEntries([greeting(user.first_name)])
    fetchChatHistory(token)
      .then((history) => {
        if (!active) return
        const past: Entry[] = history.map(({ role, content, products }) => ({ role, content, products }))
        setEntries([greeting(user.first_name), ...past])
      })
      .catch(() => {
        // History is a convenience; the chat still works without it.
      })
    return () => {
      active = false
    }
  }, [user, token, clear])

  useEffect(() => {
    if (open) inputRef.current?.focus()
  }, [open])

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight })
  }, [entries, sending, open])

  const isEmpty = entries.every((m) => m.greeting)

  const clearChat = async () => {
    setEntries([greeting(user?.first_name)])
    setDraft('')
    // Logged-in history lives in the database; delete it so the bot really starts fresh.
    if (token) {
      try {
        await clearChatHistory(token)
      } catch {
        // The panel is already clear; a failed delete only means old messages return on reload.
      }
    }
    inputRef.current?.focus()
  }

  const onSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    void send(draft)
  }

  const send = async (raw: string) => {
    const text = raw.trim()
    if (!text || sending) return
    // History excludes the greeting and failed replies; it's the real conversation only.
    // (For logged-in shoppers the backend uses the saved history instead.)
    const history: ChatMessage[] = entries
      .filter((m) => !m.greeting && !m.error)
      .map(({ role, content }) => ({ role, content }))
    const page = {
      path: pathname,
      product_id: currentProduct?.id ?? null,
      product_name: currentProduct?.name ?? null,
    }
    setEntries((m) => [...m, { role: 'user', content: text }])
    setDraft('')
    setSending(true)
    try {
      const reply = await sendMessage(text, history, page, token)
      setEntries((m) => [...m, { role: 'assistant', content: reply.message, products: reply.products }])
      // Show the products on the page too; replies without products leave the page alone.
      if (reply.products.length > 0) {
        show(reply)
        navigate('/products?from=chat')
      }
    } catch (err) {
      const content = err instanceof Error ? err.message : 'Sorry, something went wrong. Please try again.'
      setEntries((m) => [...m, { role: 'assistant', content, error: true }])
    } finally {
      setSending(false)
      inputRef.current?.focus()
    }
  }

  return (
    <div className="chat">
      {/* Always mounted so it can slide both in and out; `inert` keeps it out of reach while closed. */}
      <section
        id="chat-panel"
        className={`chat__panel${open ? ' is-open' : ''}`}
        aria-label="Chat with the Campus Customs Concierge"
        aria-hidden={!open}
        inert={!open}
        onKeyDown={(e) => e.key === 'Escape' && setOpen(false)}
      >
          <header className="chat__header">
            <div className="chat__title">
              <h2>Campus Customs Concierge</h2>
              <span className="chat__status">
                <span className="chat__status-dot" aria-hidden="true" /> online
              </span>
            </div>
            <div className="chat__header-actions">
              {!isEmpty && (
                <button
                  type="button"
                  className="chat__clear"
                  onClick={clearChat}
                  disabled={sending}
                  aria-label="Clear chat"
                  title="Clear chat"
                >
                  <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
                    <path
                      d="M4 7h16M10 11v6M14 11v6M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12M9 7V4h6v3"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.8"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                </button>
              )}
              <button type="button" className="chat__close" aria-label="Close chat" onClick={() => setOpen(false)}>
                ×
              </button>
            </div>
          </header>

          <div className="chat__messages" ref={listRef} aria-live="polite">
            {entries.map((m, i) => (
              <div key={i} className={`chat__entry chat__entry--${m.role}`}>
                <p className={`chat__msg chat__msg--${m.role}${m.error ? ' chat__msg--error' : ''}`}>{m.content}</p>
                {m.products && m.products.length > 0 && (
                  <ul className="chat__cards">
                    {m.products.map((p) => (
                      <li key={p.id}>
                        <Link to={`/products/${p.id}`} className="chat__card">
                          <span className="chat__card-image">
                            <img src={p.image_url} alt="" />
                            <StockBadge totalStock={p.total_stock} />
                          </span>
                          <span className="chat__card-name">{p.name}</span>
                          <span className="chat__card-price">{formatPrice(p.price)}</span>
                        </Link>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            ))}
            {sending && (
              <p className="chat__msg chat__msg--assistant chat__typing">
                <span className="chat__dot" />
                <span className="chat__dot" />
                <span className="chat__dot" />
                <span className="sr-only">The concierge is typing</span>
              </p>
            )}
            {isEmpty && !sending && (
              <div className="chat__chips" role="group" aria-label="Suggested questions">
                {QUICK_QUESTIONS.map((q) => (
                  <button key={q} type="button" className="chat__chip" onClick={() => void send(q)}>
                    {q}
                  </button>
                ))}
              </div>
            )}
          </div>

          <form className="chat__form" onSubmit={onSubmit}>
            <input
              ref={inputRef}
              className="input"
              placeholder="Ask about merch…"
              aria-label="Message"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
            />
            <button type="submit" className="btn" disabled={!draft.trim() || sending}>
              Send
            </button>
          </form>
      </section>

      <button
        type="button"
        className="chat__toggle"
        aria-expanded={open}
        aria-controls="chat-panel"
        aria-label={open ? 'Close chat' : 'Open chat'}
        onClick={() => setOpen((o) => !o)}
      >
        {open ? (
          <svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true">
            <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
          </svg>
        ) : (
          <svg viewBox="0 0 24 24" width="26" height="26" aria-hidden="true">
            <path
              d="M4 5.5A2.5 2.5 0 0 1 6.5 3h11A2.5 2.5 0 0 1 20 5.5v8a2.5 2.5 0 0 1-2.5 2.5H10l-4.5 4v-4A1.5 1.5 0 0 1 4 14.5z"
              fill="currentColor"
            />
          </svg>
        )}
      </button>
    </div>
  )
}
