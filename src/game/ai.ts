import { type Card, isJoker, penaltyValue, sortCards } from './cards'
import { type GameState, OPENING_POINTS, discard, draw, layDown, layOff, meld, rob, undoTurn } from './engine'
import { arrange, layOffInto, meldValue, robJoker } from './melds'

interface Plan {
  melds: Card[][]
  value: number
  cards: number
}

const without = (cards: Card[], remove: Card[]) => {
  const ids = new Set(remove.map((c) => c.id))
  return cards.filter((c) => !ids.has(c.id))
}

function subsets<T>(items: T[]): T[][] {
  return items.reduce<T[][]>((acc, x) => [...acc, ...acc.map((s) => [...s, x])], [[]])
}

/** All sets and runs from `cards` that contain `pivot`. Jokers are used to fill at most two gaps. */
function candidatesWith(pivot: Card, cards: Card[]): Card[][] {
  const jokers = cards.filter(isJoker)
  const out: Card[][] = []

  // Sets
  const bySuit = new Map<string, Card>()
  for (const c of cards) if (!isJoker(c) && c.rank === pivot.rank && c.suit !== pivot.suit) bySuit.set(c.suit!, c)
  for (const others of subsets([...bySuit.values()])) {
    for (let j = 0; j <= Math.min(jokers.length, 3 - others.length, 2); j++) {
      const size = 1 + others.length + j
      if (size >= 3 && (j === 0 || others.length >= 1)) out.push([pivot, ...others, ...jokers.slice(0, j)])
    }
  }

  // Runs
  const byRank = new Map<number, Card>()
  for (const c of cards) {
    if (isJoker(c) || c.suit !== pivot.suit || c.id === pivot.id) continue
    byRank.set(c.rank, c)
    if (c.rank === 1) byRank.set(14, c)
  }
  for (const pr of pivot.rank === 1 ? [1, 14] : [pivot.rank]) {
    const at = (r: number) => (r === pr ? pivot : byRank.get(r))
    for (let lo = Math.max(1, pr - 12); lo <= pr; lo++) {
      for (let hi = Math.max(pr, lo + 2); hi <= Math.min(14, lo + 12); hi++) {
        const run: Card[] = []
        let missing = 0
        for (let r = lo; r <= hi; r++) {
          const c = at(r)
          if (c && !run.includes(c)) run.push(c)
          else missing++
        }
        if (missing > Math.min(jokers.length, 2) || run.length < 2) continue
        out.push([...run, ...jokers.slice(0, missing)])
      }
    }
  }
  return out.filter((c) => arrange(c) !== null)
}

/** Searches for the best combination of melds in a hand. */
export function findMelds(hand: Card[], objective: 'value' | 'cards', mustInclude: string | null = null): Plan | null {
  let best: Plan | null = null
  let nodes = 0
  const score = (p: Plan) => (objective === 'value' ? p.value * 100 + p.cards : p.cards * 100 + p.value)

  const dfs = (remaining: Card[], chosen: Card[][], value: number) => {
    if (++nodes > 6000) return
    const used = chosen.flat()
    const plan = { melds: chosen, value, cards: used.length }
    if ((!mustInclude || used.some((c) => c.id === mustInclude)) && chosen.length > 0 && (!best || score(plan) > score(best)))
      best = plan
    const pivot = remaining.find((c) => !isJoker(c))
    if (!pivot) return
    if (objective === 'value' && best && value + remaining.reduce((s, c) => s + penaltyValue(c), 0) < best.value) return
    for (const cand of candidatesWith(pivot, remaining))
      dfs(without(remaining, cand), [...chosen, cand], value + meldValue(arrange(cand)!))
    if (pivot.id !== mustInclude) dfs(without(remaining, [pivot]), chosen, value)
  }
  dfs(sortCards(hand, 'suit'), [], 0)
  return best
}

function wantsDiscard(s: GameState, top: Card): boolean {
  const p = s.players[s.current]
  const hand = [...p.hand, top]
  if (!p.opened) return (findMelds(hand, 'value', top.id)?.value ?? 0) >= OPENING_POINTS
  if (s.table.some((m) => layOffInto(m, top))) return true
  return findMelds(hand, 'cards', top.id) !== null
}

/** Lower = less useful to keep. */
function usefulness(card: Card, hand: Card[]): number {
  let u = 0
  for (const o of hand) {
    if (o.id === card.id) continue
    if (isJoker(o)) continue
    if (o.rank === card.rank && o.suit !== card.suit) u += 3
    if (o.suit === card.suit) {
      const d = Math.min(Math.abs(o.rank - card.rank), card.rank === 1 ? Math.abs(14 - o.rank) : 99, o.rank === 1 ? Math.abs(14 - card.rank) : 99)
      if (d === 1) u += 3
      else if (d === 2) u += 1.5
    }
  }
  return u
}

function chooseDiscard(s: GameState): Card {
  const p = s.players[s.current]
  const options = p.hand.filter((c) => !isJoker(c) && c.id !== s.mustUse)
  if (options.length === 0) return p.hand[0]
  return options.reduce((best, c) => {
    const d = usefulness(c, p.hand) - usefulness(best, p.hand)
    return d < 0 || (d === 0 && penaltyValue(c) > penaltyValue(best)) ? c : best
  })
}

function playOpened(state: GameState): GameState {
  let s = state
  const ended = () => s.phase !== 'play'
  for (let guard = 0; guard < 30 && !ended(); guard++) {
    const p = s.players[s.current]
    let changed = false

    // Rob jokers whenever we hold the card they stand for.
    for (const m of s.table) {
      const slot = m.slots.findIndex((sl) => isJoker(sl.card))
      if (slot < 0) continue
      const card = p.hand.find((c) => robJoker(m, slot, c))
      if (card) {
        s = rob(s, card.id, m.id, slot)
        changed = true
        break
      }
    }
    if (changed) continue

    const mustUse = p.hand.some((c) => c.id === s.mustUse) ? s.mustUse : null
    const plan = findMelds(p.hand, 'cards', mustUse)
    if (plan) {
      for (const cards of plan.melds) if (!ended()) s = meld(s, cards.map((c) => c.id))
      continue
    }

    // Lay off naturals; jokers only when nearly out.
    for (const card of p.hand) {
      if (isJoker(card) && p.hand.length > 2) continue
      const target = s.table.find((m) => layOffInto(m, card))
      if (target) {
        s = layOff(s, card.id, target.id)
        changed = true
        break
      }
    }
    if (!changed) break
  }
  return s
}

/** Plays one complete turn for the current (computer) player. */
export function aiTurn(state: GameState, allowPickup = true): GameState {
  let s = state
  if (s.phase === 'draw') {
    const top = s.discard.at(-1)
    s = draw(s, allowPickup && top && wantsDiscard(s, top) ? 'discard' : 'stock')
    if (s.phase !== 'play') return s
  }

  const p = s.players[s.current]
  if (!p.opened) {
    const plan = findMelds(p.hand, 'value', s.mustUse)
    if (plan && plan.value >= OPENING_POINTS) {
      for (const cards of plan.melds) s = meld(s, cards.map((c) => c.id))
      s = layDown(s)
    }
  }
  if (s.phase === 'play' && s.players[s.current].opened) s = playOpened(s)
  if (s.phase !== 'play') return s

  // Couldn't use the picked-up discard after all: undo and draw from the stock instead.
  if (s.mustUse && s.players[s.current].hand.some((c) => c.id === s.mustUse)) return aiTurn(undoTurn(s), false)

  return discard(s, chooseDiscard(s).id)
}
