import type { MigrationStep } from "../manifest.ts"

/** v7 moves pane ownership into tmux (`@ttt_agent` pane option); `state/panes.json` is no longer read. */
export const dropPaneRegistry: MigrationStep = {
  from: 6,
  to: 7,
  name: "drop-pane-registry",
  migrate: async(board, options) => ({ files: (await board.dropPaneRegistry(options)) ? 1 : 0 }),
}
