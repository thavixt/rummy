import { type Card, type Suit, SUITS, isJoker } from './cards'

/**
 * A position in a meld. For runs, `rank` is 1–14 (14 = Ace high) and `suit` is the run's suit.
 * For sets, `rank` is the set's rank and `suit` is the card's suit (null for a joker).
 * For jokers this records which card the joker stands for.
 */
export interface Slot {
  card: Card
  rank: number
  suit: Suit | null
}

export type MeldKind = 'set' | 'run'

export interface Arrangement {
  kind: MeldKind
  slots: Slot[]
}

export interface Meld extends Arrangement {
  id: string
  owner: number
  updatedTurn: number
}

function slotValue(kind: MeldKind, rank: number): number {
  if (kind === 'run') {
    if (rank === 1) return 1
    if (rank === 14) return 11
    return Math.min(rank, 10)
  }
  return rank === 1 ? 11 : Math.min(rank, 10)
}

export function meldValue(m: Arrangement): number {
  return m.slots.reduce((sum, s) => sum + slotValue(m.kind, s.rank), 0)
}

function arrangeSet(cards: Card[]): Arrangement | null {
  const naturals = cards.filter((c) => !isJoker(c))
  const jokers = cards.filter(isJoker)
  if (cards.length < 3 || cards.length > 4 || naturals.length === 0) return null
  const rank = naturals[0].rank
  if (naturals.some((c) => c.rank !== rank)) return null
  if (new Set(naturals.map((c) => c.suit)).size !== naturals.length) return null
  const sorted = [...naturals].sort((a, b) => SUITS.indexOf(a.suit!) - SUITS.indexOf(b.suit!))
  return {
    kind: 'set',
    slots: [
      ...sorted.map((card) => ({ card, rank, suit: card.suit })),
      ...jokers.map((card) => ({ card, rank, suit: null })),
    ],
  }
}

function arrangeRun(cards: Card[]): Arrangement | null {
  const naturals = cards.filter((c) => !isJoker(c))
  const jokers = cards.filter(isJoker)
  if (cards.length < 3 || cards.length > 13 || naturals.length === 0) return null
  const suit = naturals[0].suit!
  if (naturals.some((c) => c.suit !== suit)) return null

  const hasAce = naturals.some((c) => c.rank === 1)
  let best: Arrangement | null = null
  for (const aceHigh of hasAce ? [false, true] : [false]) {
    const byRank = new Map<number, Card>()
    for (const c of naturals) byRank.set(c.rank === 1 && aceHigh ? 14 : c.rank, c)
    if (byRank.size !== naturals.length) return null // duplicate rank

    const ranks = [...byRank.keys()].sort((a, b) => a - b)
    let lo = ranks[0]
    let hi = ranks[ranks.length - 1]
    const gaps = hi - lo + 1 - naturals.length
    if (gaps > jokers.length) continue
    const extra = jokers.length - gaps
    // Leftover jokers extend the run, upwards first.
    const up = Math.min(extra, 14 - hi)
    hi += up
    lo -= extra - up
    if (lo < 1) continue

    const spare = [...jokers]
    const slots: Slot[] = []
    for (let r = lo; r <= hi; r++) slots.push({ card: byRank.get(r) ?? spare.pop()!, rank: r, suit })
    const arrangement: Arrangement = { kind: 'run', slots }
    if (!best || meldValue(arrangement) > meldValue(best)) best = arrangement
  }
  return best
}

/** Returns how the cards would be laid out as a meld, or null if they don't form one. */
export function arrange(cards: Card[]): Arrangement | null {
  const set = arrangeSet(cards)
  const run = arrangeRun(cards)
  if (set && run) return meldValue(run) > meldValue(set) ? run : set
  return set ?? run
}

const naturalSuits = (m: Arrangement) =>
  new Set(m.slots.filter((s) => !isJoker(s.card)).map((s) => s.card.suit))

/** Returns the meld with `card` added to it, or null if it doesn't fit. */
export function layOffInto<M extends Arrangement>(meld: M, card: Card): M | null {
  const { slots } = meld
  if (meld.kind === 'set') {
    const rank = slots[0].rank
    if (slots.length >= 4) return null
    if (isJoker(card)) return { ...meld, slots: [...slots, { card, rank, suit: null }] }
    if (card.rank !== rank || naturalSuits(meld).has(card.suit)) return null
    return { ...meld, slots: [...slots, { card, rank, suit: card.suit }] }
  }

  if (slots.length >= 13) return null
  const suit = slots[0].suit
  const lo = slots[0].rank
  const hi = slots[slots.length - 1].rank
  if (isJoker(card)) {
    if (hi < 14) return { ...meld, slots: [...slots, { card, rank: hi + 1, suit }] }
    if (lo > 1) return { ...meld, slots: [{ card, rank: lo - 1, suit }, ...slots] }
    return null
  }
  if (card.suit !== suit) return null
  const ranks = card.rank === 1 ? [1, 14] : [card.rank]
  if (ranks.includes(hi + 1)) return { ...meld, slots: [...slots, { card, rank: hi + 1, suit }] }
  if (ranks.includes(lo - 1)) return { ...meld, slots: [{ card, rank: lo - 1, suit }, ...slots] }
  return null
}

/** Can `card` replace the joker at `slotIndex`? Returns the new meld and the freed joker. */
export function robJoker<M extends Arrangement>(meld: M, slotIndex: number, card: Card): { meld: M; joker: Card } | null {
  const slot = meld.slots[slotIndex]
  if (!slot || !isJoker(slot.card) || isJoker(card)) return null
  if (meld.kind === 'run') {
    if (card.suit !== slot.suit) return null
    if (card.rank !== slot.rank && !(card.rank === 1 && slot.rank === 14)) return null
  } else {
    if (card.rank !== slot.rank || naturalSuits(meld).has(card.suit)) return null
  }
  const slots = meld.slots.map((s, i) => (i === slotIndex ? { card, rank: slot.rank, suit: card.suit } : s))
  return { meld: { ...meld, slots }, joker: slot.card }
}
