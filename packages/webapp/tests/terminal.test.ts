import { test } from "node:test"
import assert from "node:assert/strict"
import { createRenderer, h, shallowRef, ref, nextTick } from "vue"
import { makeLayout, serializeLayout } from "@ttt/ui"
import type { TreeWindow } from "@ttt/ui"
import { LiveWindow } from "../src/terminal.ts"

test("terminal subscription survives state refreshes and geometry changes", async() => {
  let connections = 0
  const original = Object.getOwnPropertyDescriptor(globalThis, "document")
  const originalObserver = Object.getOwnPropertyDescriptor(globalThis, "IntersectionObserver")
  let show: ((shown: boolean) => void) | undefined
  Object.defineProperty(globalThis, "IntersectionObserver", { configurable: true, value: class {
    constructor(callback: (entries: { isIntersecting: boolean }[]) => void) { show = shown => { callback([{ isIntersecting: shown }]) } }
    observe() { show?.(true) }
    disconnect() {}
  } })
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
  const fontSizes = ref<Record<string, number>>({})
  const app = renderer.createApp({ render: () => h(LiveWindow, { session: "probe", window: window.value, layout: layout.value, fontSizes: fontSizes.value, token: "test", selected: "" }) })
  const flush = async() => { await nextTick(); await nextTick() }
  try {
    app.mount({})
    await flush()
    assert.equal(connections, 1)
    window.value = { ...window.value, name: "renamed", panes: window.value.panes.map(pane => ({ ...pane, title: "updated" })) }
    await flush()
    assert.equal(connections, 1, "metadata refresh must not reconnect")
    fontSizes.value = { "%0": 18 }
    await flush()
    assert.equal(connections, 1, "manual text sizing must not reconnect")
    layout.value = serializeLayout(makeLayout(1))
    await flush()
    assert.equal(connections, 1, "geometry changes must not reconnect")
    window.value = { ...window.value, id: "@1" }
    await flush()
    assert.equal(connections, 2, "selecting another window must reconnect")
    window.value = { ...window.value, panes: [] }
    await flush()
    assert.equal(connections, 3, "changed pane membership must reconnect")
    show?.(false)
    window.value = { ...window.value, id: "@2" }
    await flush()
    assert.equal(connections, 3, "offscreen windows must not reconnect")
    show?.(true)
    await flush()
    assert.equal(connections, 4, "returning to a visible window reconnects")
  } finally {
    app.unmount()
    if (original) Object.defineProperty(globalThis, "document", original)
    else Reflect.deleteProperty(globalThis, "document")
    if (originalObserver) Object.defineProperty(globalThis, "IntersectionObserver", originalObserver)
    else Reflect.deleteProperty(globalThis, "IntersectionObserver")
  }
})
