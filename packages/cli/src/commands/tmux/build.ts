import { isAbsolute, join } from "node:path"

import { SplitDirection } from "@ttt/tmux"
import type { LivePane, Tmux } from "@ttt/tmux"

import type { Layout, LayoutPane, LayoutWindow } from "../../layout.ts"

export interface BuildReport {
  created: string[]
  skipped: string[]
}

/**
 * Materializes a layout inside an existing session: every window not already present by name
 * is opened with its first pane's command, split once per extra pane, given the saved layout
 * string, and stamped (`@ttt_agent`, `@ttt_harness`, `@ttt_command`). Windows that exist are
 * skipped, never duplicated, so a rerun is safe.
 */
export async function buildLayout(tmux: Tmux, session: string, layout: Layout, baseCwd: string | undefined): Promise<BuildReport> {
  const present = new Set((await tmux.inventory.listWindows(session)).map((window) => window.name))
  const report: BuildReport = { created: [], skipped: [] }
  const root = layout.cwd ?? baseCwd
  for (const window of layout.windows) {
    if (present.has(window.name)) {
      report.skipped.push(window.name)
      continue
    }
    await buildWindow(tmux, session, window, root)
    report.created.push(window.name)
  }
  return report
}

async function buildWindow(tmux: Tmux, session: string, window: LayoutWindow, root: string | undefined): Promise<void> {
  const [first, ...rest] = window.panes
  const opened = await tmux.windows.open({
    session,
    name: window.name,
    ...cwdOf(first, root),
    ...commandOf(first),
  })
  const paneIds = [opened.paneId]
  for (const pane of rest) {
    // Direction does not matter: the saved layout string decides the geometry afterwards.
    paneIds.push(await tmux.panes.split({ target: opened.windowId, direction: SplitDirection.Vertical, ...cwdOf(pane, root), ...commandOf(pane) }))
  }
  if (window.layout !== undefined) await tmux.windows.applyLayout(opened.windowId, window.layout)

  const live: LivePane[] = await tmux.inventory.listAllPanes()
  const agentIndex = Math.max(0, window.panes.findIndex((pane) => pane.agent === true))
  for (const [index, pane] of window.panes.entries()) {
    const isAgent = index === agentIndex
    await tmux.panes.stamp(paneIds[index]!, live, {
      ...(isAgent ? { agent: window.name } : {}),
      ...(isAgent && window.harness !== undefined ? { harness: window.harness } : {}),
      ...(pane.command !== null ? { command: pane.command } : {}),
    })
  }
}

function cwdOf(pane: LayoutPane | undefined, root: string | undefined): { cwd?: string } {
  const own = pane?.cwd
  if (own === undefined) return root !== undefined ? { cwd: root } : {}
  if (isAbsolute(own) || root === undefined) return { cwd: own }
  return { cwd: join(root, own) }
}

function commandOf(pane: LayoutPane | undefined): { command?: string } {
  return pane?.command != null ? { command: pane.command } : {}
}
