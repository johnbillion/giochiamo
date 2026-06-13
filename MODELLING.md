# Data modelling

## 1. What situations can the game be in?

List the distinct modes. The test for "is this a separate state?" is: are different actions available, or does the same action mean something different here? Those boundaries are your states. Don't force it — there may be very few.

## 2. What's the smallest complete snapshot of a position?

Use what I'd call the Resume Test: if I texted you nothing but this data, could you perfectly continue the game from there? If yes, your snapshot is complete. The moment you catch yourself thinking "wait, I'd also need to know…", that missing thing belongs in the state.

## 3. For each thing in that snapshot, ask: could I derive this instead of storing it?

This is the sharpest modeling question there is. Anything you store that you could've computed becomes a second source of truth — and two sources of truth can disagree, which is exactly where bugs breed. Two candidates worth sitting with in any turn-based game: whose turn is it, and has someone won. For each, ask "can I compute this from the board alone?" There's a genuine judgment call here — don't let me make it for you.

## 4. What are the actions, and for each: when is it legal, and what does it change?

Every action is a precondition ("when is this allowed?") plus an effect ("what does it do to the state?"). Nailing those two clauses for each action is your rules engine in miniature.

## 5. After an action resolves, what do you check to decide if the situation changed?

This is the bridge back to question 1 — the logic that flips you out of "playing."
