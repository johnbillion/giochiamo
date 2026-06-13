# Azul: Queen's Garden — Engine Model

> **Role:** the structured model *derived* from `rules.md`, and the thing we codify
> the engine from. Organized by the same five questions from `MODELLING.md`,
> scaled up. Resolvers stay stubbed until Pass 3.

**Target player count (first build):** general **2–4** — the engine isn't specialised to one
count; player count only feeds `sectionsPerRound = playerCount + 3`.

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
| Supply / pools | **Tile bag** (remaining of 108) + **discard pile** + **section pool** (remaining of 36) + **seed** | bag-empty → shuffle discard back in (seed-driven, must be logged); batch draws & section picks seed-driven |
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
| Place section | stored section + target slot + **which slot its identity occupies** + **payment** | section in storage; target slot **empty**; the identity tile (on its chosen slot) shares **exactly one** of its colour/symbol with any other-section tile it faces (not both, not neither; empty/no-neighbour fine); **payment valid** | a blank frame is placed with the identity tile on the chosen slot; payment discarded |
| Place tile | stored tile + target (slot, dir) + **payment** | tile in storage; target is an **empty space of a placed section**; placed tile shares **exactly one** attribute with **every** face-adjacent occupied tile (within-section ring + cross-edge); **payment valid** | tile fills the space; payment discarded |

**Payment** (both place actions): cost = the placed item's **symbol index (1–6)**, *inclusive of
the item itself*. Pay the remaining `cost − 1` with **matching items** (sharing the placed item's
colour *or* symbol — one axis, no duplicates) and/or **coins** (each a wildcard worth 1). All
payment items + coins are discarded.
| Pass | — | it's your turn & not yet passed | mark passed this round; the **first** passer takes **−1** at round scoring and **leads the next round**. When the pass that makes everyone passed resolves, round scoring + the round transition run in the same step (see #22) |

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
3. ~~Section orientation — fixed or rotatable?~~ **RESOLVED:** rotatable — you choose **which
   slot the identity tile occupies** (6 choices). But we don't store rotation/identity: a placed
   section is just a **frame of 6 tile-slots** and the identity is a pre-placed tile on one of
   them (see #28). Placement legality is the tile-level adjacency rule applied to that tile.
4. ~~Does storage hold tiles + sections; is it bounded?~~ **RESOLVED:** holds both; capped at
   **12 tiles and 2 sections** (a precondition on the `take` actions).
5. ~~Adjacency across sections — edge-only or corners too?~~ **RESOLVED:** **face/edge adjacency
   only** — corners don't count. The `dir ↔ dir+3` model in `garden.ts` is exactly right (one
   other-section neighbour per tile). *(A later "runs" rule handles sequences of tiles — separate.)*
6. ~~Round end & passing?~~ **RESOLVED:** round ends when all have passed; the first to pass
   loses **1 point** (at this round's scoring) and is **first player next round**.
7. ~~One action per turn?~~ **RESOLVED:** exactly one action (or pass) per turn.
8. ~~Placing a section — any slot, or only adjacent to an existing one?~~ **RESOLVED:** **any
   empty slot**, any rotation; no requirement to connect to an existing section (the identity may
   face empty garden space). Legality is the identity-adjacency rule (#25).
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
18. ~~Draft decisions (please confirm)?~~ **RESOLVED:**
    (a) a section emptied *by the current draft* becomes takeable **next** turn — only sections
    already empty before the draft are taken with it;
    (b) a **section-only** draft (no matching tiles, just a matching emptied section) is allowed;
    (c) you must take **all** distinct matching combos — no partial selection.
19. **Coins** — **PARTIALLY RESOLVED:** coins live in the **tile storage area** and **count
    toward its 12-slot cap**; each player **starts with 3**. Earn/spend rules deferred.
20. ~~Storage ordering?~~ **RESOLVED:** Both storage areas are ordered: the tile area is a `StorageItem[]`
    (`tile | coin`) and the section row is a `Section[]`. Order has **no gameplay effect**
    (`storageTiles`/`storageCoins` derive counts). One free **`reorder`** action targets either
    area (`area: 'tiles' | 'sections'`) — current player, must be a permutation, **no turn cost**.
21. ~~Payment — a user must pay to place tiles and sections from storage into their play area;
    how does paying work?~~ **RESOLVED:** cost = the placed item's **symbol index (1–6)**,
    *inclusive of the item itself*. Pay the remaining `cost − 1` with **matching items** (sharing
    the placed item's colour *or* symbol — one axis, drafting-style, no duplicates) and/or
    **coins** (each a wildcard worth 1). All payment items + coins are discarded. *Consequence:*
    the **SYMBOLS order is now game-relevant** (it sets cost) — update the "arbitrary names" note
    when codifying, via a `symbolCost(symbol) = index + 1` helper.
22. ~~Round end is automatic (condition-discovered)?~~ **RESOLVED:** When the pass that makes *everyone* passed
    resolves, `applyAction` runs round scoring (first-passer −1 for now) **and** the round
    transition in the same step — there's no explicit "end round" action. The transition
    **discards the central area's leftover tiles** and **deals a fresh pile** (n sections + 4
    tiles) for the next round via the shared `dealRound`. Game-over after round 4 falls out of the
    same path. *(Fixes the earlier carry-over stub, now that the draft consumes the central area.)*
23. ~~Placement assumptions~~ — **now implemented** ~~(flag if any are wrong):~~ (a) non-coin payment
    items all match the placed item on a **single axis** ✓; (b) no payment item may equal the
    placed item ✓; (c) discard destinations — payment **tiles → discard pile**, **sections & coins
    → out of play** (no coin bank modelled) ✓; (d) **one** item placed per place action ✓; (e) the
    "where" is resolved (#25/#26/#27). All codified in `placement.ts`.

24. ~~Garden topology + the rotation question (feeds placement).~~ The 7 section-slots form a
    hex flower: the **centre is adjacent to all 6** ring slots; each **ring slot** is adjacent to
    the centre + its **2 ring-neighbours** (degree 3). Proposed representation: index every tile
    position as **(slot 0–6, direction 0–5)**. Within a section, ring adjacency is `dir ± 1 mod
    6`; across a shared edge, slot S's `dir d` tile is adjacent to neighbour T's `dir (d+3) mod 6`
    tile. Encode the fixed topology **once** (a neighbour table, like TTT's `WIN_MASKS`) and unit-
    test the derived 42-position adjacency graph — don't recompute geometry at runtime.
    **RESOLVED:** tile positions are indexed by **board direction**; a placed section is a
    **frame of 6 tile-slots** (the identity is just a pre-placed tile — see #28). Codified in
    `garden.ts` — `neighbourSlot` (the table, derived from axial coords), `adjacentPositions`
    (within-ring `dir ± 1` + cross-edge `dir + 3`), `tileAt`, `createStarterGarden` — with the
    `PlacedSection` / `Garden` / `SlotId` / `Direction` types in `types.ts`, all unit-tested.
    *The `garden` field is wired into `PlayerState` with the placement slice.*

25. ~~Per-player gardens + section-placement adjacency~~ — **RESOLVED:** gardens are **per-player**.
    A section goes in **any empty slot** at a chosen **rotation**; legal iff the **identity**
    faces only empty space, or an other-section tile (fixed/placed) sharing **exactly one**
    attribute (colour **xor** symbol) — facing **neither** (no match) *or* **both** (exact
    duplicate, e.g. red-flower beside red-flower) is illegal. **Face/edge adjacency only** (#5), so
    the identity has exactly **one** other-section neighbour: `(neighbourSlot(slot, rot), rot+3)`.
    *(Tile-placement constraint, the "runs" rule, + further rules still to come.)*

26. ~~Tile placement = the generalized adjacency rule~~ — **RESOLVED:** a tile goes on an **empty
    space of a placed section** (never a section-less area); legal iff it shares **exactly one**
    attribute (colour xor symbol) with **every** face-adjacent occupied tile — its section's ring
    neighbours (incl. the identity) and the cross-edge tile. This is the same predicate as #25;
    section placement is just the case where only the cross-edge neighbour can be occupied. One
    helper covers both: `adjacentPositions` + `tileAt` + a `shareExactlyOne` check.

27. ~~Runs — topology~~ **CORRECTED** ~~(supersedes the earlier fixed-lines model).~~ A *run* is a chain
    of face-adjacent tiles **all sharing one attribute** — all one colour, or all one symbol —
    following the adjacency graph **freely** (rounding rings, crossing section edges); it is **not**
    an arc along a fixed set of lines. The placement constraint is a single rule: placing must not
    **join two identical tiles** into a run — no colour-run or symbol-run *through the placed tile*
    may contain two identical tiles. The "≤6 per run" bound is **emergent** (a mono-attribute run
    with no repeat holds ≤6, since only 6 of the other axis exist), not a separate check — so rules
    1–2 (≤6 colour/symbol) really do follow from rule 3, as suspected. Codified in `placement.ts`:
    `monoRun(after, placed, pos, attr)` (a BFS over `adjacentPositions`, stepping only onto tiles
    matching `placed`'s colour/symbol) + `joinsIdenticalTiles`; unit-tested incl. the corner-turning
    join and the mixed-attribute arc that the old model got wrong.
    **Earlier (now removed):** runs were modelled as contiguous arcs along 13 fixed lines (7 section
    rings + 6 junction rings) via `LINES`/`runsThrough` in `garden.ts`. That model was wrong **both
    ways** — it missed mono-attribute joins that bend off a single line, and rejected contiguous
    arcs whose tiles don't actually share one attribute. The `LINES`/`runsThrough` machinery and its
    tests were deleted; `adjacentPositions` (the traversal primitive) and `tileAtPosition` stay.

28. ~~Board = hex cells; identity is just a tile (simplification)~~ — **RESOLVED.** The screenshot
    confirms tiles are hex **cells** (6 ringing each of the 7 holes) and a tile touches **one**
    cross-section neighbour — validating the degree-3 adjacency already in `garden.ts` (no rebuild).
    **Simplification:** `PlacedSection` is now just `{ tiles: (Tile|null)[6] }` — no stored
    `identity`/`rotation`. The identity is a pre-placed tile; "rotation" is only the placement
    choice of which slot it lands on. So placement & scoring are **uniformly tile-level**, and
    `place section` = drop a blank frame + place the identity tile (same adjacency check as
    `place tile`). *Run tracing:* runs are **mono-attribute chains over the adjacency graph**
    (`monoRun` / `joinsIdenticalTiles` in `placement.ts`), **not** arcs of fixed rings — see #27.

29. ~~Placement~~ **codified.** `place section` / `place tile` (`placement.ts`): target valid (empty
    slot / empty space of a placed section) → shared adjacency rule (exactly-one attribute with
    each face neighbour) → no run joins two identical tiles (`joinsIdenticalTiles`) → valid payment (cost =
    symbol index, inclusive of the placed item; matching items + coin wildcards) → apply. `garden`
    is now wired into `PlayerState`; `availableActionTypes` gates place actions on *holding* the
    item (necessary, not sufficient — concrete legality is `illegalReason`). Tested: free & paid
    placement, adjacency (match-one / mismatch), run duplicates, underpayment, section placement.

30. ~~Coins — earning~~ **RESOLVED** ~~(spending was #21).~~ A player earns coins by placing the tile that
    **completes a 6-tile region** (the sixth tile): **centre section → 1**, **a ring section → 3**,
    **a junction gap → 2** (the 6 holes where two adjacent ring sections meet the centre, ringed by
    2 centre + 2+2 ring petals). Bonuses **stack** — one tile can complete several overlapping
    regions (a centre petal is shared by the centre section + 2 gaps → up to 1+2+2 = **5**). Only a
    **tile** placement can earn (a freshly placed section lays one tile, never a sixth), so coin
    logic lives only in `resolvePlaceTile`.
    - **Geometry resurrected (lean).** This re-needs the per-region position sets dropped in #27 —
      but **membership only, no cyclic order** (unlike the old run `LINES`). Sections are trivial
      (a slot's 6 dirs, "full" = no nulls); the 6 **junction gaps** are re-derived from `crossPair`
      + the ring pairs and exported as `JUNCTION_GAPS` in `garden.ts`. Completion test: a region
      containing the placed position that is full in the after-state (it was one short before, the
      placed cell having been empty).
    - **Storage cap RESOLVED.** Earned coins enter the tile area and **respect the 12-slot cap**;
      excess is **lost**. The engine exposes `placeTileCoins(state, action) → { max, actual }`:
      `max` is the region payout, `actual = min(max, room after the placed tile + payment leave the
      tile area)`. `resolvePlaceTile` adds `actual`; the UI uses the `max > actual` gap to warn.
    - **OPEN:** earned coins come from an unbounded supply (no coin bank modelled), mirroring the
      payment side where spent coins leave play (#23c). Revisit if a finite coin pool matters.

## Design notes

- **Draft construction (avoiding the combinatorial blow-up).** The engine keeps **one** `draft`
  action = `{ axis: colour | symbol, value, picks: one chosen instance per duplicated combo }`,
  validated in a single pass — we never enumerate all complete drafts. The UI builds that action
  through a small **step machine** driven by a pure helper `nextDraftOptions(state, partial)`:
  choose the axis (a clicked tile's colour *or* its symbol), then resolve each duplicated combo
  one click at a time. Each step offers only a handful of options, so the explosion never
  materialises. (It's a tiny FSM of its own — and the same "validate one, don't enumerate all"
  rule the engine uses everywhere.)
