import { renderToString } from "@vue/server-renderer"
import { createApplication } from "./app.ts"
import type { WebState } from "./protocol.ts"

export async function render(url: string, state: WebState): Promise<string> {
  const { app, router } = createApplication(state, url, true)
  await router.isReady()
  return renderToString(app)
}
