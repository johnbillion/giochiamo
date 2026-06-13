// Transport seam.
//
// Components should call submit(action) rather than touching the engine or React's
// dispatch directly. Today it just dispatches locally (hotseat). Later, this is the
// single place where a move is sent to a server and applied on every client — the
// engine on both ends stays identical.
//
// TODO (you): once the engine + useReducer wiring exist, give this a real signature,
// e.g. (dispatch, action) => void, and have the UI call it instead of dispatch.
//
// This is the trust boundary. The engine assumes its Action/State are well-typed at
// runtime; that assumption only holds while moves are built in typed code (local
// hotseat). Once moves arrive from a server (JSON.parse → `any`), parse-and-validate
// the incoming action HERE before dispatching it inward — that is the single place
// untyped data enters, so it is the single place it must be checked.

export {};
