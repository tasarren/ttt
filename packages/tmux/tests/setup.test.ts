import assert from "node:assert/strict"
import { test } from "node:test"

import { CheckState, DEFAULT_TMUX_OPTIONS, OptionScope, SetupMode, Tmux, TmuxError, TmuxFailure } from "../src/index.ts"
import type { SetupProfile } from "../src/index.ts"

/** A fake server with global defaults, per-target explicit options, session hooks, and one window. */
function fakeServer(globals: Record<string, string>): { tmux: Tmux; explicit: Map<string, string>; hooks: string[] } {
  const explicit = new Map<string, string>()
  const hooks: string[] = []
  const key = (args: string[], name: string): string => {
    const scope = args.includes("-s") ? "s" : args.includes("-w") ? "w" : args.includes("-p") ? "p" : ""
    const at = args.indexOf("-t")
    return `${scope}|${at === -1 ? "" : args[at + 1]!}|${name}`
  }
  const tmux = new Tmux(DEFAULT_TMUX_OPTIONS, async(args) => {
    const verb = args[0]!
    const bare = args.filter((arg, index) => index > 0 && !arg.startsWith("-") && args[index - 1] !== "-t" && args[index - 1] !== "-F")
    switch (verb) {
      case "list-windows":
        return "A\t@1\n"
      case "show-options": {
        const name = bare[0]!
        const value = explicit.get(key(args, name)) ?? (args.includes("-A") ? globals[name] : undefined)
        if (value === undefined) {
          if (name.startsWith("@")) throw new TmuxError(TmuxFailure.BadOption, verb, `invalid option: ${name}`)
          return "\n"
        }
        return `${value}\n`
      }
      case "set-option": {
        const name = bare[0]!
        if (args.includes("-u")) explicit.delete(key(args, name))
        else explicit.set(key(args, name), bare[1]!)
        return ""
      }
      case "set-hook":
        if (args.includes("-u")) hooks.splice(0)
        else hooks.push(`${bare[0]!} ${bare[1]!}`)
        return ""
      case "show-hooks":
        return hooks.map((hook, index) => `${hook.split(" ")[0]!}[${index}] ${hook.slice(hook.indexOf(" ") + 1)}`).join("\n")
      default:
        throw new Error(`unexpected ${verb}`)
    }
  })
  return { tmux, explicit, hooks }
}

const PROFILE: SetupProfile = {
  name: "test",
  options: [
    { scope: OptionScope.Window, key: "allow-rename", value: "off", mode: SetupMode.Pin, why: "identity" },
    { scope: OptionScope.Session, key: "base-index", value: "1", mode: SetupMode.Pin, why: "ux" },
    { scope: OptionScope.Server, key: "escape-time", value: "10", mode: SetupMode.PinLowerOnly, why: "tui" },
    { scope: OptionScope.Session, key: "aggressive-resize", value: "on", mode: SetupMode.Assert, why: "capture width" },
  ],
}

test("hook diagnostics tolerate an unavailable client log but propagate other failures", async() => {
  const missingClient = new Tmux(DEFAULT_TMUX_OPTIONS, async() => { throw new TmuxError(TmuxFailure.NoClient, "show-messages", "no current client") })
  assert.deepEqual(await missingClient.hooks.failures("_normalize-window"), [])
  const missingServer = new TmuxError(TmuxFailure.NoServer, "show-messages", "no server running")
  const offline = new Tmux(DEFAULT_TMUX_OPTIONS, async() => { throw missingServer })
  await assert.rejects(offline.hooks.failures("_normalize-window"), (error) => error === missingServer)
})

test("apply pins only what the effective value misses, saves originals, and is idempotent", async() => {
  const { tmux, explicit, hooks } = fakeServer({ "allow-rename": "on", "base-index": "1", "escape-time": "500", "aggressive-resize": "off" })
  const report = await tmux.setup.apply("work", PROFILE, "run-shell x")
  const byKey = Object.fromEntries(report.checks.map((check) => [check.key, check.state]))
  assert.deepEqual(byKey, {
    "allow-rename": CheckState.Pinned,
    "base-index": CheckState.Ok,
    "escape-time": CheckState.Pinned,
    "aggressive-resize": CheckState.Off,
  })
  assert.equal(explicit.get("w|@1|allow-rename"), "off")
  assert.equal(explicit.get("w|@1|@ttt_prev_allow_rename"), "<unset>")
  assert.equal(explicit.get("s||escape-time"), "10")
  assert.equal(explicit.get("s||@ttt_prev_escape_time"), "500")
  assert.equal(explicit.has("|work|base-index"), false, "already satisfied by the global: not pinned")
  assert.equal(explicit.has("|work|aggressive-resize"), false, "assert never writes")
  assert.equal(explicit.get("|work|@ttt_setup"), "test")
  assert.deepEqual(hooks, ["after-new-window run-shell x"])

  const again = await tmux.setup.apply("work", PROFILE, "run-shell x")
  assert.equal(again.checks.filter((check) => check.state === CheckState.Pinned).length, 0)
  assert.equal(explicit.get("s||@ttt_prev_escape_time"), "500", "the original is never overwritten by a re-pin")
})

test("pin-lower-only leaves a smaller user value alone", async() => {
  const { tmux, explicit } = fakeServer({ "escape-time": "0", "allow-rename": "off", "base-index": "1", "aggressive-resize": "on" })
  const report = await tmux.setup.apply("work", PROFILE, "run-shell x")
  assert.equal(report.checks.find((check) => check.key === "escape-time")?.state, CheckState.Ok)
  assert.equal(explicit.has("s||escape-time"), false)
})

test("check reports without writing; revert restores originals and removes the hook and marker", async() => {
  const { tmux, explicit, hooks } = fakeServer({ "allow-rename": "on", "base-index": "0", "escape-time": "500", "aggressive-resize": "on" })
  const before = await tmux.setup.check("work", PROFILE)
  assert.equal(before.hookInstalled, false)
  assert.equal(before.checks.filter((check) => check.state === CheckState.Off).length, 3)
  assert.equal(explicit.size, 0)

  await tmux.setup.apply("work", PROFILE, "run-shell x")
  const after = await tmux.setup.check("work", PROFILE)
  assert.equal(after.hookInstalled, true)
  assert.equal(after.checks.filter((check) => check.state === CheckState.Off).length, 0)

  const restored = await tmux.setup.revert("work", PROFILE)
  assert.equal(restored, 3)
  // Window/session pins go back to "unset here" (inherit again); a server option has no parent,
  // so its original value is written back explicitly. No @ttt_* leftovers either way.
  assert.deepEqual([...explicit.entries()], [["s||escape-time", "500"]])
  assert.deepEqual(hooks, [])
})
