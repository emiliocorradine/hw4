import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { fetchProduct, formatPrice } from '../api/products.ts'
import { useChatResults } from '../chatResults.tsx'
import { useAsync } from '../useAsync.ts'

const LOW_STOCK = 5

export default function ProductDetail() {
  const { id = '' } = useParams()
  const { data: product, error, loading } = useAsync(() => fetchProduct(id), id)
  const [selected, setSelected] = useState<string | null>(null)
  const { setCurrentProduct } = useChatResults()

  // Tell the chat which product is on screen, so "this one" means this product.
  useEffect(() => {
    if (!product) return
    setCurrentProduct({ id: product.product_id, name: product.name })
    return () => setCurrentProduct(null)
  }, [product, setCurrentProduct])

  if (loading) return <p className="container status">Loading product…</p>

  if (error || !product) {
    return (
      <section className="section">
        <div className="container empty">
          <h1 className="page-title">
            {error === 'Not found' ? "We couldn't find that product" : 'Something went wrong'}
          </h1>
          <Link to="/products" className="btn">
            Back to products
          </Link>
        </div>
      </section>
    )
  }

  const selectedItem = product.inventory.find((i) => i.size === selected)

  const soldOutSizes = product.inventory.filter((i) => i.quantity === 0).map((i) => i.size)
  let stockMessage = product.in_stock
    ? `${product.total_stock} in stock across all sizes. Select a size to check it.` +
      (soldOutSizes.length ? ` Sold out: ${soldOutSizes.join(', ')}.` : '')
    : 'Sold out in every size.'
  if (selectedItem) {
    if (selectedItem.quantity <= LOW_STOCK) stockMessage = `Only ${selectedItem.quantity} left in ${selectedItem.size}.`
    else stockMessage = `${selectedItem.quantity} in stock in ${selectedItem.size}.`
  }

  return (
    <section className="section">
      <div className="container">
        <nav className="breadcrumb" aria-label="Breadcrumb">
          <Link to="/products">Products</Link>
          <span aria-hidden="true">/</span>
          <Link to={`/products?category=${encodeURIComponent(product.category)}`}>{product.category}</Link>
          <span aria-hidden="true">/</span>
          <span aria-current="page">{product.name}</span>
        </nav>

        <div className="detail reveal">
          <div className="detail__image">
            <img src={product.image_url} alt={product.name} />
          </div>

          <div className="detail__info">
            <p className="card__category">{product.category}</p>
            <h1 className="detail__title">{product.name}</h1>
            <p className="detail__price">{formatPrice(product.price)}</p>
            <p className="detail__description">{product.description}</p>

            <p className="detail__label">Colors</p>
            <p>{product.colors.join(', ')}</p>

            <p className="detail__label">Size</p>
            <div className="sizes" role="group" aria-label="Choose a size">
              {product.inventory.map((item) => (
                <button
                  key={item.size}
                  type="button"
                  className={`size${item.size === selected ? ' is-active' : ''}${item.quantity === 0 ? ' is-out' : ''}`}
                  aria-pressed={item.size === selected}
                  disabled={item.quantity === 0}
                  aria-label={item.quantity === 0 ? `${item.size}, sold out` : item.size}
                  title={item.quantity === 0 ? 'Sold out' : undefined}
                  onClick={() => setSelected(item.size)}
                >
                  {item.size}
                </button>
              ))}
            </div>
            <p className={`stock${!product.in_stock ? ' is-out' : ''}`} aria-live="polite">
              {stockMessage}
            </p>

            <table className="stock-table">
              <caption>Stock by size</caption>
              <thead>
                <tr>
                  {product.inventory.map((i) => (
                    <th key={i.size} scope="col">
                      {i.size}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                <tr>
                  {product.inventory.map((i) => (
                    <td key={i.size} className={i.quantity === 0 ? 'is-out' : ''}>
                      {i.quantity === 0 ? 'Sold out' : i.quantity}
                    </td>
                  ))}
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </section>
  )
}
