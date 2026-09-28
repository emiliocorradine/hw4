import { Link } from 'react-router-dom'
import { fetchProducts, toCardProduct, type Product } from '../api/products.ts'
import ProductCard from '../components/ProductCard.tsx'
import { useAsync } from '../useAsync.ts'

// One in-stock pick per category, so the home page shows the range of the shop.
function featured(products: Product[]): Product[] {
  const picks = new Map<string, Product>()
  for (const p of products) {
    if (p.in_stock && !picks.has(p.category)) picks.set(p.category, p)
  }
  return [...picks.values()].slice(0, 4)
}

function categoryTiles(products: Product[]) {
  const tiles = new Map<string, { image: string; count: number }>()
  for (const p of products) {
    const tile = tiles.get(p.category)
    if (tile) tile.count += 1
    else tiles.set(p.category, { image: p.image_url, count: 1 })
  }
  return [...tiles.entries()].sort((a, b) => b[1].count - a[1].count)
}

export default function Home() {
  const { data: products, error, loading } = useAsync(fetchProducts, 'all')

  return (
    <>
      <section className="hero hero--home">
        <div className="container hero__inner">
          <p className="eyebrow">Officially licensed Yale merchandise</p>
          <h1 className="hero__headline">Heritage apparel for the Yale community</h1>
          <p className="hero__lead">
            Clothing, accessories, and home goods for alumni, class years, residential colleges, sports, graduate
            schools, and Yale families. Visit us at 57 Broadway in New Haven or shop online.
          </p>
          <div className="hero__actions">
            <Link to="/products" className="btn btn--gold">
              Shop the Collection
            </Link>
            <Link to="/about" className="btn btn--light">
              About us
            </Link>
          </div>
        </div>
      </section>

      {loading && <p className="container status">Loading products…</p>}
      {error && (
        <p className="container status status--error">
          We couldn't load products right now. Please try again in a moment.
        </p>
      )}

      {products && (
        <>
          <section className="section section--gray">
            <div className="container reveal">
              <h2 className="section__title">Shop by category</h2>
              <div className="tiles">
                {categoryTiles(products).map(([category, tile]) => (
                  <Link
                    key={category}
                    to={`/products?category=${encodeURIComponent(category)}`}
                    className="tile reveal"
                  >
                    <img src={tile.image} alt="" loading="lazy" />
                    <span className="tile__label">
                      {category}
                      <small>{tile.count} styles</small>
                    </span>
                  </Link>
                ))}
              </div>
            </div>
          </section>

          <section className="section">
            <div className="container reveal">
              <div className="section__head">
                <h2 className="section__title">Featured</h2>
                <Link to="/products" className="link-arrow">
                  View all {products.length} products →
                </Link>
              </div>
              <div className="grid">
                {featured(products).map((p) => (
                  <ProductCard key={p.product_id} product={toCardProduct(p)} />
                ))}
              </div>
            </div>
          </section>
        </>
      )}

      <section className="section section--gray">
        <div className="container perks reveal">
          <div>
            <h3>Real-time stock</h3>
            <p>Every product page shows which sizes are on the shelf right now.</p>
          </div>
          <div>
            <h3>Sizes XS–XXL</h3>
            <p>Every style comes in six sizes, from XS to XXL.</p>
          </div>
          <div>
            <h3>Visit the store</h3>
            <p>57 Broadway, New Haven, CT 06511.</p>
          </div>
        </div>
      </section>
    </>
  )
}
