import { Route, Routes } from 'react-router-dom'
import Layout from './components/Layout.tsx'
import About from './pages/About.tsx'
import Home from './pages/Home.tsx'
import Login from './pages/Login.tsx'
import NotFound from './pages/NotFound.tsx'
import ProductDetail from './pages/ProductDetail.tsx'
import Products from './pages/Products.tsx'
import Signup from './pages/Signup.tsx'

export default function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route path="/" element={<Home />} />
        <Route path="/products" element={<Products />} />
        <Route path="/products/:id" element={<ProductDetail />} />
        <Route path="/about" element={<About />} />
        <Route path="/login" element={<Login />} />
        <Route path="/signup" element={<Signup />} />
        <Route path="*" element={<NotFound />} />
      </Route>
    </Routes>
  )
}
