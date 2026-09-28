export type ChatMessage = {
  role: 'user' | 'assistant'
  content: string
}

export type ProductCard = {
  id: string
  name: string
  price: number
  image_url: string
  short_info: string
  total_stock: number
}

export type ChatReply = {
  message: string
  products: ProductCard[]
  search_label: string | null
}

// Where the shopper is; product_id is the catalogue slug (e.g. "basic-hoodie-big-yale").
export type PageContext = {
  path: string
  product_id: string | null
  product_name: string | null
}

export type ChatHistoryMessage = ChatMessage & {
  products: ProductCard[]
  created_at: string
}

const authHeader = (token: string | null): Record<string, string> =>
  token ? { Authorization: `Bearer ${token}` } : {}

async function readJson<T>(res: Response): Promise<T> {
  const body = await res.json().catch(() => null)
  if (!res.ok) {
    const detail = body?.detail
    throw new Error(typeof detail === 'string' ? detail : 'Our assistant is unavailable right now. Please try again.')
  }
  return body as T
}

// Sends the message, earlier turns, and current page to the shop agent (POST /api/chat).
// With a token the backend uses the saved history instead of `history` and saves this exchange.
export async function sendMessage(
  message: string,
  history: ChatMessage[],
  page: PageContext,
  token: string | null,
): Promise<ChatReply> {
  const res = await fetch('/api/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeader(token) },
    body: JSON.stringify({ message, history, page }),
  })
  return readJson<ChatReply>(res)
}

export async function fetchChatHistory(token: string): Promise<ChatHistoryMessage[]> {
  const res = await fetch('/api/chat/history', { headers: authHeader(token) })
  return readJson<ChatHistoryMessage[]>(res)
}

// "Clear chat" for logged-in shoppers: deletes their saved messages.
export async function clearChatHistory(token: string): Promise<void> {
  const res = await fetch('/api/chat/history', { method: 'DELETE', headers: authHeader(token) })
  await readJson<{ deleted: number }>(res)
}
