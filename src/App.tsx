import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { Navbar } from './components/Navbar'
import { Footer } from './components/Footer'
import { Home } from './pages/Home'
import { CreateBill } from './pages/CreateBill'
import { BillDetail } from './pages/BillDetail'

export default function App() {
  return (
    <BrowserRouter>
      <div className="min-h-dvh flex flex-col" style={{ background: 'var(--bg)' }}>
        <Navbar />
        <div className="flex-1">
          <Routes>
            <Route path="/"          element={<Home />} />
            <Route path="/create"    element={<CreateBill />} />
            <Route path="/bill/:id"  element={<BillDetail />} />
            <Route path="*"          element={<Home />} />
          </Routes>
        </div>
        <Footer />
      </div>
    </BrowserRouter>
  )
}
