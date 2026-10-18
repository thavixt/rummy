import type { MouseEvent } from 'react'
import { type Card, type Suit, SUIT_SYMBOL, isJoker, isRed, rankLabel } from '../game/cards'

const SIZES = {
  md: 'w-[56px] h-[80px] sm:w-[68px] sm:h-[96px]',
  sm: 'w-[42px] h-[60px] sm:w-[48px] sm:h-[68px]',
}

interface CardFaceProps {
  card: Card
  size?: keyof typeof SIZES
  selected?: boolean
  highlight?: boolean
  /** For a joker on the table: the card it stands for. */
  represents?: { rank: number; suit: Suit | null }
  className?: string
  title?: string
  onClick?: (e: MouseEvent) => void
}

export function CardFace({ card, size = 'md', selected, highlight, represents, className = '', title, onClick }: CardFaceProps) {
  const joker = isJoker(card)
  const color = joker ? 'text-fuchsia-700' : isRed(card.suit) ? 'text-red-600' : 'text-slate-900'
  const small = size === 'sm'
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      disabled={!onClick}
      className={[
        'relative shrink-0 rounded-md border bg-white text-left shadow-md transition-transform duration-150 select-none',
        SIZES[size],
        color,
        selected ? '-translate-y-3 border-amber-400 ring-2 ring-amber-400' : 'border-slate-300',
        highlight ? 'ring-2 ring-sky-300' : '',
        onClick ? 'cursor-pointer hover:-translate-y-1 disabled:cursor-default' : 'cursor-default',
        selected && onClick ? 'hover:-translate-y-3' : '',
        className,
      ].join(' ')}
    >
      {joker ? (
        <>
          {represents ? (
            // Show what the joker stands for in the corner, which stays visible when cards overlap.
            <span
              className={`absolute top-0.5 left-1 flex flex-col items-center font-bold leading-none ${small ? 'text-[13px]' : 'text-base'} ${isRed(represents.suit) ? 'text-red-600' : 'text-slate-900'}`}
            >
              {rankLabel(represents.rank)}
              <span className={small ? 'text-[12px]' : 'text-sm'}>{represents.suit ? SUIT_SYMBOL[represents.suit] : '★'}</span>
            </span>
          ) : (
            <span className={`absolute top-0.5 left-1 font-bold leading-none ${small ? 'text-[11px]' : 'text-sm'}`}>★</span>
          )}
          <span className={`absolute inset-0 grid place-items-center pt-2 pl-2 ${small ? 'text-xl' : 'text-3xl'}`}>🃏</span>
          {!represents && (
            <span className={`absolute inset-x-0 bottom-0.5 text-center font-semibold tracking-wider ${small ? 'text-[8px]' : 'text-[10px]'}`}>
              JOKER
            </span>
          )}
        </>
      ) : (
        <>
          <span className={`absolute top-0.5 left-1 flex flex-col items-center font-bold leading-none ${small ? 'text-[13px]' : 'text-base'}`}>
            {rankLabel(card.rank)}
            <span className={small ? 'text-[12px]' : 'text-sm'}>{SUIT_SYMBOL[card.suit!]}</span>
          </span>
          <span className={`absolute inset-0 grid place-items-center pt-2 pl-2 ${small ? 'text-xl' : 'text-3xl'}`}>
            {SUIT_SYMBOL[card.suit!]}
          </span>
        </>
      )}
    </button>
  )
}

export function CardBack({ size = 'md', className = '' }: { size?: keyof typeof SIZES | 'xs'; className?: string }) {
  const dims = size === 'xs' ? 'w-[18px] h-[26px] rounded-[3px] border' : `${SIZES[size]} rounded-md border-2`
  return (
    <div
      className={`shrink-0 border-white bg-[repeating-linear-gradient(45deg,#1e3a8a_0_4px,#1d4ed8_4px_8px)] shadow ${dims} ${className}`}
    />
  )
}
