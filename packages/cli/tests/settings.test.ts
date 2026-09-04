import assert from "node:assert/strict"
import { mkdtemp, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { after, test } from "node:test"

import { defaultSettings, resolveSettings } from "../src/settings.ts"

const homes: string[] = []
after(async() => {
  for (const home of homes) await rm(home, { recursive: true, force: true })
})

async function home(files: Record<string, string> = {}): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "ttt-home-"))
  homes.push(dir)
  for (const [name, text] of Object.entries(files)) await writeFile(join(dir, name), text)
  return dir
}

test("no settings file yields the defaults rooted at TTT_HOME", async() => {
  const dir = await home()
  const settings = await resolveSettings({ TTT_HOME: dir })
  assert.deepEqual(settings, defaultSettings(dir))
  assert.equal(settings.boardRoot, join(dir, "boards"))
  assert.equal(settings.notifySeconds, 60)
})

test("settings.jsonc accepts comments, trailing commas, partial overrides, and ~ expansion", async() => {
  const dir = await home({
    "settings.jsonc": `{
      // batching window
      "notifySeconds": 5,
      "notifyOverrides": { "WATCHER": 10 },
      "boardRoot": "~/boards-elsewhere",
      "tmux": { "enterPresses": 1, },
    }`,
  })
  const settings = await resolveSettings({ TTT_HOME: dir })
  assert.equal(settings.notifySeconds, 5)
  assert.deepEqual(settings.notifyOverrides, { WATCHER: 10 })
  assert.equal(settings.tmux.enterPresses, 1)
  assert.equal(settings.tmux.postPasteMs, 500, "untouched keys keep their defaults")
  assert.ok(settings.boardRoot.endsWith("/boards-elsewhere"))
  assert.ok(!settings.boardRoot.startsWith("~"))
})

test("settings.json is the fallback when settings.jsonc is absent", async() => {
  const dir = await home({ "settings.json": "{\"readMax\": 3}" })
  assert.equal((await resolveSettings({ TTT_HOME: dir })).readMax, 3)
})

test("bad values, unknown keys, and syntax errors are exit-2 errors naming the file", async() => {
  const bad = async(text: string, pattern: RegExp): Promise<void> => {
    const dir = await home({ "settings.jsonc": text })
    await assert.rejects(resolveSettings({ TTT_HOME: dir }), (error: unknown) => {
      assert.ok(error instanceof Error)
      assert.equal((error as { exitCode?: number }).exitCode, 2)
      assert.match(error.message, /settings\.jsonc/)
      assert.match(error.message, pattern)
      return true
    })
  }
  await bad("{\"notifySeconds\": -1}", /notifySeconds must be/)
  await bad("{\"notifySeconds\": \"60\"}", /notifySeconds must be/)
  await bad("{\"notifyOverrides\": {\"../x\": 5}}", /notifyOverrides window name/)
  await bad("{\"notifyOverrides\": {\"B\": -1}}", /notifyOverrides\.B must be/)
  await bad("{\"notifyOverrides\": 5}", /notifyOverrides must be an object/)
  await bad("{\"readMax\": 0}", /readMax must be an integer of at least 1/)
  await bad("{\"capture\": {\"lines\": 0}}", /capture\.lines must be an integer of at least 1/)
  await bad("{\"capture\": {\"maxLines\": 0}}", /capture\.maxLines must be an integer of at least 1/)
  await bad("{\"tmux\": {\"enterPreses\": 1}}", /unknown setting "tmux\.enterPreses"/)
  await bad("{\"typo\": 1}", /unknown setting "typo"/)
  await bad("{\"lock\": 5}", /lock must be an object/)
  await bad("{ oops ", /at offset/)
})
