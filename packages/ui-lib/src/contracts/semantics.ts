import type { LayoutFile, SettingsFile } from "./types.ts"
import { leafCount, parseLayout } from "./layout.ts"

export function validateLayoutSemantics(value: LayoutFile): string[] {
  const errors: string[] = []
  for (const [wi, window] of value.windows.entries()) {
    const prefix = `windows[${wi}]`
    if (!/^[A-Za-z0-9_-]+$/.test(window.name))
      errors.push(`${prefix}.name must use letters, digits, underscores or hyphens`)
    if (window.panes && window.panes.length > 1 && !window.layout)
      errors.push(`${prefix}.layout is required for multiple panes`)
    if (window.layout) {
      try {
        if (leafCount(parseLayout(window.layout)) !== (window.panes?.length || 1))
          errors.push(`${prefix}.layout pane count does not match panes`)
      }
      catch(e) {
        errors.push(`${prefix}.layout: ${(e as Error).message}`)
      }
    }
    for (const [pi, pane] of (window.panes || []).entries()) {
      if (pane.title && (pane.agent === true || typeof pane.agent === "string"))
        errors.push(`${prefix}.panes[${pi}].title is only valid for helper panes`)
    }
  }
  return errors
}
export function validateSettingsSemantics(value: SettingsFile, shipped?: readonly string[]): string[] {
  const errors: string[] = []
  if (value.harnesses) {
    if (Object.values(value.harnesses).filter(h => h.default === true).length !== 1)
      errors.push("harnesses must contain exactly one default=true entry")
    for (const [name, harness] of Object.entries(value.harnesses)) {
      if (shipped && !shipped.includes(name) && (!harness.bin || !harness.ready))
        errors.push(`harnesses.${name} requires bin and ready for a new harness`)
      for (const key of [
        "ready", "limited",
      ] as const)
        if (harness[key]) {
          try {
            new RegExp(harness[key])
          }
          catch {
            errors.push(`harnesses.${name}.${key} is not a valid regular expression`)
          }
        }
    }
  }
  return errors
}
