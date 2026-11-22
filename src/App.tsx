import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { Navbar } from './components/Navbar'
import { Home } from './pages/Home'
import { CreateBill } from './pages/CreateBill'
import { BillDetail } from './pages/BillDetail'

export default function App() {
  return (
    <BrowserRouter>
      <div className="min-h-dvh" style={{ background: 'var(--bg)' }}>
        <Navbar />
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/create" element={<CreateBill />} />
          <Route path="/bill/:id" element={<BillDetail />} />
          {/* Catch-all */}
          <Route path="*" element={<Home />} />
        </Routes>
      </div>
    </BrowserRouter>
  )
}
