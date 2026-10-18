import { isJoker } from '../game/cards'
import { type Meld, meldValue } from '../game/melds'
import { CardFace } from './Card'

interface Props {
  meld: Meld
  ownerName?: string
  highlight?: boolean
  dashed?: boolean
  onClick?: () => void
  onJokerClick?: (slot: number) => void
  onRemove?: () => void
}

export function MeldView({ meld, ownerName, highlight, dashed, onClick, onJokerClick, onRemove }: Props) {
  return (
    <div
      className={[
        'relative flex flex-col gap-1 rounded-lg border px-2 pt-1.5 pb-2',
        dashed ? 'border-dashed border-amber-300/70 bg-amber-200/10' : 'border-white/15 bg-black/15',
        highlight ? 'shadow-[0_0_0_2px_rgba(125,211,252,0.8)]' : '',
        onClick ? 'cursor-pointer hover:bg-black/25' : '',
      ].join(' ')}
      onClick={onClick}
    >
      <div className="flex items-center justify-between gap-2 text-[11px] text-emerald-100/80">
        <span>
          {meld.kind === 'set' ? 'Set' : 'Run'} · {meldValue(meld)} pts
          {ownerName ? ` · ${ownerName}` : ''}
        </span>
        {onRemove && (
          <button
            type="button"
            className="rounded px-1 text-amber-200 hover:bg-white/10"
            title="Take back into hand"
            onClick={(e) => {
              e.stopPropagation()
              onRemove()
            }}
          >
            ✕
          </button>
        )}
      </div>
      <div className="flex">
        {meld.slots.map((slot, i) => {
          const joker = isJoker(slot.card)
          return (
            <CardFace
              key={slot.card.id}
              card={slot.card}
              size="sm"
              represents={joker ? { rank: slot.rank, suit: slot.suit } : undefined}
              className={i > 0 ? '-ml-5 sm:-ml-6' : ''}
              title={joker && onJokerClick ? 'Select the matching card in your hand, then click here to rob this joker' : undefined}
              onClick={
                onClick || onJokerClick
                  ? (e) => {
                      e.stopPropagation()
                      if (joker && onJokerClick) onJokerClick(i)
                      else onClick?.()
                    }
                  : undefined
              }
            />
          )
        })}
      </div>
    </div>
  )
}
