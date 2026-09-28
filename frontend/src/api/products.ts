export type InventoryItem = {
  size: string
  quantity: number
}

export type Product = {
  product_id: string
  name: string
  garment_type: string
  category: string
  description: string
  short_info: string
  colors: string[]
  search_tags: string[]
  image_url: string
  price: number
  inventory: InventoryItem[]
  total_stock: number
  in_stock: boolean
}

async function getJson<T>(path: string): Promise<T> {
  const res = await fetch(path)
  if (!res.ok) {
    throw new Error(res.status === 404 ? 'Not found' : `Request failed (${res.status})`)
  }
  return res.json() as Promise<T>
}

export const fetchProducts = () => getJson<Product[]>('/api/products')
export const fetchCategories = () => getJson<string[]>('/api/categories')
export const fetchProduct = (id: string) => getJson<Product>(`/api/products/${encodeURIComponent(id)}`)

// What a product card shows. The chat's ProductCard results have exactly the first five fields;
// catalogue products add a category and the sizes in stock.
export type CardProduct = {
  id: string
  name: string
  price: number
  image_url: string
  short_info: string
  total_stock: number
  category?: string
  sizes_in_stock?: string[]
}

export const toCardProduct = (p: Product): CardProduct => ({
  id: p.product_id,
  name: p.name,
  price: p.price,
  image_url: p.image_url,
  short_info: p.short_info,
  total_stock: p.total_stock,
  category: p.category,
  sizes_in_stock: p.inventory.filter((i) => i.quantity > 0).map((i) => i.size),
})

export const LOW_STOCK_TOTAL = 5

// Card badge from real stock: "Sold out" at 0, "Low stock" at 5 or fewer, otherwise none.
export function stockBadge(totalStock: number): { label: string; kind: 'out' | 'low' } | null {
  if (totalStock <= 0) return { label: 'Sold out', kind: 'out' }
  if (totalStock <= LOW_STOCK_TOTAL) return { label: 'Low stock', kind: 'low' }
  return null
}

export const formatPrice = (price: number) =>
  price.toLocaleString('en-US', { style: 'currency', currency: 'USD' })
