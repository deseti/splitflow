import { ShieldAlert } from 'lucide-react'
import { Link } from 'react-router-dom'

const CONTRACT_ADDRESS = '0xf28Ee372004dfEb66e54a014E437fbd196d79bB6'
const EXPLORER_URL = `https://explorer.arc.io/address/${CONTRACT_ADDRESS}?tab=contract`

export function Footer() {
  return (
    <footer
      className="mx-auto max-w-2xl w-full px-4 sm:px-6 pb-10 pt-6"
      style={{ borderTop: '1px solid var(--border)' }}
    >
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">

        {/* Disclosure */}
        <div className="flex items-start gap-2.5 max-w-md">
          <ShieldAlert
            className="size-3.5 shrink-0 mt-0.5"
            style={{ color: 'rgba(166,177,196,0.5)' }}
          />
          <p
            className="text-xs leading-relaxed text-pretty"
            style={{ color: 'rgba(166,177,196,0.55)' }}
          >
            SplitFlow is an unaudited smart contract. Only use funds you can afford to lose.
            USDC transfers may be restricted or blocked by Circle if addresses are sanctioned.
          </p>
        </div>

        {/* Links */}
        <div className="flex items-center gap-3 shrink-0 text-xs" style={{ color: 'rgba(166,177,196,0.60)' }}>
          <Link
            to="/docs"
            className="underline underline-offset-2 transition-opacity hover:opacity-80"
            style={{ color: 'rgba(166,177,196,0.65)' }}
          >
            Docs
          </Link>
          <a
            href="https://github.com/deseti/splitflow"
            target="_blank"
            rel="noopener noreferrer"
            className="underline underline-offset-2 transition-opacity hover:opacity-80"
            style={{ color: 'rgba(166,177,196,0.65)' }}
          >
            GitHub
          </a>
          <a
            href={EXPLORER_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="underline underline-offset-2 transition-opacity hover:opacity-80"
            style={{ color: 'rgba(166,177,196,0.65)' }}
          >
            Contract
          </a>
          <a
            href="https://explorer.arc.io"
            target="_blank"
            rel="noopener noreferrer"
            className="underline underline-offset-2 transition-opacity hover:opacity-80"
            style={{ color: 'rgba(166,177,196,0.65)' }}
          >
            Arc Explorer
          </a>
        </div>
      </div>
    </footer>
  )
}
