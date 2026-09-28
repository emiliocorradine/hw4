import { useEffect, useMemo, useRef } from 'react'
import { useSearchParams } from 'react-router-dom'
import { fetchProducts, toCardProduct, type Product } from '../api/products.ts'
import { useChatResults } from '../chatResults.tsx'
import ProductCard from '../components/ProductCard.tsx'
import { useAsync } from '../useAsync.ts'

type Sort = 'name' | 'price-asc' | 'price-desc'

function matches(p: Product, query: string) {
  const haystack = [p.name, p.garment_type, p.category, p.description, ...p.colors, ...p.search_tags]
    .join(' ')
    .toLowerCase()
  return query
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .every((word) => haystack.includes(word))
}

export default function Products() {
  const { data: products, error, loading } = useAsync(fetchProducts, 'all')
  const [params, setParams] = useSearchParams()
  const { results, clear } = useChatResults()
  const showResults = params.get('from') === 'chat' && results !== null
  const resultsRef = useRef<HTMLElement>(null)

  // Bring each new set of assistant results into view.
  useEffect(() => {
    if (showResults) resultsRef.current?.scrollIntoView({ block: 'start' })
  }, [results, showResults])

  const clearResults = () => {
    clear()
    const next = new URLSearchParams(params)
    next.delete('from')
    setParams(next, { replace: true })
  }

  const query = params.get('q') ?? ''
  const category = params.get('category') ?? ''
  const sort = (params.get('sort') as Sort | null) ?? 'name'
  const inStockOnly = params.get('instock') === '1'

  const update = (key: string, value: string) => {
    const next = new URLSearchParams(params)
    if (value) next.set(key, value)
    else next.delete(key)
    setParams(next, { replace: true })
  }

  const categories = useMemo(
    () => [...new Set((products ?? []).map((p) => p.category))].sort(),
    [products],
  )

  const visible = useMemo(() => {
    const list = (products ?? []).filter(
      (p) =>
        (!category || p.category === category) &&
        (!inStockOnly || p.in_stock) &&
        (!query || matches(p, query)),
    )
    if (sort === 'price-asc') list.sort((a, b) => a.price - b.price || a.name.localeCompare(b.name))
    else if (sort === 'price-desc') list.sort((a, b) => b.price - a.price || a.name.localeCompare(b.name))
    else list.sort((a, b) => a.name.localeCompare(b.name))
    return list
  }, [products, category, inStockOnly, query, sort])

  return (
    <section className="section">
      <div className="container">
        {showResults && (
          <section className="assistant-results" ref={resultsRef} aria-labelledby="assistant-results-title">
            <div className="assistant-results__head">
              <h2 id="assistant-results-title" className="assistant-results__title">
                <span className="assistant-results__eyebrow">Assistant results:</span> {results.label}
              </h2>
              <button type="button" className="btn btn--ghost" onClick={clearResults}>
                Clear results
              </button>
            </div>
            <div className="grid">
              {results.products.map((p) => (
                <ProductCard key={p.id} product={p} />
              ))}
            </div>
          </section>
        )}

        <h1 className="page-title">{category || 'All products'}</h1>

        <div className="filters">
          <input
            type="search"
            className="input filters__search"
            placeholder="Search hoodies, navy, bulldog…"
            aria-label="Search products"
            value={query}
            onChange={(e) => update('q', e.target.value)}
          />
          <select
            className="input"
            aria-label="Sort products"
            value={sort}
            onChange={(e) => update('sort', e.target.value === 'name' ? '' : e.target.value)}
          >
            <option value="name">Sort: Name</option>
            <option value="price-asc">Price: Low to high</option>
            <option value="price-desc">Price: High to low</option>
          </select>
          <label className="checkbox">
            <input
              type="checkbox"
              checked={inStockOnly}
              onChange={(e) => update('instock', e.target.checked ? '1' : '')}
            />
            In stock only
          </label>
        </div>

        <div className="chips" role="group" aria-label="Filter by category">
          <button
            type="button"
            className={`chip${category ? '' : ' is-active'}`}
            onClick={() => update('category', '')}
          >
            All
          </button>
          {categories.map((c) => (
            <button
              key={c}
              type="button"
              className={`chip${c === category ? ' is-active' : ''}`}
              onClick={() => update('category', c)}
            >
              {c}
            </button>
          ))}
        </div>

        {loading && <p className="status">Loading products…</p>}
        {error && (
          <p className="status status--error">We couldn't load products right now. Please try again in a moment.</p>
        )}

        {products && (
          <>
            <p className="results-count">
              {visible.length} {visible.length === 1 ? 'product' : 'products'}
            </p>
            {visible.length > 0 ? (
              <div className="grid">
                {visible.map((p) => (
                  <ProductCard key={p.product_id} product={toCardProduct(p)} />
                ))}
              </div>
            ) : (
              <div className="empty">
                <p>No products match your search.</p>
                <button type="button" className="btn btn--ghost" onClick={() => setParams({}, { replace: true })}>
                  Clear filters
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </section>
  )
}
