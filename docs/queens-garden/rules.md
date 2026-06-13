# Azul: Queen's Garden — Rules (authoritative reference)

> **Role:** the source of truth for *what the game says*. Faithfully restated from
> the rulebook in our own words; genuinely tricky clauses are quoted verbatim with
> a page reference. When `model.md` and this file seem to disagree, this file wins.
> When this file is ambiguous, the ambiguity becomes a logged decision in `model.md`.

**Source:** _(rulebook edition / URL — to be filled)_
**Target player count for the first model:** 2–4 (the engine is general; player count only sets
how many sections are in play per round).

---

## Overview
_(Pass 1 — a few sentences: theme, number of rounds, how you win.)_

## Components
- **Tiles (108 total):** every combination of **6 colours × 6 symbols** (36 distinct), with
  **3 copies of each** combination. Tiles are **hexagonal** — the shape governs how a tile
  aligns with its neighbours (relevant to adjacency and scoring).
- **Player board (one per player):** contains a **play area**, a **storage area**, and
  garden sections.
  - **Play area** — a large hexagon with **7 slots** for garden sections: 1 in the centre,
    6 around the edge.
  - **Garden section** — a hexagon with **6 tile spaces** around the edge. Each of the **36
    sections** corresponds to one of the 36 colour+symbol combos, shown as an **immovable tile**
    filling **one** of its 6 spaces (leaving 5 free). _Exception:_ the **central starter
    section** is blank — all 6 spaces free, no identity tile. (A section also has a centre symbol,
    but that is **purely decorative** — not modelled.)
  - **Storage area** — a player's taken-but-unplaced components: a **tile area** capped at **12**
    (holding **tiles and coins** together) and room for **2 garden sections**.
- **Coins** — each player starts with **3 coins**, kept in the tile area (counting toward its
  12-slot cap). Each coin is a **wildcard worth 1** toward a placement cost (**spending** — see
  Placement & payment), and coins are **earned** by completing 6-tile regions on placement
  (**earning** — see *Earning coins*).
- **Garden-section supply** — a pool of exactly **36** sections (one per colour+symbol combo);
  each round draws **n** at random (**5 / 7 / 8** for **2 / 3 / 4** players).
- _(Scoring wheel, tokens, central drafting area — TBD in later chunks.)_

## Setup
- Player count **2–4**. Rules vary little by count — it mainly changes the **number of garden
  sections** in play (**n = 5 / 7 / 8** for 2 / 3 / 4).
- Each player starts with **no tiles and no sections**.
- The play area starts **empty except the centre slot**, which holds **one empty garden
  section**. The 6 edge slots **cannot receive tiles until a garden section is placed there
  first**.
- _(Scoring-wheel start position — TBD.)_

## Central area & tile flow
- The **tile supply** (108 tiles, drawn at random) and **section supply** (36 sections) sit in
  a shared **central area** used by all players; a **discard pile** collects spent tiles.
- **Per round, n sections are in play:** n = **5 / 7 / 8** for **2 / 3 / 4** players, drawn at
  random from the remaining section pool at the start of each round and **stacked into a pile**.
- **4 tiles** (random from the supply) are placed on the **top** section of the pile.
- Players **draft tiles** from **any tiles currently in the central area** — the top section's
  batch *and* the leftover tiles on already-split sections.
- The instant the top section drops **below 4 tiles**, it **splits off** carrying its **leftover
  tiles** (still draftable), and the next section is revealed with **4 fresh tiles**.
- A **section becomes draftable** (takeable via `take sections`) **once all 4 of its tiles have
  been drafted**.
- Net effect: a round makes **4 × n** tiles available (e.g. 4 × 5 = **20** for 2 players).
- **Round end:** all tiles still in the central area are **discarded**.
- **Supply exhaustion:** if the tile supply runs out mid-game, the **discard pile is shuffled
  back** to form a fresh supply. _(Random → seed-driven; must be recorded for deterministic
  replay.)_

## Round structure
- A game is **4 rounds**.
- Within a round, players **take turns**; on a turn a player performs **exactly one** action
  (see Turn actions) or passes.
- The round ends when **all players have passed**.
- The **first player to pass** this round **loses 1 point** (applied at this round's scoring)
  and becomes the **first player in the next round**, if there is one.
- After the round: **round scoring** (scoring wheel — Pass 3).
- After 4 rounds: **end-game scoring** (Pass 3).

## Turn actions
On a turn, a player does one of:
1. **Take (draft)** — choose a **colour** or a **symbol**, then take **one of each distinct**
   draftable tile bearing it (never duplicates) *and* every draftable section bearing it, into
   storage. When a tile combo has several draftable copies, **you choose which copy** — its
   location (top section vs a split-off) can change whether taking it empties/reveals a section.
   **Precondition:** the selection must fit storage — distinct tiles taken ≤ free tile storage
   (of 12) **and** sections ≤ free section storage (of 2); else the draft is illegal.
2. **Place a section** — place a stored garden section into an empty, playable play-area slot.
3. **Place tiles on sections** — place stored tile(s) onto the free spaces of a placed section.
4. **Pass** — stop taking turns this round (first to pass: −1 at scoring, leads next round).

_(The engine also offers a free **reorder** action — rearranging your own storage — which is a
modelling affordance with no gameplay effect and no turn cost; it isn't a rulebook action. See
model.md #20.)_

_Example:_ central area has 3 green tiles, 2 red tiles, and a red section. Choosing **red** takes
both red tiles **and** the red section; **green** takes the 3 greens. A player with only 2 free
tile spaces can't take the greens; one with no free section space can't take the reds (the
selection includes a section).

_(Scoring — still to come.)_

## Placement & payment
Placing a section or a tile (from storage into your garden) has a **cost** that must be **paid**.

- **Cost = the index of the item's symbol (1–6).** Every tile and section shows a symbol; the
  six symbols have a **fixed order**, and the cost is that symbol's 1-based position. _(So the
  symbol order is game-relevant — it sets cost.)_
- **The cost is inclusive of the item being placed** — the placed item counts as 1 toward it. A
  cost-1 item pays for itself; a cost-C item needs **C − 1** more.
- **Pay the remaining C − 1** with any mix of:
  - **matching items** — tiles/sections from storage sharing the **placed item's colour OR its
    symbol** (one chosen axis, same rule as drafting), **no two identical**; and
  - **coins** — each is a wildcard worth **1**.
- **All payment items (tiles, sections, coins) are discarded** when the item is placed; the
  placed item leaves storage for the garden.

_Examples:_ a **cost-3 section** = the section + one colour-matching tile + one coin (1+1+1). A
**cost-6 tile** = the tile + three symbol-matching tiles/sections + two coins (1+3+2).

### Where things go (placement positions)
Each player fills **their own** garden. Both placements — a section's identity tile, and a tile
onto a section — obey one shared adjacency rule.

- **Shared adjacency rule (face-adjacency only — corners don't count).** For **every
  face-adjacent occupied position** of the tile being placed — a ring-neighbour within the same
  section *or* the tile across a shared edge in a neighbouring section — the placed tile must
  share **exactly one** of its colour/symbol with the tile there: **not neither** (no match) and
  **not both** (exact duplicate). Empty adjacent positions never constrain.
  - _e.g._ a **red flower** may sit beside a **red bird** (colour only) or a **blue flower**
    (symbol only); but **not** a **blue bird** (no match) or another **red flower** (duplicate).

- **Placing a section** — any **empty slot**, any **rotation**; need not touch an existing
  section. Only the **identity** is on the section yet, so only its single face-adjacent
  *other-section* neighbour can be occupied — apply the shared rule to it.

- **Placing a tile** — onto an **empty space of a placed section** (you **cannot** place a tile on
  an empty garden area with no section). Apply the shared rule across **all** its face-adjacent
  positions: its section's ring-neighbours (including the identity) *and* the tile across any
  shared edge.

### Runs
A **run** is a chain of face-adjacent tiles (a section's fixed identity tile counts as a tile)
that **all share one attribute** — **all the same colour**, or **all the same symbol**. A run
follows the **adjacency graph freely**: it can round a section's ring and **cross section
boundaries**, with no fixed shape — it is *not* confined to straight or circular lines.

The placement rule is a single constraint: placing a tile or a section must not **join two
identical tiles** into a run. After placing, no run (colour or symbol) passing **through the placed
tile** may contain **two identical tiles** (same colour *and* symbol). Two identical tiles may sit
within a few cells of each other, so long as **no single-attribute chain connects them**.

- _e.g._ red/acorn — red/bird — red/acorn is **illegal** (one red run, two red/acorns). But
  red/acorn — red/bird — blue/bird — blue/acorn — red/acorn is **fine**: the chain switches its
  shared attribute partway, so neither a colour-run nor a symbol-run links the two red/acorns.

A run is at most **6 tiles** long, but that is a **consequence, not a separate rule**: a
mono-colour run with no repeated tile holds at most 6 (only 6 symbols exist), and likewise a
mono-symbol run. So the old "≤6 of one colour / ≤6 of one symbol" phrasings both fall out of the
single "no run joins two identical tiles" rule.

### Earning coins (completion bonuses)
Coins are earned by **placing the tile that completes a 6-tile region** — the sixth tile that
fills it. The bonus is granted the instant the completing tile lands. Three region types pay out:

- **Central section filled** — all 6 spaces of the centre section → **1 coin**.
- **An outer ring section filled** — all 6 spaces of one of the 6 ring sections → **3 coins**.
- **A gap surrounded** — one of the **6 gaps** where two adjacent ring sections meet the centre,
  ringed by 6 tiles (2 from the centre + 2 from each of the two ring sections) → **2 coins**.

A **single placement can satisfy several of these at once, and the bonuses stack** — because the
completing tile sits where regions overlap. _e.g._ a centre-section space is shared by the centre
section and two gaps, so one tile can complete the centre section **and** both gaps: 1 + 2 + 2 =
**5 coins**. (Only placing a **tile** can earn coins — a freshly placed section lays a single
tile, never a sixth.)

**Storage cap on earned coins.** Coins live in the tile area, capped at 12 (tiles and coins
together). If a placement would earn more coins than there is room for, the player earns only **as
many as fit** — the rest are **lost**. So every placement has a **maximum** reward (what its
completed regions are worth) and an **actual** reward (what fits once the placed tile and payment
have left the tile area). When the actual is less than the maximum, the player must be **warned
before committing** that part of the reward will be forfeited.

## Round scoring
_(Pass 3 — how scoring resolves at the end of a round, incl. the scoring wheel.)_

## End-game scoring
_(Pass 3 — final scoring categories, bonuses, and penalties.)_

## Glossary
_(Terms of art that need pinning down precisely — e.g. "pavilion", "garden expansion".)_
