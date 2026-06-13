# Azul: Queen's Garden — Engine Model

> **Role:** the structured model *derived* from `rules.md`, and the thing we codify
> the engine from. Organized by the same five questions from `MODELLING.md`,
> scaled up. Resolvers stay stubbed until Pass 3.

**Target player count (first build):** _(TBD — pick one to cut branching; 2P suggested)_

---

## Q1 & Q5 — Situations (the phase hierarchy)

A nested state machine, not a flat list. Filled in Pass 1.

```
Game
├─ Setup              (seed + deal supply; each player: empty section in centre slot)
├─ Round (×4)
│    ├─ Turn loop:    active players take turns; on your turn do ONE of
│    │                  { take tiles | take sections | place sections |
│    │                    place tiles on sections | pass }
│    │                a passed player is skipped; loop ends when ALL have passed.
│    │                first to pass → −1 pt at scoring, and goes first next round.
│    └─ Round scoring (scoring wheel + first-passer penalty)
└─ End-game scoring → Game Over
```

_(Round 1's first player is set at setup; each later round's first player is the previous
round's first-to-pass.)_

## Q2 — Snapshot (the state structure)

The smallest complete, serializable snapshot. Run the Resume Test per region.
Expect a **random seed** (deterministic draws/replay) and a few **history-dependent**
fields that can't be derived (the chess-castling lesson).

| Region | Fields | Notes |
|---|---|---|
| Supply / pools | **Tile bag** (remaining of 108) + **discard pile** + **section pool** (remaining of ~36) + **seed** | bag-empty → shuffle discard back in (seed-driven, must be logged); batch draws & section picks seed-driven |
| Central area (per round) | **Pile** of this round's n sections (n=5/6/7); the **top** section holds 4 tiles; **split-off sections** each hold their leftover tiles (still draftable). Draft source = **all tiles in the central area**. A section is **takeable once emptied** (derived: tiles == 0). | top splits when <4 → next revealed w/ 4 fresh; leftovers discarded at round end |
| Scoring wheel | _(current position)_ | changes per round |
| Per player | **Play area** = 7 section slots (1 centre + 6 edge); centre starts with the **blank starter section** (6 free spaces, no identity), edges start empty. Each placed **non-centre section** carries a (colour, symbol) **identity tile** in 1 slot, leaving **5 free**. **Storage**: an **ordered tile area** (`StorageItem[]` of tiles + coins, ≤ **12**; starts with 3 coins; rearrangeable) + **2 sections**. **Score**. **Passed-this-round** flag. | section identity is game-relevant (scoring); ≤ 6 + 6×5 = **36** placeable spaces; passed-flag stored |
| Bookkeeping | round # (1–4), whose turn, **first-passer this round** (∅ until someone passes), phase | first-passer is history-dependent → stored; sets the −1 penalty and next round's first player |

## Q3 — Derive vs store

- **Stored (irreducible):** the tile **bag**, **discard**, and **section pool** (the actual
  remaining items); the **rng** state (determinism); the **central area** layout (pile / top /
  open — a product of draw history); each player's **play area**, **storage**, and **score**.
- **Stored (history-dependent — not derivable):** **currentPlayer** (turn order is
  path-dependent via passing/skips — the chess "side to move" lesson, *unlike* TTT where we
  derived it from a count); **firstPasser** and each player's **passed** flag (within-round
  history); the **round #**.
- **Derived (never stored):** **status/phase** (`round > ROUND_COUNT ? GameOver : Playing`);
  whether a section is **takeable** (`open display tiles == 0`); **draftable attributes** and
  legal moves (computed on demand); tile/coin **counts** in storage (`storageTiles` /
  `storageCoins`).
- **Decision — score is stored, not derived:** points accrue *during* play (round scoring + the
  −1 first-passer penalty) rather than being recomputable from the final board, so the running
  **score** is stored and mutated by the scoring resolvers.
- **Open — scoring-wheel position:** currently to-be-stored; *could* be derived from the round #
  if its rotation is fixed. Revisit when the wheel is modelled.

## Q4 — Actions (precondition + effect)

One row per action type. Precondition feeds a single `illegalReason`; effect is the
pure state transform. Filled in Pass 2.

| Action | Parameters | Legal when (precondition) | Effect |
|---|---|---|---|
| Take (draft) | chosen **colour**/**symbol** + which copy of each duplicated combo | ≥1 draftable item bears it; one instance per **distinct** matching combo, chosen & present; distinct tiles ≤ free tile storage (12) **and** sections ≤ free section storage (2) | one chosen tile per distinct matching combo **and** all matching draftable sections → storage; then resolve splits/reveals |
| Place section | _(stored section, target slot)_ | slot empty & playable; section in storage; … | section fills the slot |
| Place tiles | _(stored tile[s], target space[s])_ | space in a placed section & empty; tile in storage; … | tile fills the space |
| Pass | — | it's your turn & not yet passed | mark passed this round; _(cost/turn-order effect TBD)_ |

## Resolvers (stubbed until Pass 3)

- **Round scoring** — _(wheel-based; pure function over board state)_; also applies the
  **−1 first-passer penalty** for the round.
- **End-game scoring** — _(set/group bonuses, penalties; pure functions, tested in isolation)_

## Decisions & Open Questions

A numbered log. Every rulebook ambiguity we resolve, and every modeling choice,
gets an entry — these are the future-bugs we're heading off.

1. ~~Are garden sections drafted & placed, or pre-set?~~ **RESOLVED:** drafted (`take sections`)
   and placed (`place sections`); centre slot starts with an empty section; the 6 edge slots
   start empty and need a section before tiles. *Remaining:* per-count section numbers.
2. ~~Does a garden section's centre symbol constrain placement/scoring?~~ **RESOLVED:** the
   centre symbol is **purely decorative** — no gameplay effect; not modelled.
3. Are the **6 tile spaces** of a section positionally distinct (fixed orientation, each edge
   meaningful) or interchangeable? — *hex adjacency / placement.*
4. ~~Does storage hold tiles + sections; is it bounded?~~ **RESOLVED:** holds both; capped at
   **12 tiles and 2 sections** (a precondition on the `take` actions).
5. **Adjacency across sections:** do edge tiles of neighbouring sections count as adjacent for
   scoring? — *the hex shape "affects alignment".*
6. ~~Round end & passing?~~ **RESOLVED:** round ends when all have passed; the first to pass
   loses **1 point** (at this round's scoring) and is **first player next round**.
7. ~~One action per turn?~~ **RESOLVED:** exactly one action (or pass) per turn.
8. **Placing a section:** any empty edge slot, or only adjacent to an already-placed section
   (growing outward from the centre)?
9. ~~Section supply / are sections identical?~~ **RESOLVED:** exactly **36** sections, one per
   colour+symbol combo; each carries its combo as an **immovable identity tile** in 1 of its 6
   slots (5 free). The **central starter** is blank (6 free, no identity). Per-round selection
   draws n at random (n = 5/6/7). So a section IS game-relevant data (its colour + symbol).
10. ~~Take tiles vs. take sections — separate or combined?~~ **RESOLVED:** **combined.** One draft
    action picks a **colour or a symbol** and takes **every** draftable tile *and* section
    bearing it (gated by both storage limits). _Slice follow-up: collapse the engine's
    `take-tiles`/`take-sections` into one parameterised `draft` action in Pass 2._
11. ~~Split-off sections + leftover tiles?~~ **RESOLVED:** a split section **carries its leftover
    tiles** (still draftable); the **section** becomes takeable once **all 4 tiles are drafted**.
12. ~~Batch draws random from supply?~~ **RESOLVED:** yes, random draws (seed-driven).
13. ~~Draft source?~~ **RESOLVED:** from **any tiles in the central area** (top batch + leftovers).
    *(How a single draft groups tiles — the colour/pattern rule — is still to come, see #10.)*
14. ~~Split trigger?~~ **RESOLVED:** yes — fires the instant the top section drops below 4.
15. ~~Round-end leftovers?~~ **RESOLVED:** all central-area tiles **discarded**; if the supply
    empties mid-game, the **discard is shuffled back** into it (seed-driven → must be logged).
16. ~~"No identical tiles" nuance?~~ **RESOLVED:** you take **one of each distinct** matching
    (colour, symbol) — never duplicates. When a combo has several draftable copies, the **player
    chooses which physical copy**, because its location (top section vs a split-off) affects
    whether taking it empties/reveals a section. So a draft's tile count = number of *distinct*
    matching combos, and the action carries a **per-duplicate source choice**.
17. ~~Batch tiles vs. identity tile?~~ **RESOLVED:** the draftable tiles on a section are
    **separate** from the section's own immovable identity tile (and its placeable slots).
18. **Draft decisions made in code (please confirm):**
    (a) a section emptied *by the current draft* becomes takeable **next** turn — only sections
    already empty before the draft are taken with it;
    (b) a **section-only** draft (no matching tiles, just a matching emptied section) is allowed;
    (c) you must take **all** distinct matching combos — no partial selection.
19. **Coins** — **PARTIALLY RESOLVED:** coins live in the **tile storage area** and **count
    toward its 12-slot cap**; each player **starts with 3**. Earn/spend rules deferred.
20. **Storage ordering** — both storage areas are ordered: the tile area is a `StorageItem[]`
    (`tile | coin`) and the section row is a `Section[]`. Order has **no gameplay effect**
    (`storageTiles`/`storageCoins` derive counts). One free **`reorder`** action targets either
    area (`area: 'tiles' | 'sections'`) — current player, must be a permutation, **no turn cost**.
    *(Confirm: reorder is free & on your turn; off-turn / per-player reorder deferred.)*
21. **Payment:** A user must pay to place tiles and sections from their storage into their play area.
    Need to define how payment works.
22. **Round end is automatic (condition-discovered).** When the pass that makes *everyone* passed
    resolves, `applyAction` runs round scoring (first-passer −1 for now) **and** the round
    transition in the same step — there's no explicit "end round" action. The transition
    **discards the central area's leftover tiles** and **deals a fresh pile** (n sections + 4
    tiles) for the next round via the shared `dealRound`. Game-over after round 4 falls out of the
    same path. *(Fixes the earlier carry-over stub, now that the draft consumes the central area.)*

## Design notes

- **Draft construction (avoiding the combinatorial blow-up).** The engine keeps **one** `draft`
  action = `{ axis: colour | symbol, value, picks: one chosen instance per duplicated combo }`,
  validated in a single pass — we never enumerate all complete drafts. The UI builds that action
  through a small **step machine** driven by a pure helper `nextDraftOptions(state, partial)`:
  choose the axis (a clicked tile's colour *or* its symbol), then resolve each duplicated combo
  one click at a time. Each step offers only a handful of options, so the explosion never
  materialises. (It's a tiny FSM of its own — and the same "validate one, don't enumerate all"
  rule the engine uses everywhere.)
