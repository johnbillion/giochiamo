// Transport seam.
//
// Components should call submit(action) rather than touching the engine or React's
// dispatch directly. Today it just dispatches locally (hotseat). Later, this is the
// single place where a move is sent to a server and applied on every client — the
// engine on both ends stays identical.
//
// This is the trust boundary. The engine assumes its Action/State are well-typed at
// runtime; that assumption only holds while moves are built in typed code (local
// hotseat). Once moves arrive from a server (JSON.parse → `any`), parse-and-validate
// the incoming action HERE before dispatching it inward — that is the single place
// untyped data enters, so it is the single place it must be checked.

import type { Action } from '../queens-garden/types';

// How a built move reaches the engine. Today it's just React's reducer dispatch; later
// the same call site could forward to a server and apply the result on every client.
export type GameDispatch = (action: Action) => void;

// Submit a move. Local hotseat: dispatch straight into the reducer. This is the one
// seam to extend when moves start crossing the network (validate untyped input here).
export function submit(dispatch: GameDispatch, action: Action): void {
  dispatch(action);
}
