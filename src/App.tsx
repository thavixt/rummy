import { useEffect, useReducer, useRef, useState } from 'react'
import { CardBack, CardFace } from './components/Card'
import { MeldView } from './components/MeldView'
import { Rules } from './components/Rules'
import { aiTurn } from './game/ai'
import { sortCards } from './game/cards'
import {
  type GameState,
  OPENING_POINTS,
  RuleError,
  discard,
  draw,
  layDown,
  layOff,
  meld,
  newGame,
  rob,
  stagedPoints,
  startRound,
  takeBack,
  undoTurn,
} from './game/engine'
import { arrange, meldValue } from './game/melds'

const AI_NAMES = ['Bence', 'Anna', 'Zoli']
const AI_DELAY_MS = 1000

type Action =
  | { type: 'new'; opponents: number; seed: number }
  | { type: 'draw'; source: 'stock' | 'discard' }
  | { type: 'meld'; ids: string[] }
  | { type: 'layDown' }
  | { type: 'takeBack'; meldId: string }
  | { type: 'layOff'; cardId: string; meldId: string }
  | { type: 'rob'; cardId: string; meldId: string; slot: number }
  | { type: 'discard'; cardId: string }
  | { type: 'undo' }
  | { type: 'ai' }
  | { type: 'nextRound' }
  | { type: 'hint'; text: string | null }
  | { type: 'quit' }

interface State {
  game: GameState | null
  error: string | null
}

function apply(game: GameState, action: Action): GameState {
  const humanTurn = game.players[game.current].human
  if (action.type === 'ai') return humanTurn ? game : aiTurn(game)
  if (action.type === 'nextRound') return startRound(game)
  if (!humanTurn) throw new RuleError("Wait for your turn.")
  switch (action.type) {
    case 'draw':
      return draw(game, action.source)
    case 'meld':
      return meld(game, action.ids)
    case 'layDown':
      return layDown(game)
    case 'takeBack':
      return takeBack(game, action.meldId)
    case 'layOff':
      return layOff(game, action.cardId, action.meldId)
    case 'rob':
      return rob(game, action.cardId, action.meldId, action.slot)
    case 'discard':
      return discard(game, action.cardId)
    case 'undo':
      return undoTurn(game)
  }
  return game
}

function reducer(state: State, action: Action): State {
  if (action.type === 'new')
    return { game: newGame(['You', ...AI_NAMES.slice(0, action.opponents)], action.seed), error: null }
  if (action.type === 'quit') return { game: null, error: null }
  if (action.type === 'hint') return { ...state, error: action.text }
  if (!state.game) return state
  try {
    return { game: apply(state.game, action), error: null }
  } catch (e) {
    if (e instanceof RuleError) return { ...state, error: e.message }
    throw e
  }
}

export default function App() {
  const [{ game, error }, dispatch] = useReducer(reducer, { game: null, error: null })
  const [showRules, setShowRules] = useState(false)

  useEffect(() => {
    if (!game || game.phase === 'roundOver' || game.players[game.current].human) return
    const t = setTimeout(() => dispatch({ type: 'ai' }), AI_DELAY_MS)
    return () => clearTimeout(t)
  }, [game])

  return (
    <div className="min-h-svh bg-[radial-gradient(ellipse_at_center,#166534_0%,#14532d_60%,#052e16_100%)] text-emerald-50">
      {game ? (
        <Board game={game} error={error} dispatch={dispatch} onRules={() => setShowRules(true)} />
      ) : (
        <Setup onStart={(opponents) => dispatch({ type: 'new', opponents, seed: Date.now() })} onRules={() => setShowRules(true)} />
      )}
      {showRules && <Rules onClose={() => setShowRules(false)} />}
    </div>
  )
}

function Setup({ onStart, onRules }: { onStart: (opponents: number) => void; onRules: () => void }) {
  const [opponents, setOpponents] = useState(2)
  return (
    <div className="mx-auto flex min-h-svh max-w-md flex-col items-center justify-center gap-8 px-4 text-center">
      <div>
        <div className="mb-3 text-5xl">🂡 🃏 🂮</div>
        <h1 className="text-5xl font-bold tracking-tight text-white">Rabló römi</h1>
        <p className="mt-2 text-emerald-200">The Hungarian “robber rummy” — steal the jokers!</p>
      </div>
      <div className="w-full rounded-xl bg-black/20 p-5">
        <div className="mb-3 text-sm text-emerald-200">Computer opponents</div>
        <div className="flex justify-center gap-2">
          {[1, 2, 3].map((n) => (
            <button
              key={n}
              type="button"
              onClick={() => setOpponents(n)}
              className={`h-12 w-14 rounded-lg text-lg font-semibold ${opponents === n ? 'bg-amber-400 text-stone-900' : 'bg-white/10 hover:bg-white/20'}`}
            >
              {n}
            </button>
          ))}
        </div>
        <button
          type="button"
          onClick={() => onStart(opponents)}
          className="mt-5 w-full rounded-lg bg-amber-400 py-3 text-lg font-bold text-stone-900 shadow hover:bg-amber-300"
        >
          Deal the cards
        </button>
      </div>
      <button type="button" onClick={onRules} className="text-sm text-emerald-200 underline underline-offset-4 hover:text-white">
        How to play
      </button>
    </div>
  )
}

interface BoardProps {
  game: GameState
  error: string | null
  dispatch: (a: Action) => void
  onRules: () => void
}

function Board({ game, error, dispatch, onRules }: BoardProps) {
  const [selected, setSelected] = useState<string[]>([])
  const [sortMode, setSortMode] = useState<'suit' | 'rank'>('suit')
  const logRef = useRef<HTMLDivElement>(null)

  const human = game.players[0]
  const current = game.players[game.current]
  const myTurn = current.human && game.phase !== 'roundOver'
  const canDraw = myTurn && game.phase === 'draw'
  const canPlay = myTurn && game.phase === 'play'
  const hand = sortCards(human.hand, sortMode)
  const sel = selected.filter((id) => human.hand.some((c) => c.id === id))
  const selectedCards = sel.map((id) => human.hand.find((c) => c.id === id)!)
  const preview = sel.length >= 3 ? arrange(selectedCards) : null

  useEffect(() => {
    logRef.current?.scrollTo({ top: logRef.current.scrollHeight })
  }, [game.log])

  // Selection keeps itself in sync: cards that leave the hand drop out of `sel`.
  const act = (a: Action) => {
    dispatch(a)
    if (a.type === 'undo' || a.type === 'nextRound') setSelected([])
  }
  const toggle = (id: string) => setSelected(sel.includes(id) ? sel.filter((x) => x !== id) : [...sel, id])

  const onMeldClick = (meldId: string) => {
    if (!canPlay) return
    if (sel.length !== 1) return dispatch({ type: 'hint', text: 'Select one card from your hand, then click a meld to add it.' })
    act({ type: 'layOff', cardId: sel[0], meldId })
  }
  const onJokerClick = (meldId: string, slot: number) => {
    if (!canPlay) return
    if (sel.length !== 1) return dispatch({ type: 'hint', text: 'Select the card the joker stands for, then click the joker to rob it.' })
    act({ type: 'rob', cardId: sel[0], meldId, slot })
  }

  const status = (() => {
    if (game.phase === 'roundOver') return 'Round over'
    if (!myTurn) return `${current.name} is thinking…`
    if (game.phase === 'draw') return 'Your turn — draw from the stock or take the top discard.'
    if (game.mustUse && human.hand.some((c) => c.id === game.mustUse)) return 'Use the card you picked up in a meld, then discard.'
    if (!human.opened) return `Build melds worth ${OPENING_POINTS}+ points to come down, or discard to end your turn.`
    return 'Meld, add to the table or rob jokers — then discard one card.'
  })()

  const topDiscard = game.discard.at(-1)
  const secondDiscard = game.discard.at(-2)

  return (
    <div className="mx-auto flex min-h-svh max-w-6xl flex-col gap-3 px-3 py-3 sm:px-4">
      {/* Header */}
      <header className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-baseline gap-3">
          <h1 className="text-2xl font-bold tracking-tight text-white">Rabló römi</h1>
          <span className="text-sm text-emerald-200">Round {game.round}</span>
        </div>
        <div className="flex gap-2 text-sm">
          <button type="button" onClick={onRules} className="rounded-md bg-white/10 px-3 py-1.5 hover:bg-white/20">
            Rules
          </button>
          <button
            type="button"
            onClick={() => confirm('Quit this game?') && dispatch({ type: 'quit' })}
            className="rounded-md bg-white/10 px-3 py-1.5 hover:bg-white/20"
          >
            New game
          </button>
        </div>
      </header>

      {/* Opponents */}
      <section className="grid grid-cols-1 gap-2 sm:grid-cols-3">
        {game.players.slice(1).map((p, i) => {
          const active = game.current === i + 1 && game.phase !== 'roundOver'
          return (
            <div
              key={p.name}
              className={`rounded-lg px-3 py-2 transition ${active ? 'bg-amber-300/20 ring-2 ring-amber-300' : 'bg-black/20'}`}
            >
              <div className="flex items-center justify-between text-sm">
                <span className="font-semibold text-white">
                  {p.name}
                  {active && <span className="ml-2 animate-pulse text-amber-200">●</span>}
                </span>
                <span className="text-emerald-200">{p.score} pts</span>
              </div>
              <div className="mt-1.5 flex items-center gap-2">
                <div className="flex">
                  {p.hand.map((c, j) => (
                    <CardBack key={c.id} size="xs" className={j > 0 ? '-ml-3' : ''} />
                  ))}
                </div>
                <span className="text-xs text-emerald-200">{p.hand.length}</span>
                {p.opened && <span className="ml-auto rounded bg-emerald-400/20 px-1.5 text-xs text-emerald-200">came down</span>}
              </div>
            </div>
          )
        })}
      </section>

      <div className="grid flex-1 grid-cols-1 gap-3 lg:grid-cols-[1fr_240px]">
        {/* Table */}
        <section className="flex min-h-[220px] gap-4 rounded-xl border border-white/10 bg-black/10 p-3">
          <div className="flex shrink-0 flex-col items-center gap-3">
            <button
              type="button"
              disabled={!canDraw}
              onClick={() => act({ type: 'draw', source: 'stock' })}
              className={`relative rounded-md ${canDraw ? 'cursor-pointer ring-2 ring-amber-300 hover:-translate-y-1' : ''} transition`}
              title="Draw from the stock"
            >
              <CardBack />
              <span className="absolute inset-x-0 -bottom-5 text-center text-xs text-emerald-200">{game.stock.length}</span>
            </button>
            <div className="relative mt-4">
              {secondDiscard && (
                <div className="absolute top-0 left-0 rotate-[-6deg] opacity-70">
                  <CardFace card={secondDiscard} />
                </div>
              )}
              {topDiscard ? (
                <CardFace
                  card={topDiscard}
                  className={canDraw ? 'ring-2 ring-amber-300' : ''}
                  title="Take the top discard (you must use it this turn)"
                  onClick={canDraw ? () => act({ type: 'draw', source: 'discard' }) : undefined}
                />
              ) : (
                <div className="grid h-[80px] w-[56px] place-items-center rounded-md border-2 border-dashed border-white/20 text-[10px] text-white/40 sm:h-[96px] sm:w-[68px]">
                  discard
                </div>
              )}
            </div>
          </div>
          <div className="flex flex-1 flex-wrap content-start gap-2">
            {game.table.length === 0 && (
              <div className="m-auto text-sm text-emerald-200/60">No melds on the table yet.</div>
            )}
            {game.table.map((m) => (
              <MeldView
                key={m.id}
                meld={m}
                ownerName={game.players[m.owner].name}
                highlight={m.updatedTurn >= game.turn - 1}
                onClick={canPlay ? () => onMeldClick(m.id) : undefined}
                onJokerClick={canPlay ? (slot) => onJokerClick(m.id, slot) : undefined}
              />
            ))}
          </div>
        </section>

        {/* Log */}
        <aside
          ref={logRef}
          className="h-40 overflow-y-auto rounded-xl bg-black/20 p-3 text-left text-xs leading-relaxed text-emerald-100/90 lg:h-auto lg:max-h-[420px]"
        >
          {game.log.map((line, i) => (
            <div key={i} className={i === game.log.length - 1 ? 'text-white' : ''}>
              {line}
            </div>
          ))}
        </aside>
      </div>

      {/* Staged opening melds */}
      {human.staged.length > 0 && (
        <section className="rounded-xl border border-amber-300/40 bg-amber-200/5 p-3">
          <div className="mb-2 flex flex-wrap items-center gap-3">
            <span className="text-sm">
              Opening:{' '}
              <b className={stagedPoints(human) >= OPENING_POINTS ? 'text-emerald-300' : 'text-amber-200'}>
                {stagedPoints(human)} / {OPENING_POINTS}
              </b>{' '}
              points
            </span>
            <button
              type="button"
              disabled={stagedPoints(human) < OPENING_POINTS}
              onClick={() => act({ type: 'layDown' })}
              className="rounded-md bg-amber-400 px-3 py-1 text-sm font-semibold text-stone-900 hover:bg-amber-300 disabled:opacity-40"
            >
              Come down
            </button>
          </div>
          <div className="flex flex-wrap gap-2">
            {human.staged.map((m) => (
              <MeldView key={m.id} meld={m} dashed onRemove={() => act({ type: 'takeBack', meldId: m.id })} />
            ))}
          </div>
        </section>
      )}

      {/* Player area */}
      <section className={`rounded-xl p-3 ${myTurn ? 'bg-amber-300/10 ring-2 ring-amber-300/70' : 'bg-black/20'}`}>
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <div className="text-left text-sm">
            <span className="font-semibold text-white">You</span>
            <span className="ml-2 text-emerald-200">{human.score} pts</span>
            {human.opened && <span className="ml-2 rounded bg-emerald-400/20 px-1.5 text-xs text-emerald-200">came down</span>}
            <div className="text-emerald-100">{status}</div>
          </div>
          <div className="flex flex-wrap gap-1.5 text-sm">
            <button
              type="button"
              disabled={!canPlay || sel.length < 3}
              onClick={() => act({ type: 'meld', ids: sel })}
              className="rounded-md bg-emerald-500 px-3 py-1.5 font-semibold text-white hover:bg-emerald-400 disabled:opacity-40"
            >
              Meld{sel.length >= 3 ? ` (${sel.length})` : ''}
            </button>
            <button
              type="button"
              disabled={!canPlay || sel.length !== 1}
              onClick={() => act({ type: 'discard', cardId: sel[0] })}
              className="rounded-md bg-rose-500 px-3 py-1.5 font-semibold text-white hover:bg-rose-400 disabled:opacity-40"
            >
              Discard
            </button>
            <button
              type="button"
              disabled={!canPlay}
              onClick={() => act({ type: 'undo' })}
              className="rounded-md bg-white/10 px-3 py-1.5 hover:bg-white/20 disabled:opacity-40"
            >
              Undo turn
            </button>
            <button
              type="button"
              onClick={() => setSortMode(sortMode === 'suit' ? 'rank' : 'suit')}
              className="rounded-md bg-white/10 px-3 py-1.5 hover:bg-white/20"
            >
              Sort: {sortMode}
            </button>
          </div>
        </div>

        <div className="min-h-5 text-left text-sm">
          {error ? (
            <span className="text-rose-300">{error}</span>
          ) : preview ? (
            <span className="text-emerald-300">
              {preview.kind === 'set' ? 'Set' : 'Run'} worth {meldValue(preview)} points
            </span>
          ) : sel.length >= 3 ? (
            <span className="text-amber-200">Not a valid set or run</span>
          ) : null}
        </div>

        <div className="flex flex-wrap justify-center gap-y-4 pt-4 pl-6 sm:pl-5">
          {hand.map((c) => (
            <CardFace
              key={c.id}
              card={c}
              selected={sel.includes(c.id)}
              highlight={myTurn && c.id === game.drawnCard}
              className="-ml-6 sm:-ml-5"
              onClick={() => toggle(c.id)}
            />
          ))}
        </div>
      </section>

      {game.phase === 'roundOver' && game.result && (
        <RoundOver game={game} onNext={() => act({ type: 'nextRound' })} />
      )}
    </div>
  )
}

function RoundOver({ game, onNext }: { game: GameState; onNext: () => void }) {
  const { winner, penalties } = game.result!
  return (
    <div className="fixed inset-0 z-40 grid place-items-center bg-black/50 p-4">
      <div className="w-full max-w-sm rounded-xl bg-stone-50 p-6 text-stone-800 shadow-2xl">
        <h2 className="text-2xl font-bold text-stone-900">
          {winner === null ? 'No winner' : winner === 0 ? 'You won the round! 🎉' : `${game.players[winner].name} won the round`}
        </h2>
        <table className="mt-4 w-full text-sm">
          <thead>
            <tr className="text-stone-500">
              <th className="py-1 text-left font-medium">Player</th>
              <th className="py-1 text-right font-medium">This round</th>
              <th className="py-1 text-right font-medium">Total</th>
            </tr>
          </thead>
          <tbody>
            {game.players.map((p, i) => (
              <tr key={p.name} className="border-t border-stone-200">
                <td className="py-1.5 text-left">{p.name}</td>
                <td className="py-1.5 text-right">+{penalties[i]}</td>
                <td className="py-1.5 text-right font-semibold">{p.score}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="mt-2 text-xs text-stone-500">Penalty points — lowest total is winning.</p>
        <button
          type="button"
          onClick={onNext}
          className="mt-5 w-full rounded-lg bg-emerald-600 py-2.5 font-semibold text-white hover:bg-emerald-500"
        >
          Deal next round
        </button>
      </div>
    </div>
  )
}
