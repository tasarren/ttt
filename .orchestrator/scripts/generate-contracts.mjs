import { readFile, writeFile } from "node:fs/promises"
const schema = JSON.parse(await readFile(new URL("../../docs/ttt-system.schema.json", import.meta.url), "utf8"))
const literal = x => JSON.stringify(x)
function type(s) {
  if (s.$ref) return s.$ref.split("/").at(-1)
  if ("const" in s) return literal(s.const)
  if (s.enum) return s.enum.map(literal).join(" | ")
  if (s.oneOf) return s.oneOf.map(type).join(" | ")
  if (s.type === "array") return `Array<${type(s.items)}>`
  if (s.type === "object") {
    if (!s.properties && s.additionalProperties && typeof s.additionalProperties === "object") return `Record<string, ${type(s.additionalProperties)}>`
    return `{\n${Object.entries(s.properties || {}).map(([key, value]) => `  ${value.description ? `/** ${value.description.replaceAll("*/", "* /")} */\n  ` : ""}${key}${s.required?.includes(key) ? "" : "?"}: ${type(value)}`).join("\n")}\n}`
  }
  return { string: "string", integer: "number", number: "number", boolean: "boolean", null: "null" }[s.type] || "unknown"
}
const body = Object.entries(schema.$defs).map(([name, def]) => `${def.description ? `/** ${def.description} */\n` : ""}export type ${name} = ${type(def)}`).join("\n\n")
await writeFile(new URL("../../packages/ui-lib/src/contracts/types.ts", import.meta.url), `// Generated from docs/ttt-system.schema.json. Run pnpm --filter @ttt/ui generate; do not hand-edit.\n\n${body}\n`)
console.log(`Generated ${Object.keys(schema.$defs).length} contract definitions`)
