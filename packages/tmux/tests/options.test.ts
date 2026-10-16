import assert from "node:assert/strict"
import { test } from "node:test"

import { OptionScope, Options, TmuxError, TmuxFailure, previousKey } from "../src/index.ts"

/** A fake server that stores options per `scope|target|key` and answers like tmux 3.7 does. */
function fakeOptions(): { options: Options; store: Map<string, string>; calls: string[][] } {
  const store = new Map<string, string>()
  const calls: string[][] = []
  const options = new Options(async(args) => {
    calls.push(args)
    const verb = args[0]!
    const scope = args.includes("-s") ? "s" : args.includes("-w") ? "w" : args.includes("-p") ? "p" : ""
    const targetIndex = args.indexOf("-t")
    const target = targetIndex === -1 ? "" : args[targetIndex + 1]!
    const positional = args.filter((arg, index) => index > 0 && !arg.startsWith("-") && args[index - 1] !== "-t")
    const key = positional[0]!
    const id = `${scope}|${target}|${key}`
    if (verb === "show-options") {
      const value = store.get(id)
      if (value === undefined) {
        if (key.startsWith("@")) throw new TmuxError(TmuxFailure.BadOption, verb, `invalid option: ${key}`)
        return "\n"
      }
      return `${value}\n`
    }
    if (args.includes("-u")) {
      if (!store.has(id)) throw new TmuxError(TmuxFailure.BadOption, verb, `invalid option: ${key}`)
      store.delete(id)
      return ""
    }
    store.set(id, positional[1]!)
    return ""
  })
  return { options, store, calls }
}

test("get reports an unset user option as absent and a set one by value", async() => {
  const { options } = fakeOptions()
  const ref = { scope: OptionScope.Pane, target: "%1", key: "@ttt_agent" } as const
  assert.equal(await options.get(ref), undefined)
  await options.set(ref, "CODER")
  assert.equal(await options.get(ref), "CODER")
  await options.unset(ref)
  assert.equal(await options.get(ref), undefined)
  await options.unset(ref)
})

test("scopes map to the tmux flags and the server scope never carries a target", async() => {
  const { options, calls } = fakeOptions()
  await options.set({ scope: OptionScope.Server, target: "ignored", key: "escape-time" }, "10")
  await options.set({ scope: OptionScope.Session, target: "work", key: "base-index" }, "1")
  await options.set({ scope: OptionScope.Window, target: "@3", key: "allow-rename" }, "off")
  await options.set({ scope: OptionScope.Pane, target: "%7", key: "@x" }, "y")
  assert.deepEqual(calls, [
    ["set-option", "-s", "escape-time", "10"],
    ["set-option", "-t", "work", "base-index", "1"],
    ["set-option", "-w", "-t", "@3", "allow-rename", "off"],
    ["set-option", "-p", "-t", "%7", "@x", "y"],
  ])
})

test("pin saves the original once and restore brings it back, including an unset original", async() => {
  const { options, store } = fakeOptions()
  const rename = { scope: OptionScope.Window, target: "@3", key: "allow-rename" } as const
  const custom = { scope: OptionScope.Session, target: "work", key: "@ttt_theme" } as const
  store.set("w|@3|allow-rename", "on")

  await options.pin(rename, "off")
  await options.pin(rename, "off")
  assert.equal(store.get("w|@3|allow-rename"), "off")
  assert.equal(store.get(`w|@3|${previousKey("allow-rename")}`), "on")

  await options.pin(custom, "dark")
  assert.equal(store.get(`||work|${previousKey("@ttt_theme")}`.replace("||", "|")), "<unset>")

  assert.equal(await options.restore(rename), true)
  assert.equal(store.get("w|@3|allow-rename"), "on")
  assert.equal(store.has(`w|@3|${previousKey("allow-rename")}`), false)

  assert.equal(await options.restore(custom), true)
  assert.equal(store.has("|work|@ttt_theme"), false)
  assert.equal(await options.restore(custom), false)
})

test("previousKey is a valid user option name for builtin and user keys", () => {
  assert.equal(previousKey("allow-rename"), "@ttt_prev_allow_rename")
  assert.equal(previousKey("@ttt_theme"), "@ttt_prev_ttt_theme")
})
