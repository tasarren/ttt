import { readFile } from "node:fs/promises"
import { resolve } from "node:path"
import { parseArgs } from "node:util"
import type { ParseArgsOptionsConfig } from "node:util"

import { MessagePriority } from "@ttt/board"

import { CliError, usageError } from "./cli-error.ts"

/** Everything after the first `--` is the message body; everything before is options and positionals. */
export function splitAtTerminator(argv: string[]): { head: string[]; body: string[] | undefined } {
  const at = argv.indexOf("--")
  return at < 0 ? { head: argv, body: undefined } : { head: argv.slice(0, at), body: argv.slice(at + 1) }
}

export interface Parsed<O extends ParseArgsOptionsConfig> {
  values: ReturnType<typeof parseArgs<{ options: O; strict: true; allowPositionals: true }>>["values"]
  positionals: string[]
}

/** `node:util` parseArgs with unknown options and missing values turned into exit-2 usage errors. */
export function parseCommandArgs<O extends ParseArgsOptionsConfig>(argv: string[], options: O): Parsed<O> {
  try {
    const { values, positionals } = parseArgs({ args: argv, options, strict: true, allowPositionals: true })
    return { values, positionals }
  } catch(error) {
    throw usageError(error instanceof Error ? error.message.replace(/\.\s*To specify.*$/s, "") : String(error))
  }
}

export const MESSAGE_OPTIONS = {
  "no-reply": { type: "boolean", default: false },
  urgent: { type: "boolean", default: false },
  replace: { type: "string" },
  file: { type: "string" },
} as const satisfies ParseArgsOptionsConfig

export interface MessagePayload {
  body: string
  replyExpected: boolean
  priority: MessagePriority
  replaceKey?: string
}

/** Body precedence: words after `--`, else `--file PATH`, else stdin. */
export async function readMessagePayload(
  values: Parsed<typeof MESSAGE_OPTIONS>["values"],
  bodyWords: string[] | undefined,
  stdin: NodeJS.ReadableStream = process.stdin,
): Promise<MessagePayload> {
  let body: string
  if (values.file !== undefined) {
    if (bodyWords && bodyWords.length > 0) throw usageError("cannot combine --file with an inline message")
    try {
      body = await readFile(resolve(values.file), "utf8")
    } catch(error) {
      throw new CliError(`cannot read message file ${values.file}: ${error instanceof Error ? error.message : String(error)}`, 2)
    }
  } else if (bodyWords && bodyWords.length > 0) {
    body = bodyWords.join(" ")
  } else {
    body = await readStream(stdin)
  }
  body = body.trimEnd()
  if (!body.trim()) throw usageError("message cannot be empty")
  if (values.replace !== undefined && !values.replace.trim()) throw usageError("--replace key cannot be empty")

  return {
    body,
    replyExpected: !values["no-reply"],
    priority: values.urgent ? MessagePriority.Urgent : MessagePriority.Normal,
    ...(values.replace ? { replaceKey: values.replace } : {}),
  }
}

async function readStream(stream: NodeJS.ReadableStream): Promise<string> {
  const chunks: Buffer[] = []
  for await (const chunk of stream) chunks.push(typeof chunk === "string" ? Buffer.from(chunk) : chunk)
  return Buffer.concat(chunks).toString("utf8")
}

export function boundedInt(raw: string | undefined, name: string, fallback: number, max: number): number {
  if (raw === undefined) return fallback
  const value = Number(raw)
  if (!Number.isInteger(value) || value < 1 || value > max) throw usageError(`${name} must be an integer between 1 and ${max}`)
  return value
}
