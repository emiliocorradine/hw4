import { Link } from 'react-router-dom'
import { formatPrice, stockBadge, type CardProduct } from '../api/products.ts'

// "Sold out" / "Low stock" from real stock; renders nothing when stock is healthy.
export function StockBadge({ totalStock }: { totalStock: number }) {
  const badge = stockBadge(totalStock)
  if (!badge) return null
  return <span className={`stock-badge stock-badge--${badge.kind}`}>{badge.label}</span>
}

// Used by the catalogue grid, the home page, and the chat's assistant results.
export default function ProductCard({ product }: { product: CardProduct }) {
  const sizes = product.sizes_in_stock

  return (
    <Link to={`/products/${product.id}`} className="card reveal">
      <div className="card__image">
        <img src={product.image_url} alt={product.name} loading="lazy" />
        <StockBadge totalStock={product.total_stock} />
      </div>
      <div className="card__body">
        {product.category && <p className="card__category">{product.category}</p>}
        <h3 className="card__title">{product.name}</h3>
        <p className="card__price">{formatPrice(product.price)}</p>
        {product.short_info && <p className="card__info">{product.short_info}</p>}
        {sizes && sizes.length > 0 && <p className="card__stock">Sizes in stock: {sizes.join(', ')}</p>}
      </div>
    </Link>
  )
}
