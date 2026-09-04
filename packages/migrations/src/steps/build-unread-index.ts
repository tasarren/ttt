import type { MigrationStep } from "../manifest.ts"

/** v6 guarantees `state/<mailbox>.unread.json` counters exist; history documents are untouched. */
export const buildUnreadIndex: MigrationStep = {
  from: 5,
  to: 6,
  name: "build-unread-index",
  migrate: async(board, options) => {
    if (options.dryRun) return { mailboxes: (await board.mailboxNames()).length }
    return { mailboxes: await board.rebuildUnreadIndex() }
  },
}
