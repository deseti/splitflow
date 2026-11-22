import { useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useLiveNow } from '@/hooks/useLiveNow'
import { useAccount, useWriteContract, useWaitForTransactionReceipt } from 'wagmi'
import { decodeEventLog } from 'viem'
import { toast } from 'sonner'
import { Plus, Trash2, Loader2, ExternalLink, Info, CheckCircle2 } from 'lucide-react'
import { SPLITFLOW_ABI, SPLITFLOW_ADDRESS, ARC_MAINNET_CHAIN_ID } from '@/lib/splitflow'
import { parseUsdcInput, parseAddress, formatUsdc, txUrl, parseOnchainError } from '@/lib/utils'
import { ChainGuard } from '@/components/ChainGuard'
import { EscrowWarning } from '@/components/EscrowWarning'

interface PayerEntry {
  address: string
  share: string
}

const EMPTY_PAYER: PayerEntry = { address: '', share: '' }

function equalShares(totalRaw: bigint, count: number): bigint[] {
  if (count === 0 || totalRaw === 0n) return []
  const base = totalRaw / BigInt(count)
  const rem = totalRaw % BigInt(count)
  return Array.from({ length: count }, (_, i) => (i === 0 ? base + rem : base))
}

function LabeledField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label
        className="block text-xs font-semibold mb-2 uppercase tracking-widest"
        style={{ color: 'var(--subtle)' }}
      >
        {label}
      </label>
      {children}
    </div>
  )
}

export function CreateBill() {
  const navigate = useNavigate()
  const { address, isConnected, chainId } = useAccount()
  const wrongChain = isConnected && chainId !== ARC_MAINNET_CHAIN_ID

  const [title, setTitle] = useState('')
  const [recipient, setRecipient] = useState('')
  const [totalAmountStr, setTotalAmountStr] = useState('')
  const [deadlineStr, setDeadlineStr] = useState('')
  const [payers, setPayers] = useState<PayerEntry[]>([
    { address: address ?? '', share: '' },
    EMPTY_PAYER,
  ])

  const { writeContract, data: txHash, isPending } = useWriteContract()
  const { isLoading: isConfirming, isSuccess, data: receipt } = useWaitForTransactionReceipt({ hash: txHash })

  // Redirect after confirmed creation
  if (isSuccess && receipt) {
    const log = receipt.logs.find(l => {
      try {
        decodeEventLog({ abi: SPLITFLOW_ABI, eventName: 'BillCreated', data: l.data, topics: l.topics })
        return true
      } catch { return false }
    })
    if (log) {
      try {
        const decoded = decodeEventLog({ abi: SPLITFLOW_ABI, eventName: 'BillCreated', data: log.data, topics: log.topics })
        const billId = (decoded.args as { billId: bigint }).billId
        void navigate(`/bill/${billId.toString()}`)
      } catch { /* stay on create page */ }
    }
  }

  const totalAmount = parseUsdcInput(totalAmountStr)

  const handleEqualSplit = () => {
    if (!totalAmount) return
    const shares = equalShares(totalAmount, payers.length)
    setPayers(prev =>
      prev.map((p, i) => ({
        ...p,
        share: (Number(shares[i]) / 1e6).toFixed(6).replace(/\.?0+$/, ''),
      })),
    )
  }

  // Live clock so deadline validation never goes stale
  const nowSec = useLiveNow()
  const deadlineMin = useMemo(
    () => new Date((nowSec + 60) * 1000).toISOString().slice(0, 16),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [Math.floor(nowSec / 60)],
  )

  const parsedRecipient = parseAddress(recipient)
  const parsedDeadlineMs = deadlineStr ? new Date(deadlineStr).getTime() : null
  const parsedDeadline = parsedDeadlineMs !== null ? Math.floor(parsedDeadlineMs / 1000) : null
  const deadlineValid = parsedDeadline !== null && parsedDeadline > nowSec

  const parsedPayers = payers.map(p => ({
    address: parseAddress(p.address),
    share: parseUsdcInput(p.share),
  }))
  const payersValid = parsedPayers.every(p => p.address !== null && p.share !== null && p.share > 0n)
  const sharesSum = parsedPayers.reduce((acc, p) => acc + (p.share ?? 0n), 0n)
  const shareSumMatch = totalAmount !== null && sharesSum === totalAmount

  const seen = new Set<string>()
  const dupAddrs = new Set<string>()
  parsedPayers.forEach(p => {
    if (!p.address) return
    const key = p.address.toLowerCase()
    if (seen.has(key)) dupAddrs.add(key)
    seen.add(key)
  })

  const canSubmit =
    isConnected &&
    !wrongChain &&
    title.trim().length > 0 &&
    parsedRecipient !== null &&
    totalAmount !== null &&
    totalAmount > 0n &&
    deadlineValid &&
    payersValid &&
    shareSumMatch &&
    dupAddrs.size === 0 &&
    !!SPLITFLOW_ADDRESS

  function handleSubmit() {
    if (!canSubmit) return
    writeContract(
      {
        address: SPLITFLOW_ADDRESS!,
        abi: SPLITFLOW_ABI,
        functionName: 'createBill',
        args: [
          title.trim(),
          parsedRecipient,
          totalAmount,
          parsedPayers.map(p => p.address!),
          parsedPayers.map(p => p.share!),
          BigInt(parsedDeadline),
        ],
        chainId: ARC_MAINNET_CHAIN_ID,
      },
      { onError: (err) => toast.error(parseOnchainError(err)) },
    )
  }

  const inputStyle = {
    background: 'var(--surface-muted)',
    border: '1px solid var(--border)',
    color: 'var(--ink)',
    outline: 'none',
  }
  const inputErrStyle = {
    ...inputStyle,
    border: '1px solid var(--danger-border)',
  }

  return (
    <ChainGuard>
      <main className="mx-auto max-w-2xl px-4 py-8 pb-16">

        {/* Page header */}
        <div className="mb-7">
          <h1
            className="display text-3xl font-bold"
            style={{ color: 'var(--ink)', letterSpacing: '-0.03em' }}
          >
            Create Bill
          </h1>
          <p className="mt-1 text-sm" style={{ color: 'var(--muted)' }}>
            Set up a shared USDC bill with onchain escrow.
          </p>
        </div>

        {!SPLITFLOW_ADDRESS && (
          <div
            className="mb-5 rounded-2xl px-4 py-3"
            style={{ background: 'var(--danger-dim)', border: '1px solid var(--danger-border)' }}
          >
            <p className="text-xs" style={{ color: 'var(--danger)' }}>
              Contract not yet deployed. Set{' '}
              <code className="mono text-xs">VITE_SPLITFLOW_CONTRACT_ADDRESS</code> in .env.
            </p>
          </div>
        )}

        <EscrowWarning />

        <div
          className="mt-6 rounded-2xl p-5 flex flex-col gap-6"
          style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}
        >
          {/* Title */}
          <LabeledField label="Bill title">
            <input
              value={title}
              onChange={e => setTitle(e.target.value)}
              placeholder="e.g. Dinner at Nobu"
              maxLength={80}
              className="w-full rounded-xl px-4 py-3 text-sm"
              style={inputStyle}
            />
          </LabeledField>

          {/* Recipient */}
          <LabeledField label="Recipient address">
            <input
              value={recipient}
              onChange={e => setRecipient(e.target.value)}
              placeholder="0x…"
              className="mono w-full rounded-xl px-4 py-3 text-sm"
              style={recipient && !parsedRecipient ? inputErrStyle : inputStyle}
            />
            {recipient && !parsedRecipient && (
              <p className="mt-1.5 text-xs" style={{ color: 'var(--danger)' }}>Invalid address</p>
            )}
          </LabeledField>

          {/* Total amount */}
          <LabeledField label="Total amount (USDC)">
            <div className="relative">
              <input
                inputMode="decimal"
                value={totalAmountStr}
                onChange={e => {
                  const v = e.target.value.replace(/[^0-9.]/g, '')
                  if (v === '' || /^\d*\.?\d{0,6}$/.test(v)) setTotalAmountStr(v)
                }}
                placeholder="0.00"
                className="display w-full rounded-xl px-4 py-3 text-2xl font-bold tabular-nums pr-16"
                style={inputStyle}
              />
              <span
                className="absolute right-4 top-1/2 -translate-y-1/2 text-sm font-medium"
                style={{ color: 'var(--subtle)' }}
              >
                USDC
              </span>
            </div>
          </LabeledField>

          {/* Deadline */}
          <LabeledField label="Deposit deadline">
            <input
              type="datetime-local"
              value={deadlineStr}
              min={deadlineMin}
              onChange={e => setDeadlineStr(e.target.value)}
              className="w-full rounded-xl px-4 py-3 text-sm"
              style={deadlineStr && !deadlineValid ? inputErrStyle : inputStyle}
            />
            {deadlineStr && !deadlineValid && (
              <p className="mt-1.5 text-xs" style={{ color: 'var(--danger)' }}>
                Deadline must be in the future
              </p>
            )}
            {deadlineValid && (
              <p className="mt-1.5 text-xs flex items-center gap-1.5" style={{ color: 'var(--subtle)' }}>
                <Info className="size-3 shrink-0" />
                Settlement window closes 7 days after this deadline.
              </p>
            )}
          </LabeledField>

          {/* Payers */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <span
                className="text-xs font-semibold uppercase tracking-widest"
                style={{ color: 'var(--subtle)' }}
              >
                Payers ({payers.length}/5)
              </span>
              <div className="flex items-center gap-3">
                {totalAmount !== null && totalAmount > 0n && (
                  <button
                    type="button"
                    onClick={handleEqualSplit}
                    className="text-xs font-semibold transition-opacity hover:opacity-70"
                    style={{ color: 'var(--accent-hover)' }}
                  >
                    Equal split
                  </button>
                )}
                {payers.length < 5 && (
                  <button
                    type="button"
                    onClick={() => setPayers(prev => [...prev, { ...EMPTY_PAYER }])}
                    className="flex items-center gap-1 text-xs font-semibold transition-opacity hover:opacity-70"
                    style={{ color: 'var(--accent-hover)' }}
                  >
                    <Plus className="size-3" /> Add payer
                  </button>
                )}
              </div>
            </div>

            <div className="flex flex-col gap-3">
              {payers.map((payer, idx) => {
                const addrParsed = parseAddress(payer.address)
                const isDuplicate = addrParsed !== null && dupAddrs.has(addrParsed.toLowerCase())
                const addrInvalid = payer.address !== '' && addrParsed === null

                return (
                  <div
                    key={idx}
                    className="rounded-xl p-4"
                    style={{ background: 'var(--surface-muted)', border: '1px solid var(--border)' }}
                  >
                    <div className="flex items-center justify-between mb-3">
                      <span className="text-xs font-semibold" style={{ color: 'var(--subtle)' }}>
                        Payer {idx + 1}
                      </span>
                      {payers.length > 2 && (
                        <button
                          type="button"
                          onClick={() => setPayers(prev => prev.filter((_, i) => i !== idx))}
                          className="transition-opacity hover:opacity-60"
                          style={{ color: 'var(--subtle)' }}
                        >
                          <Trash2 className="size-3.5" />
                        </button>
                      )}
                    </div>
                    <input
                      value={payer.address}
                      onChange={e =>
                        setPayers(prev =>
                          prev.map((p, i) => (i === idx ? { ...p, address: e.target.value } : p)),
                        )
                      }
                      placeholder="0x… wallet address"
                      className="mono w-full rounded-lg px-3 py-2.5 text-xs mb-2.5"
                      style={addrInvalid || isDuplicate ? inputErrStyle : inputStyle}
                    />
                    {isDuplicate && (
                      <p className="text-xs mb-2" style={{ color: 'var(--danger)' }}>
                        Duplicate address
                      </p>
                    )}
                    <input
                      inputMode="decimal"
                      value={payer.share}
                      onChange={e => {
                        const v = e.target.value.replace(/[^0-9.]/g, '')
                        if (v === '' || /^\d*\.?\d{0,6}$/.test(v)) {
                          setPayers(prev =>
                            prev.map((p, i) => (i === idx ? { ...p, share: v } : p)),
                          )
                        }
                      }}
                      placeholder="Share (USDC)"
                      className="display w-full rounded-lg px-3 py-2.5 text-sm tabular-nums"
                      style={inputStyle}
                    />
                  </div>
                )
              })}
            </div>

            {/* Share sum validation */}
            {totalAmount !== null && sharesSum > 0n && (
              <div className="mt-3 flex items-center justify-between text-xs">
                <span style={{ color: 'var(--muted)' }}>
                  Shares sum:{' '}
                  <span className="tabular-nums font-semibold" style={{ color: 'var(--ink-2)' }}>
                    {formatUsdc(sharesSum)} USDC
                  </span>
                </span>
                {shareSumMatch ? (
                  <span className="flex items-center gap-1" style={{ color: 'var(--success)' }}>
                    <CheckCircle2 className="size-3" /> Matches total
                  </span>
                ) : (
                  <span style={{ color: 'var(--danger)' }}>
                    Must equal {formatUsdc(totalAmount)} USDC
                  </span>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Submit */}
        <button
          disabled={!canSubmit || isPending || isConfirming}
          onClick={handleSubmit}
          className="mt-5 w-full rounded-2xl py-4 text-sm font-semibold transition-all active:scale-[0.99] disabled:opacity-40 disabled:cursor-not-allowed"
          style={{ background: 'var(--accent)', color: '#fff' }}
        >
          {!isConnected ? 'Connect wallet first'
            : wrongChain ? 'Switch to Arc Mainnet'
            : isPending ? (
              <span className="flex items-center justify-center gap-2">
                <Loader2 className="size-4 animate-spin" /> Confirm in wallet…
              </span>
            ) : isConfirming ? (
              <span className="flex items-center justify-center gap-2">
                <Loader2 className="size-4 animate-spin" /> Creating bill…
              </span>
            ) : 'Create Bill'}
        </button>

        {isSuccess && txHash && (
          <div
            className="mt-4 rounded-2xl p-4 text-center"
            style={{ background: 'var(--success-dim)', border: '1px solid var(--success-border)' }}
          >
            <p className="text-sm font-semibold" style={{ color: 'var(--success)' }}>
              Bill created!
            </p>
            <a
              href={txUrl(txHash)}
              target="_blank"
              rel="noreferrer"
              className="mt-1.5 inline-flex items-center gap-1 text-xs"
              style={{ color: 'var(--accent-hover)' }}
            >
              View on Arc Explorer <ExternalLink className="size-3" />
            </a>
          </div>
        )}
      </main>
    </ChainGuard>
  )
}
