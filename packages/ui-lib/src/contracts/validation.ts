import Ajv2020 from "ajv/dist/2020.js"
import addFormats from "ajv-formats"
import { parse, printParseErrorCode } from "jsonc-parser"
import type { ParseError } from "jsonc-parser"
// Canonical schema lives outside the UI package; tsdown bundles it for the browser.
// eslint-disable-next-line import-x/no-relative-packages
import schema from "../../../../docs/ttt-system.schema.json" with { type: "json" }
import type { LayoutFile, SettingsFile } from "./types.ts"
import { validateLayoutSemantics, validateSettingsSemantics } from "./semantics.ts"

export type ContractName = keyof typeof schema.$defs
const ajv = new Ajv2020({
  allErrors: true, strict: false, useDefaults: false, coerceTypes: false,
})
addFormats(ajv)
ajv.addSchema(schema, "ttt")
const validators = new Map<ContractName, ReturnType<typeof ajv.compile>>()
export function validateContract(name: ContractName, value: unknown): string[] {
  let validate = validators.get(name)
  if (!validate) {
    validate = ajv.compile({
      $ref: `ttt#/$defs/${name}`,
    })
    validators.set(name, validate)
  }
  return validate(value) ? [] : (validate.errors || []).map(e => `${e.instancePath || "/"}: ${e.message}`)
}
export function parseJsonc<T>(text: string): {
  value?: T
  errors: string[]
} {
  const errors: ParseError[] = []
  const value = parse(text, errors, {
    allowTrailingComma: true, disallowComments: false,
  })
  return {
    value, errors: errors.map(e => `${printParseErrorCode(e.error)} at offset ${e.offset}`),
  }
}
export function validateLayout(value: unknown): string[] {
  const errors = validateContract("LayoutFile", value)
  return errors.length ? errors : validateLayoutSemantics(value as LayoutFile)
}
export function validateSettings(value: unknown, shipped?: readonly string[]): string[] {
  const errors = validateContract("SettingsFile", value)
  return errors.length ? errors : validateSettingsSemantics(value as SettingsFile, shipped)
}
export { schema }
