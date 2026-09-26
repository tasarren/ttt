import { test } from "node:test"
import assert from "node:assert/strict"
import { readFile, readdir } from "node:fs/promises"
test("atomic library has safe rendering and no human message mutation", async () => {
  const text = await readFile(new URL("../src/organisms/MessageCard.ts", import.meta.url), "utf8")
  assert.ok(!text.includes("innerHTML"))
  assert.ok(!text.includes("markAsRead"))
})
test("every public component has a preview story", async () => {
  const barrel = await readFile(new URL("../src/index.ts", import.meta.url), "utf8")
  const names = [...barrel.matchAll(/export \{ (\w+) \}/g)].map(m => m[1])
  const stories = await readdir(new URL("../stories/src/stories/", import.meta.url))
  assert.ok(names.length >= 35)
  for (const name of names) assert.ok(stories.includes(`${name}.story.vue`), `${name} story missing`)
})
