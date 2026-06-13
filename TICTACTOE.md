# Tic Tac Toe

## 1. What situations can the game be in?

1. Normal gameplay, including the opening move of the game. One player can play a move.
2. A completed line exists or the board is full.

## 2. What's the smallest complete snapshot of a position?

1. A list of pieces and their cell position. For example O1, X3, X6, O9.
2. Record of the starting player (O or X).

## 3. For each thing in that snapshot, ask: could I derive this instead of storing it?

We're deriving everything we need, including whose turn is next (based on starting player and pieces played), whether the game is over (a completed line exists or the board is full), and whether a player won (their pieces are in a completed line).

## 4. What are the actions, and for each: when is it legal, and what does it change?

Every action is a precondition ("when is this allowed?") plus an effect ("what does it do to the state?"). Nailing those two clauses for each action is your rules engine in miniature.

1. Place a piece (player P, cell C)
  - Legal when: the game is not over, and it's P's turn, and C is empty.
  - Effect: C becomes occupied by P.
2. Start a new game
  - Legal when: no game is in progress.
  - Effect: a fresh empty board + a designated starting player.

## 5. After an action resolves, what do you check to decide if the situation changed?

1. A completed line exists or the board is full.
