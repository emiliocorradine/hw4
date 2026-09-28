import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react'
import type { ChatReply, ProductCard } from './api/chat.ts'

export type ChatResults = {
  products: ProductCard[]
  label: string
}

export type CurrentProduct = {
  id: string
  name: string
}

type ChatResultsContextValue = {
  results: ChatResults | null
  show: (reply: ChatReply) => void
  clear: () => void
  // The product page the shopper is on, sent to the chat as page context.
  currentProduct: CurrentProduct | null
  setCurrentProduct: (product: CurrentProduct | null) => void
}

const ChatResultsContext = createContext<ChatResultsContextValue | null>(null)

// Shared chat state: the latest products the assistant found (shown on the products page)
// and the product currently on screen.
export function ChatResultsProvider({ children }: { children: ReactNode }) {
  const [results, setResults] = useState<ChatResults | null>(null)
  const [currentProduct, setCurrentProduct] = useState<CurrentProduct | null>(null)

  const show = useCallback(
    (reply: ChatReply) => setResults({ products: reply.products, label: reply.search_label || 'Products' }),
    [],
  )
  const clear = useCallback(() => setResults(null), [])

  const value = useMemo<ChatResultsContextValue>(
    () => ({ results, show, clear, currentProduct, setCurrentProduct }),
    [results, show, clear, currentProduct],
  )

  return <ChatResultsContext.Provider value={value}>{children}</ChatResultsContext.Provider>
}

// eslint-disable-next-line react-refresh/only-export-components
export function useChatResults() {
  const ctx = useContext(ChatResultsContext)
  if (!ctx) throw new Error('useChatResults must be used inside ChatResultsProvider')
  return ctx
}
