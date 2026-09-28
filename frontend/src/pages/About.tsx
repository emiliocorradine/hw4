import { Link } from 'react-router-dom'

export default function About() {
  return (
    <>
      <section className="hero hero--small">
        <div className="container hero__inner">
          <p className="eyebrow">About us</p>
          <h1>A trusted partner to the Yale community</h1>
        </div>
      </section>

      <section className="section">
        <div className="container prose reveal">
          <p>
            Yale Bulldog Blue by Campus Customs is New Haven's dedicated source for officially licensed Yale
            merchandise. For more than four decades, the Official Y Sweater has anchored our collection, and it
            remains the standard against which we measure every piece we carry.
          </p>
          <p>
            Our assortment spans clothing, accessories, and home goods, with dedicated collections for alumni,
            class years, residential colleges, athletics, the graduate and professional schools, and Yale
            families. Each item is selected for durable construction, faithful detailing, and lasting value.
          </p>
          <p>
            We serve students, alumni, and families as a long-term partner, in person at 57 Broadway, New Haven,
            CT 06511, and online. Our commitment is simple: accurate pricing, transparent inventory, and
            considered service. Custom items are made to order and cannot be returned.
          </p>

          <Link to="/products" className="btn">
            Shop the Collection
          </Link>
        </div>
      </section>
    </>
  )
}
