#!/usr/bin/env node
import { CliError } from "./cli-error.ts"
import { main } from "./main.ts"

try {
  await main(process.argv.slice(2), process.argv[1]!)
} catch(error) {
  process.stderr.write(`ttt: ${error instanceof Error ? error.message : String(error)}\n`)
  process.exitCode = error instanceof CliError ? error.exitCode : 1
}
