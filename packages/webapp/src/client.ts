// eslint-disable-next-line no-restricted-imports -- Public CSS export, not an internal module.
import "@ttt/ui/styles.css"
import "@xterm/xterm/css/xterm.css"
import "./web.css"
import { createApplication } from "./app.ts"
import { isWebState } from "./protocol.ts"

const source = document.getElementById("ttt-state")?.textContent
if (!source) throw new Error("Missing initial state")
const state: unknown = JSON.parse(source)
if (!isWebState(state)) throw new Error("Invalid initial state")
const { app, router } = createApplication(state, location.href, false)
void router.isReady().then(() => app.mount("#app"))
