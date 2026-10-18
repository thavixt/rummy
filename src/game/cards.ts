export type Suit = 'S' | 'H' | 'D' | 'C'

/** rank: 1 = Ace … 13 = King, 0 = Joker */
export interface Card {
  id: string
  rank: number
  suit: Suit | null
}

export const SUITS: Suit[] = ['S', 'H', 'C', 'D']
export const SUIT_SYMBOL: Record<Suit, string> = { S: '♠', H: '♥', D: '♦', C: '♣' }

export const isJoker = (c: Card) => c.rank === 0
export const isRed = (s: Suit | null) => s === 'H' || s === 'D'

/** Two French decks plus four jokers: 108 cards. */
export function createDeck(): Card[] {
  const cards: Card[] = []
  for (const deck of [1, 2]) {
    for (const suit of SUITS) {
      for (let rank = 1; rank <= 13; rank++) {
        cards.push({ id: `${deck}${suit}${rank}`, rank, suit })
      }
    }
  }
  for (let i = 1; i <= 4; i++) cards.push({ id: `JK${i}`, rank: 0, suit: null })
  return cards
}

/** Deterministic PRNG (mulberry32) so the reducer stays pure. Returns [value, nextSeed]. */
export function nextRandom(seed: number): [number, number] {
  const next = (seed + 0x6d2b79f5) | 0
  let t = next
  t = Math.imul(t ^ (t >>> 15), t | 1)
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
  return [((t ^ (t >>> 14)) >>> 0) / 4294967296, next]
}

export function shuffle<T>(items: T[], seed: number): { items: T[]; seed: number } {
  const out = [...items]
  let s = seed
  for (let i = out.length - 1; i > 0; i--) {
    const [r, n] = nextRandom(s)
    s = n
    const j = Math.floor(r * (i + 1))
    ;[out[i], out[j]] = [out[j], out[i]]
  }
  return { items: out, seed: s }
}

/** Rank 14 is an Ace played high in a run. */
export function rankLabel(rank: number): string {
  if (rank === 1 || rank === 14) return 'A'
  if (rank === 11) return 'J'
  if (rank === 12) return 'Q'
  if (rank === 13) return 'K'
  return String(rank)
}

export function cardLabel(c: Card): string {
  return isJoker(c) ? 'Joker' : `${rankLabel(c.rank)}${SUIT_SYMBOL[c.suit!]}`
}

/** Points left in hand at the end of a round. */
export function penaltyValue(c: Card): number {
  if (isJoker(c)) return 20
  if (c.rank === 1) return 11
  return Math.min(c.rank, 10)
}

export function sortCards(cards: Card[], mode: 'suit' | 'rank'): Card[] {
  const suitIdx = (c: Card) => (c.suit ? SUITS.indexOf(c.suit) : 9)
  const rankKey = (c: Card) => (isJoker(c) ? 99 : c.rank === 1 ? 14 : c.rank)
  return [...cards].sort((a, b) =>
    mode === 'suit'
      ? suitIdx(a) - suitIdx(b) || rankKey(a) - rankKey(b)
      : rankKey(a) - rankKey(b) || suitIdx(a) - suitIdx(b),
  )
}
