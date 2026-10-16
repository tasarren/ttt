# ttt data handoff for a Webapp

Use [ttt-system.schema.json](ttt-system.schema.json) as a JSON Schema Draft 2020-12 catalog. Each
`#/$defs/Name` is a separate contract. The catalog describes current ttt data, not an HTTP or
WebSocket API. `settings.jsonc` and layout files must be parsed as JSONC before validation.
Paths below use default `TTT_HOME` and `boardRoot`; either setting can move the files.

| Data | Schema definition | Current source |
|---|---|---|
| Message and per-recipient state | `BoardMessage`, `MessageReceipt` | `~/.ttt/boards/<session>/messages/<YYYYMMDD>/<messageId>.json`, `mailboxes/<agent>/<messageId>.json` |
| Thread, unread, and wait state | `ThreadIndex`, `UnreadCounter`, `Presence`, `NotificationMarker`, `WaitStreak` | `threads/` and `state/` under the same session board |
| Board query results | `InboxSummary`, `ReadResult`, `MessageStatus`, `NotificationSummary` | `@ttt/board` methods; these are not CLI JSON commands |
| Live topology | `TreeSession`, `PanesView`, `DoctorFindings` | `ttt tmux tree --json`, `ttt panes --json`, `ttt tmux doctor --json` |
| Saved setup | `SessionRecord`, `LayoutFile`, `SettingsFile` | `~/.ttt/sessions/<session>/session.json`, `~/.ttt/layouts/*.jsonc`, `~/.ttt/settings.jsonc` |

One message has one `messageId` and one receipt per recipient. Join them by `messageId` and
`recipient`. `threadId` identifies the root message; `inReplyTo` points to the immediate parent.
Only the root stores `subject`. Receipt states are `unread`, `read`, `acked`, `superseded`, and
`cancelled`. `notifiedAt` means a paste happened, not that the recipient read the message.
An elapsed `expiresAt` may still have an `unread` receipt until mailbox access processes expiry.

Tmux owns live windows and panes; the board owns message history. A session record can be absent
even while a tmux session exists. `Presence` means a process is currently blocked in `--wait`;
it is not a general online indicator. A missing unread counter can mean its index has not been
built yet. An unstamped window's first pane still receives its messages; `TreeSession` does not
label that fallback, while `PanesView.seat` does. `TreePane.startCommand`, working directories,
and message bodies should be treated as sensitive when designing Webapp access.

The experimental checkout-only host in `packages/cli/src/web.ts` composes tmux inventory with
`Board.observe()` for read-only history. Its transport is documented in
[`packages/webapp/openapi.json`](../packages/webapp/openapi.json): `/api/state` returns paged route
state, `/api/events` streams SSE revision invalidations, and `/api/terminal` streams the selected
window. `/api/input` and action endpoints validate writes separately. JSONC settings/layout writes
check ETags under a lock and rename atomically. The published CLI does not include this host.
`Board.read()` marks messages read unless called with `peek: true`, and even a peek can settle
expired receipts; dashboard queries use `Board.observe()` instead and never change receipts or
expiry. Current writers use board version 7, receipt version 1,
layout version 1, and session-record version 1; older board messages may remain after migration.
The CLI also enforces
rules a JSON Schema cannot express here, including exactly one default harness when `harnesses`
is present, unique layout window/agent names, and tmux layout cell counts.
`ttt tmux doctor --json` can print findings and then exit 1 when problems exist; a backend using
that command must still read its JSON stdout.
