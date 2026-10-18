import { type Card, cardLabel, createDeck, penaltyValue, shuffle } from './cards'
import { type Meld, arrange, layOffInto, meldValue, robJoker } from './melds'

export const HAND_SIZE = 14
export const OPENING_POINTS = 51

export type Phase = 'draw' | 'play' | 'roundOver'

export interface Player {
  name: string
  human: boolean
  hand: Card[]
  /** Has laid down their opening 51 points ("leszállt"). */
  opened: boolean
  /** Melds built this turn but not yet laid down (only before opening). */
  staged: Meld[]
  score: number
}

interface Snapshot {
  players: Player[]
  table: Meld[]
  stock: Card[]
  discard: Card[]
  mustUse: string | null
  drawSource: 'stock' | 'discard' | null
  phase: Phase
  log: string[]
}

export interface RoundResult {
  winner: number | null
  penalties: number[]
}

export interface GameState {
  players: Player[]
  current: number
  phase: Phase
  stock: Card[]
  discard: Card[]
  table: Meld[]
  /** Card picked up from the discard pile that must be melded this turn. */
  mustUse: string | null
  drawSource: 'stock' | 'discard' | null
  /** The card the current player drew this turn (for highlighting). */
  drawnCard: string | null
  round: number
  turn: number
  seed: number
  nextId: number
  log: string[]
  result: RoundResult | null
  /** Before drawing — undo target when the discard was taken (it's public, so nothing leaks). */
  turnStart: Snapshot | null
  /** After drawing — undo target otherwise, so a drawn card can't be put back. */
  playStart: Snapshot | null
}

export class RuleError extends Error {}

const fail = (msg: string): never => {
  throw new RuleError(msg)
}

function snapshot(s: GameState): Snapshot {
  const { players, table, stock, discard, mustUse, drawSource, phase, log } = s
  return structuredClone({ players, table, stock, discard, mustUse, drawSource, phase, log })
}

function addLog(s: GameState, line: string) {
  s.log = [...s.log.slice(-60), line]
}

function clone(state: GameState): GameState {
  return structuredClone(state)
}

export function newGame(names: string[], seed: number): GameState {
  const state: GameState = {
    players: names.map((name, i) => ({ name, human: i === 0, hand: [], opened: false, staged: [], score: 0 })),
    current: 0,
    phase: 'draw',
    stock: [],
    discard: [],
    table: [],
    mustUse: null,
    drawSource: null,
    drawnCard: null,
    round: 0,
    turn: 0,
    seed,
    nextId: 1,
    log: [],
    result: null,
    turnStart: null,
    playStart: null,
  }
  return startRound(state)
}

/** Deals a new round. The starting player gets 15 cards and begins by playing (no draw). */
export function startRound(state: GameState): GameState {
  const s = clone(state)
  const { items: deck, seed } = shuffle(createDeck(), s.seed)
  s.seed = seed
  s.round += 1
  s.current = (s.round - 1) % s.players.length
  for (const [i, p] of s.players.entries()) {
    p.hand = deck.splice(0, HAND_SIZE + (i === s.current ? 1 : 0))
    p.opened = false
    p.staged = []
  }
  s.stock = deck
  s.discard = []
  s.table = []
  s.mustUse = null
  s.drawSource = null
  s.phase = 'play'
  s.result = null
  s.log = [`Round ${s.round} begins. ${s.players[s.current].name} start${s.players[s.current].human ? '' : 's'} with 15 cards.`]
  s.turnStart = snapshot(s)
  s.playStart = s.turnStart
  return s
}

const me = (s: GameState) => s.players[s.current]

function takeFromHand(p: Player, ids: string[]): Card[] {
  return ids.map((id) => {
    const idx = p.hand.findIndex((c) => c.id === id)
    if (idx < 0) fail('That card is not in your hand.')
    return p.hand.splice(idx, 1)[0]
  })
}

function requirePlay(s: GameState) {
  if (s.phase === 'draw') fail('Draw a card first — from the stock or the discard pile.')
  if (s.phase !== 'play') fail('The round is over.')
}

export function draw(state: GameState, source: 'stock' | 'discard'): GameState {
  if (state.phase !== 'draw') fail('You have already drawn this turn.')
  const s = clone(state)
  const p = me(s)
  if (source === 'discard') {
    const card = s.discard.pop() ?? fail('The discard pile is empty.')
    p.hand.push(card)
    s.mustUse = card.id
    addLog(s, `${p.name} took ${cardLabel(card)} from the discard pile.`)
  } else {
    if (s.stock.length === 0) {
      // Reshuffle everything but the top discard back into the stock.
      const top = s.discard.pop()
      const { items, seed } = shuffle(s.discard, s.seed)
      s.stock = items
      s.seed = seed
      s.discard = top ? [top] : []
      if (s.stock.length === 0) return endRound(s, null)
      addLog(s, 'The discard pile was shuffled into a new stock.')
    }
    p.hand.push(s.stock.pop()!)
    addLog(s, `${p.name} drew from the stock.`)
  }
  s.drawnCard = p.hand[p.hand.length - 1].id
  s.drawSource = source
  s.phase = 'play'
  s.playStart = snapshot(s)
  return s
}

/** Form a meld from cards in hand. Before opening it is staged until laid down. */
export function meld(state: GameState, cardIds: string[]): GameState {
  requirePlay(state)
  const s = clone(state)
  const p = me(s)
  const cards = takeFromHand(p, cardIds)
  const arrangement = arrange(cards) ?? fail('Those cards are not a valid set or run.')
  const m: Meld = { ...arrangement, id: `m${s.nextId++}`, owner: s.current, updatedTurn: s.turn }
  if (p.opened) {
    s.table.push(m)
    addLog(s, `${p.name} melded ${describe(m)}.`)
    return checkWin(s)
  }
  p.staged.push(m)
  return s
}

export function stagedPoints(p: Player): number {
  return p.staged.reduce((sum, m) => sum + meldValue(m), 0)
}

export function layDown(state: GameState): GameState {
  requirePlay(state)
  const p0 = me(state)
  if (p0.opened || p0.staged.length === 0) fail('Build some melds first.')
  const points = stagedPoints(p0)
  if (points < OPENING_POINTS) fail(`Your first lay-down needs at least ${OPENING_POINTS} points (you have ${points}).`)
  const s = clone(state)
  const p = me(s)
  s.table.push(...p.staged.map((m) => ({ ...m, updatedTurn: s.turn })))
  addLog(s, `${p.name} laid down ${p.staged.length} meld${p.staged.length > 1 ? 's' : ''} for ${points} points.`)
  p.staged = []
  p.opened = true
  return checkWin(s)
}

export function takeBack(state: GameState, meldId: string): GameState {
  const s = clone(state)
  const p = me(s)
  const idx = p.staged.findIndex((m) => m.id === meldId)
  if (idx < 0) return state
  p.hand.push(...p.staged[idx].slots.map((sl) => sl.card))
  p.staged.splice(idx, 1)
  return s
}

function requireOpened(p: Player) {
  if (!p.opened) fail(`You can only add to the table after your first lay-down (${OPENING_POINTS} points).`)
}

export function layOff(state: GameState, cardId: string, meldId: string): GameState {
  requirePlay(state)
  requireOpened(me(state))
  const s = clone(state)
  const p = me(s)
  const idx = s.table.findIndex((m) => m.id === meldId)
  if (idx < 0) fail('That meld is not on the table.')
  const card = p.hand.find((c) => c.id === cardId) ?? fail('That card is not in your hand.')
  const updated = layOffInto(s.table[idx], card) ?? fail(`${cardLabel(card)} doesn't fit that meld.`)
  takeFromHand(p, [cardId])
  s.table[idx] = { ...updated, updatedTurn: s.turn }
  addLog(s, `${p.name} added ${cardLabel(card)} to ${describe(updated)}.`)
  return checkWin(s)
}

/** "Rablás": swap a natural card for a joker on the table and take the joker. */
export function rob(state: GameState, cardId: string, meldId: string, slotIndex: number): GameState {
  requirePlay(state)
  requireOpened(me(state))
  const s = clone(state)
  const p = me(s)
  const idx = s.table.findIndex((m) => m.id === meldId)
  if (idx < 0) fail('That meld is not on the table.')
  const card = p.hand.find((c) => c.id === cardId) ?? fail('That card is not in your hand.')
  const res = robJoker(s.table[idx], slotIndex, card) ?? fail(`${cardLabel(card)} can't replace that joker.`)
  takeFromHand(p, [cardId])
  p.hand.push(res.joker)
  s.table[idx] = { ...res.meld, updatedTurn: s.turn }
  addLog(s, `${p.name} robbed a joker with ${cardLabel(card)}!`)
  return s
}

export function discard(state: GameState, cardId: string): GameState {
  requirePlay(state)
  const p0 = me(state)
  if (p0.staged.length > 0) fail('Lay down your melds (or take them back) before discarding.')
  if (state.mustUse && p0.hand.some((c) => c.id === state.mustUse))
    fail('The card you took from the discard pile must be used in a meld this turn.')
  const s = clone(state)
  const p = me(s)
  const [card] = takeFromHand(p, [cardId])
  s.discard.push(card)
  addLog(s, `${p.name} discarded ${cardLabel(card)}.`)
  if (p.hand.length === 0) return endRound(s, s.current)
  return nextTurn(s)
}

/** Reverts everything done this turn (except seeing a card drawn from the stock). */
export function undoTurn(state: GameState): GameState {
  const snap = state.drawSource === 'discard' ? state.turnStart : state.playStart
  if (!snap) return state
  return { ...clone(state), ...structuredClone(snap) }
}

function nextTurn(s: GameState): GameState {
  s.current = (s.current + 1) % s.players.length
  s.phase = 'draw'
  s.mustUse = null
  s.drawSource = null
  s.drawnCard = null
  s.turn += 1
  s.turnStart = snapshot(s)
  s.playStart = null
  return s
}

function checkWin(s: GameState): GameState {
  return me(s).hand.length === 0 && me(s).staged.length === 0 ? endRound(s, s.current) : s
}

function endRound(s: GameState, winner: number | null): GameState {
  const penalties = s.players.map((p, i) => {
    if (i === winner) return 0
    const cards = [...p.hand, ...p.staged.flatMap((m) => m.slots.map((sl) => sl.card))]
    return cards.reduce((sum, c) => sum + penaltyValue(c), 0)
  })
  s.players.forEach((p, i) => (p.score += penalties[i]))
  s.phase = 'roundOver'
  s.result = { winner, penalties }
  addLog(s, winner === null ? 'The stock ran out — no winner this round.' : `${s.players[winner].name} went out and won the round!`)
  return s
}

export function describe(m: Meld): string {
  return m.slots.map((sl) => cardLabel(sl.card)).join(' ')
}
