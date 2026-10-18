import { OPENING_POINTS } from '../game/engine'

export function Rules({ onClose }: { onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/60 p-4" onClick={onClose}>
      <div
        className="max-h-[85svh] w-full max-w-xl overflow-y-auto rounded-xl bg-stone-50 p-6 text-left text-sm leading-relaxed text-stone-800 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-start justify-between">
          <h2 className="text-xl font-bold text-stone-900">How to play Rabló römi</h2>
          <button type="button" onClick={onClose} className="rounded px-2 text-lg hover:bg-stone-200">
            ✕
          </button>
        </div>
        <p className="mb-3">
          Two 52-card decks and 4 jokers. Everyone gets 14 cards; the starting player gets 15 and begins by discarding. Be the
          first to get rid of all your cards.
        </p>
        <h3 className="mt-4 font-semibold text-stone-900">Your turn</h3>
        <ol className="ml-5 list-decimal space-y-1">
          <li>
            <b>Draw</b> one card from the stock, <i>or</i> take the top card of the discard pile — but only if you use it in a
            meld that same turn.
          </li>
          <li>
            <b>Play</b> (optional): put down melds, add cards to any meld on the table, or rob jokers.
          </li>
          <li>
            <b>Discard</b> one card to end your turn.
          </li>
        </ol>
        <h3 className="mt-4 font-semibold text-stone-900">Melds</h3>
        <ul className="ml-5 list-disc space-y-1">
          <li>
            <b>Set:</b> 3–4 cards of the same rank, all different suits (7♠ 7♥ 7♣).
          </li>
          <li>
            <b>Run:</b> 3+ consecutive cards of one suit (4♥ 5♥ 6♥). Ace can be low (A-2-3) or high (Q-K-A), but can't wrap
            around (K-A-2).
          </li>
          <li>A joker can stand in for any card.</li>
        </ul>
        <h3 className="mt-4 font-semibold text-stone-900">Coming down (leszállás)</h3>
        <p>
          Your first lay-down must be worth at least <b>{OPENING_POINTS} points</b>, from melds made only from your own cards.
          Card values: 2–10 face value, J/Q/K 10, Ace 11 (1 in A-2-3), and a joker is worth the card it replaces. Until you've
          come down, you can't add to other melds or rob jokers.
        </p>
        <h3 className="mt-4 font-semibold text-stone-900">Robbing (rablás)</h3>
        <p>
          Once you've come down, you can swap a joker on the table for the real card it stands for, and take the joker into your
          hand. Select the card in your hand, then click the joker.
        </p>
        <h3 className="mt-4 font-semibold text-stone-900">Scoring</h3>
        <p>
          When someone goes out, everyone else adds up the cards left in their hand as penalty points (Ace 11, faces 10,
          joker 20). Lowest total wins.
        </p>
        <h3 className="mt-4 font-semibold text-stone-900">Controls</h3>
        <ul className="ml-5 list-disc space-y-1">
          <li>Click the stock or discard pile to draw.</li>
          <li>Click cards in your hand to select them, then use the buttons: Meld, Discard.</li>
          <li>To add a card to a table meld, select one card and click the meld.</li>
          <li>Undo turn takes back everything since your draw (or the draw itself, if you took the discard).</li>
        </ul>
      </div>
    </div>
  )
}
