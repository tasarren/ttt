# TTT Webapp

Private desktop workspace package. Hono host lives in `../cli/src/web.ts`, where settings,
layout validation, and CLI command dispatch already belong. This package owns Vue SSR and
hydration, Pinia state, Vue Router navigation, and xterm.js terminals using `@ttt/ui` styles/components.

```sh
pnpm web
pnpm build
pnpm web:start
```

Address: `http://127.0.0.1:3000`. Both launch modes run from the checkout; the Webapp is not bundled
into the published CLI executable.

## Contracts

- [openapi.json](openapi.json) defines state, source writes, tmux actions, terminal snapshots/output,
  and HTTP/SSE routes. Domain records reference [TTT JSON Schema](../../docs/ttt-system.schema.json).
- `src/protocol.ts` owns transport types and boundary validation.
- `src/app.ts` owns each request's Vue/Pinia/router instances, route data, and page composition.
- `src/terminal.ts` owns terminal lifecycle and the visible window's output/input.
- `src/ssr.ts` and `src/client.ts` render and hydrate the same app.

## Data and streams

Boards load on demand in pages of 50 threads/messages. Boards keep an in-memory server cache,
invalidated by filesystem events with a periodic refresh as backup. No board file is moved, archived,
deleted, or marked read. A persistent SQLite archive/FTS replica can replace scans if latency grows.

`/api/events` sends `invalidate` revisions and heartbeats. Reconnection sends the current revision.
`/api/terminal` creates one tmux control-mode client for all panes of each expanded, visible window. It sends
ANSI snapshots and recent history before output, preserves UTF-8 across chunks, and closes when the window
collapses, leaves the viewport, or the browser tab hides.
xterm retains tmux dimensions and scales text to fit; it does not resize tmux. Slow terminal streams
close after 4 MB of queued events and reconnect for a fresh snapshot.
Pane fonts fit rendered cell width. A−/A+ set a pane's font size, Auto restores
fitting, and neither operation reconnects its stream. The pane container does not scroll; xterm's
root owns scrolling for tall rows and scrollback. Output updates never trigger font fitting.
Pane headers open Details or close that pane through `ttt tmux close --pane TARGET`. Sessions list every
window and pane; expanding several windows streams only those in the viewport. Recorded unread counters
appear next to the responsible session, window, and agent pane; unmapped mailboxes remain in session totals.

Board `view` selects all conversations, threads with replies, standalone messages, or acknowledged
receipts. `q`, `urgent`, and receipt `state` filters apply before paging. Acknowledgements use receipt
data, not text heuristics. `/activity/{session}` pages 50 derived events, newest first, and opening an
event navigates to its message. Archived session names remain selectable alongside live sessions.

Writes use same-origin requests plus `X-TTT-Token`. Settings/layout writes include their loaded ETag;
stale or concurrent saves return 409. JSONC source survives round trips, including comments. Terminal
input checks current session membership, pane liveness, and `synchronize-panes` before sending bytes.
