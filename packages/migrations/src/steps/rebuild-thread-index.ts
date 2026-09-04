import type { MigrationStep } from "../manifest.ts"

/** v5 guarantees `threads/*.json` exists for every thread; message documents are untouched. */
export const rebuildThreadIndex: MigrationStep = {
  from: 4,
  to: 5,
  name: "rebuild-thread-index",
  migrate: async(board, options) => ({
    threads: options.dryRun ? await board.unindexedThreadCount() : await board.rebuildThreadIndex(),
  }),
}
