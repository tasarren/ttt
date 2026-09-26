import { test } from "node:test"
import assert from "node:assert/strict"
import { createRenderer, h, shallowRef, ref, nextTick } from "vue"
import { makeLayout, serializeLayout } from "@ttt/ui"
import type { TreeWindow } from "@ttt/ui"
import { LiveWindow } from "../src/terminal.ts"

test("terminal subscription survives state refreshes and geometry changes", async() => {
  let connections = 0
  const original = Object.getOwnPropertyDescriptor(globalThis, "document")
  // Hidden document exercises the component's reconnect path without browser-only xterm.
  Object.defineProperty(globalThis, "document", { configurable: true, value: {
    get hidden() { connections++; return true }, addEventListener() {}, removeEventListener() {},
  } })
  const renderer = createRenderer<object, object>({
    createElement: () => ({}), createText: () => ({}), createComment: () => ({}),
    insert() {}, remove() {}, patchProp() {}, setText() {}, setElementText() {},
    parentNode: () => null, nextSibling: () => null,
  })
  const window = shallowRef<TreeWindow>({ name: "main", id: "@0", index: 0, active: true, panes: [{
    session: "probe", window: "main", windowId: "@0", pane: "%0", index: 0, pid: 1,
    active: true, dead: false, cwd: "/tmp", command: "sh", title: "shell", historyLimit: 2000,
  }] })
  const layout = ref("")
  const app = renderer.createApp({ render: () => h(LiveWindow, { session: "probe", window: window.value, layout: layout.value, token: "test", selected: "" }) })
  const flush = async() => { await nextTick(); await nextTick() }
  try {
    app.mount({})
    await flush()
    assert.equal(connections, 1)
    window.value = { ...window.value, name: "renamed", panes: window.value.panes.map(pane => ({ ...pane, title: "updated" })) }
    await flush()
    assert.equal(connections, 1, "metadata refresh must not reconnect")
    layout.value = serializeLayout(makeLayout(1))
    await flush()
    assert.equal(connections, 1, "geometry changes must not reconnect")
    window.value = { ...window.value, id: "@1" }
    await flush()
    assert.equal(connections, 2, "selecting another window must reconnect")
    window.value = { ...window.value, panes: [] }
    await flush()
    assert.equal(connections, 3, "changed pane membership must reconnect")
  } finally {
    app.unmount()
    if (original) Object.defineProperty(globalThis, "document", original)
    else Reflect.deleteProperty(globalThis, "document")
  }
})
