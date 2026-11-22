import { ShieldAlert } from 'lucide-react'

export function Footer() {
  return (
    <footer
      className="mx-auto max-w-2xl px-4 sm:px-6 pb-10 pt-8"
      style={{ borderTop: '1px solid var(--border)' }}
    >
      <div className="flex items-start gap-2.5">
        <ShieldAlert
          className="size-3.5 shrink-0 mt-0.5"
          style={{ color: 'rgba(166,177,196,0.5)' }}
        />
        <p
          className="text-xs leading-relaxed text-pretty"
          style={{ color: 'rgba(166,177,196,0.55)' }}
        >
          SplitFlow is an unaudited smart contract. Only use funds you can afford to lose.
          USDC transfers may be restricted or permanently blocked by Circle if addresses are sanctioned.
          {' '}
          <a
            href="https://github.com/deseti/splitflow"
            target="_blank"
            rel="noopener noreferrer"
            className="underline underline-offset-2 transition-opacity hover:opacity-80"
            style={{ color: 'rgba(166,177,196,0.65)' }}
          >
            View source
          </a>
          {' · '}
          <a
            href="https://explorer.arc.io"
            target="_blank"
            rel="noopener noreferrer"
            className="underline underline-offset-2 transition-opacity hover:opacity-80"
            style={{ color: 'rgba(166,177,196,0.65)' }}
          >
            Arc Explorer
          </a>
        </p>
      </div>
    </footer>
  )
}
