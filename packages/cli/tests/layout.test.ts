import assert from "node:assert/strict"
import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { after, test } from "node:test"

import { layoutCellCount, listLayouts, parseLayout, readLayout, writeLayout } from "../src/layout.ts"

const homes: string[] = []
after(async() => {
  for (const home of homes) await rm(home, { recursive: true, force: true })
})

const FILE = "layouts/team.jsonc"

test("parseLayout accepts comments, trailing commas, defaults, and ~ expansion", () => {
  const layout = parseLayout(`{
    // a comment
    "version": 1,
    "cwd": "~/proj",
    "windows": [
      { "name": "CODER", "layout": "b046,160x40,0,0{111x40,0,0,1,48x40,112,0,5}",
        "panes": [ { "command": "claude", "agent": true, "harness": "claude" }, { "command": "pnpm test", "cwd": "app" }, ] },
      { "name": "LEAD" },
    ],
  }`, FILE)
  assert.equal(layout.profile, "agents")
  assert.ok(layout.cwd?.endsWith("/proj") && !layout.cwd.startsWith("~"))
  assert.equal(layout.windows.length, 2)
  assert.deepEqual(layout.windows[1], { name: "LEAD", panes: [{ command: null, agent: true }] }, "no panes list = one agent pane")
  assert.equal(layout.windows[0]!.panes[0]!.agent, true)
  assert.equal(layout.windows[0]!.panes[0]!.harness, "claude")
})

test("parseLayout rejects every malformed shape with the path in the message", () => {
  const bad = (text: string, pattern: RegExp): void => {
    assert.throws(() => parseLayout(text, FILE), (error: unknown) => {
      assert.ok(error instanceof Error)
      assert.equal((error as { exitCode?: number }).exitCode, 2)
      assert.match(error.message, /layouts\/team\.jsonc/)
      assert.match(error.message, pattern)
      return true
    })
  }
  bad("{ oops", /at offset/)
  bad("[]", /layout must be an object/)
  bad("{\"version\": 2, \"windows\": [{\"name\": \"A\"}]}", /version must be 1/)
  bad("{\"version\": 1}", /windows must be a non-empty array/)
  bad("{\"version\": 1, \"typo\": 1, \"windows\": [{\"name\": \"A\"}]}", /unknown key layout\.typo/)
  bad("{\"version\": 1, \"windows\": [{\"panes\": []}]}", /windows\[0\]\.name is required/)
  bad("{\"version\": 1, \"windows\": [{\"name\": \"a b\"}]}", /windows\[0\]\.name may contain only/)
  bad("{\"version\": 1, \"windows\": [{\"name\": \"A\"}, {\"name\": \"A\"}]}", /window name A appears twice/)
  bad("{\"version\": 1, \"windows\": [{\"name\": \"A\", \"panes\": [{\"command\": \"\"}]}]}", /panes\[0\]\.command must be a non-empty string or null/)
  bad("{\"version\": 1, \"windows\": [{\"name\": \"A\", \"panes\": [{\"command\": null, \"agent\": 1}]}]}", /panes\[0\]\.agent must be true, false, or an agent name/)
  bad("{\"version\": 1, \"windows\": [{\"name\": \"A\", \"panes\": [{\"command\": null, \"agent\": \"bad name\"}]}]}", /panes\[0\]\.agent may contain only letters/)
  bad("{\"version\": 1, \"windows\": [{\"name\": \"A\", \"panes\": [{\"command\": null, \"agent\": \"A\"}]}]}", /seats agent "A" twice \(the window's own name is "agent": true\)/)
  bad("{\"version\": 1, \"windows\": [{\"name\": \"A\", \"panes\": [{\"agent\": \"X\"}, {\"agent\": \"X\"}], \"layout\": \"b046,160x40,0,0{111x40,0,0,1,48x40,112,0,5}\"}]}", /seats agent "X" twice/)
  bad("{\"version\": 1, \"windows\": [{\"name\": \"A\", \"panes\": [{\"command\": null, \"agent\": true, \"title\": \"x\"}]}]}", /panes\[0\] is an agent pane and cannot carry a title/)
  bad("{\"version\": 1, \"windows\": [{\"name\": \"A\", \"harness\": \"claude\"}]}", /windows\[0\]\.harness moved to windows\[0\]\.panes\[j\]\.harness/)
  bad("{\"version\": 1, \"windows\": [{\"name\": \"A\", \"panes\": [{\"command\": null, \"source\": \"guess\"}]}]}", /source may only be "process"/)
  bad("{\"version\": 1, \"windows\": [{\"name\": \"A\", \"panes\": [{\"agent\": true}, {\"agent\": true}], \"layout\": \"b046,160x40,0,0{111x40,0,0,1,48x40,112,0,5}\"}]}", /marks 2 panes as the main agent/)
  bad("{\"version\": 1, \"windows\": [{\"name\": \"A\", \"panes\": [{}, {}]}]}", /has 2 panes but no layout string/)
  bad("{\"version\": 1, \"windows\": [{\"name\": \"A\", \"panes\": [{}, {}], \"layout\": \"nonsense\"}]}", /not a tmux window_layout string/)
  bad("{\"version\": 1, \"windows\": [{\"name\": \"A\", \"panes\": [{}], \"layout\": \"b046,160x40,0,0{111x40,0,0,1,48x40,112,0,5}\"}]}", /has 1 entries but the layout has 2 cells/)
})

test("layoutCellCount counts leaves in flat, nested, and single-pane layouts", () => {
  assert.equal(layoutCellCount("bb62,160x40,0,0,0"), 1)
  assert.equal(layoutCellCount("888d,160x40,0,0[160x20,0,0,3,160x9,0,21,4,160x9,0,31,5]"), 3)
  assert.equal(layoutCellCount("7075,160x40,0,0{80x40,0,0,0,79x40,81,0[79x20,81,0,6,79x19,81,21,7]}"), 3)
  assert.equal(layoutCellCount("garbage"), undefined)
})

test("write/read/list round-trip, refuse overwrite without --force, and name missing layouts", async() => {
  const home = await mkdtemp(join(tmpdir(), "ttt-layout-"))
  homes.push(home)
  assert.deepEqual(await listLayouts(home), [])
  const layout = parseLayout("{\"version\": 1, \"windows\": [{\"name\": \"A\"}]}", FILE)
  const path = await writeLayout(home, "team", layout, { force: false })
  assert.ok(path.endsWith("/layouts/team.jsonc"))
  await assert.rejects(writeLayout(home, "team", layout, { force: false }), /already exists; pass --force/)
  await writeLayout(home, "team", layout, { force: true })
  assert.deepEqual(await readLayout(home, "team"), layout)
  assert.deepEqual(await listLayouts(home), ["team"])
  await assert.rejects(readLayout(home, "nope"), /no layout named nope/)
  await assert.rejects(readLayout(home, "../etc"), /layout name may contain only/)
})

test("descendantCommand picks the harness child, never the saver, longest line otherwise", async() => {
  const { descendantCommand, harnessName } = await import("../src/commands/tmux/save.ts")
  const { shippedHarnesses } = await import("../src/harnesses.ts")
  const harnesses = shippedHarnesses()
  const rows = [
    { pid: 100, ppid: 1, args: "bash" },
    { pid: 200, ppid: 100, args: "bash /home/haze/.config/scripts/bin/codex resume PLANNER" },
    { pid: 201, ppid: 200, args: "node /home/haze/.local/share/pnpm/global/v11/xxx/node_modules/@opencode-ai/cli/bin/opencode2.exe" },
    { pid: 300, ppid: 100, args: "sleep 3600 --a-much-longer-argument-string-than-the-harness-line" },
    { pid: 900, ppid: 100, args: "node /home/haze/.local/share/pnpm/global/v11/5/node_modules/@tasarren/ttt/src/ttt.ts tmux save harness" },
    { pid: 901, ppid: 900, args: "ps -o pid=,ppid=,args=" },
  ]
  assert.equal(
    descendantCommand(rows, 100, 900, harnesses),
    "bash /home/haze/.config/scripts/bin/codex resume PLANNER",
    "the harness child wins over a longer background line, the saver subtree excluded",
  )
  const bare = [
    { pid: 100, ppid: 1, args: "bash" },
    { pid: 900, ppid: 100, args: "node /home/haze/.local/share/pnpm/global/v11/5/node_modules/@tasarren/ttt/src/ttt.ts tmux save harness" },
  ]
  assert.equal(descendantCommand(bare, 100, 900, harnesses), undefined, "a shell running only the save is bare")
  assert.equal(harnessName("bash /home/haze/.config/scripts/bin/codex resume PLANNER", harnesses), "codex")
  assert.equal(harnessName("bash /home/haze/.config/scripts/bin/claudex --resume REVIEWER", harnesses), "claude", "prefix-tolerant wrapper match")
  assert.equal(harnessName("sleep 3600", harnesses), undefined)
})

test("layout keeps the informational session field and the tree source", () => {
  const layout = parseLayout(`{
    "version": 1,
    "session": "harness",
    "profile": "agents",
    "windows": [{ "name": "A", "panes": [{ "command": "codex resume X", "source": "tree", "agent": true }] }],
  }`, "test.jsonc")
  assert.equal(layout.session, "harness")
  assert.equal(layout.windows[0]!.panes[0]!.source, "tree")
  assert.throws(() => parseLayout(`{
    "version": 1, "profile": "agents",
    "windows": [{ "name": "A", "panes": [{ "command": "x", "source": "guessed" }] }],
  }`, "test.jsonc"), /source may only be "process" or "tree"/)
})
