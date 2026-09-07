import { MessageKind, MessagePriority } from "@ttt/board"
import type { BoardMessage } from "@ttt/board"
import { winnersByName } from "@ttt/tmux"
import type { TmuxWindow } from "@ttt/tmux"

import { MESSAGE_OPTIONS, boundedInt, parseCommandArgs, readMessagePayload, splitAtTerminator } from "../args.ts"
import type { Parsed } from "../args.ts"
import { CliError, usageError } from "../cli-error.ts"
import { isSelf } from "../context.ts"
import type { Context, Handler } from "../context.ts"
import { WaitOutcome, waitForMail } from "../wait.ts"
import { formatBatch, formatHeaders } from "./inbox.ts"
import { pushUrgent, spawnNotifier } from "./notify.ts"

export const send: Handler = async(argv, ctx) => {
  const { head, body } = splitAtTerminator(argv)
  const { values, positionals } = parseCommandArgs(head, MESSAGE_OPTIONS)
  const [target, ...extra] = positionals
  if (target === undefined || extra.length > 0) throw usageError("usage: ttt send TARGET [options] -- MESSAGE")
  await deliver(ctx, { targets: [target], kind: MessageKind.Message }, values, body)
}

const BROADCAST_OPTIONS = { ...MESSAGE_OPTIONS, all: { type: "boolean", default: false } } as const

export const broadcast: Handler = async(argv, ctx) => {
  const { head, body } = splitAtTerminator(argv)
  const { values, positionals } = parseCommandArgs(head, BROADCAST_OPTIONS)
  let targets = positionals
  if (values.all) {
    if (positionals.length > 0) throw usageError("--all cannot be combined with target names")
    const winners = winnersByName(await ctx.tmux.inventory.listWindows(ctx.session))
    targets = [...winners.values()].filter((window) => !isSelf(ctx, window)).map((w) => w.name)
  }
  if (targets.length === 0) throw usageError("broadcast has no recipients")
  await deliver(ctx, { targets, kind: MessageKind.Broadcast }, values, body)
}

const REPLY_OPTIONS = { ...MESSAGE_OPTIONS, to: { type: "string", default: "sender" } } as const
const AUDIENCES = ["sender", "receiver", "both", "thread"]

export const reply: Handler = async(argv, ctx) => {
  const { head, body } = splitAtTerminator(argv)
  const { values, positionals } = parseCommandArgs(head, REPLY_OPTIONS)
  const [originalId, ...extra] = positionals
  if (originalId === undefined || extra.length > 0) throw usageError("usage: ttt reply MESSAGE_ID [options] -- MESSAGE")
  if (!AUDIENCES.includes(values.to)) throw usageError("--to must be sender, receiver, both, or thread")

  const original = await ctx.board.findMessage(originalId)
  if (values.subject !== undefined) throw usageError("--subject is set on the thread root only")
  const audience = new Set<string>()
  if (values.to === "thread") {
    for (const name of await ctx.board.threadParticipants(original.threadId)) audience.add(name)
  } else {
    if (values.to !== "receiver") audience.add(original.from)
    if (values.to !== "sender") for (const recipient of original.recipients) audience.add(recipient)
  }
  audience.delete(ctx.senderName)
  if (audience.size === 0) throw new CliError(`message ${originalId} has no reply audience other than yourself`)

  await deliver(ctx, { targets: [...audience], kind: MessageKind.Reply, inReplyTo: originalId }, values, body)
}

interface Route {
  targets: string[]
  kind: MessageKind
  inReplyTo?: string
}

/** The one send flow: validate windows, read the body, record on the board, schedule or push, report. */
async function deliver(
  ctx: Context,
  route: Route,
  values: Parsed<typeof MESSAGE_OPTIONS>["values"],
  bodyWords: string[] | undefined,
): Promise<void> {
  const windows = await resolveTargets(ctx, route.targets)
  const payload = await readMessagePayload(values, bodyWords)
  if (values.timeout !== undefined && !values.wait) throw usageError("--timeout needs --wait")
  if (values.wait && values["no-reply"]) throw usageError("--wait needs a reply; drop --no-reply")
  const waitSeconds = values.wait ? boundedInt(values.timeout, "--timeout", ctx.settings.wait.seconds, ctx.settings.wait.maxSeconds) : undefined
  if (waitSeconds !== undefined) await refuseMutualWait(ctx, route.targets)
  const { message, notifications, waiting } = await ctx.board.send(ctx.senderName, route.targets, payload.body, {
    kind: route.kind,
    priority: payload.priority,
    replyExpected: payload.replyExpected,
    ...(payload.replaceKey ? { replaceKey: payload.replaceKey } : {}),
    ...(route.inReplyTo ? { inReplyTo: route.inReplyTo } : {}),
    ...(payload.subject ? { subject: payload.subject } : {}),
    ...(payload.ttlMs !== undefined ? { ttlMs: payload.ttlMs } : {}),
  })
  for (const marker of notifications) spawnNotifier(ctx, marker)

  const to = message.recipients.join(", ")
  const thread = route.kind === MessageKind.Reply ? ` (thread ${message.threadId})` : ""
  const listening = waiting.length > 0 ? ` (${waiting.join(", ")} waiting: delivered directly)` : ""
  if (payload.priority === MessagePriority.Urgent) {
    await pushUrgent(ctx, message, new Map([...windows].filter(([name]) => !waiting.includes(name))))
    process.stdout.write(`sent URGENT ${message.messageId} -> ${to}${thread}${listening}\n`)
  } else if (notifications.length === 0) {
    const how = waiting.length === message.recipients.length ? "" : " (joins pending batch)"
    process.stdout.write(`queued ${message.messageId} -> ${to}${how}${thread}${listening}\n`)
  } else {
    const delay = message.recipients.length === 1 ? ctx.board.notifyDelay(message.recipients[0]!) : ctx.settings.notifySeconds
    process.stdout.write(`queued ${message.messageId} -> ${to} (notify in ~${delay}s)${thread}${listening}\n`)
  }
  if (waitSeconds !== undefined) await awaitReply(ctx, message, waitSeconds)
}

/**
 * Two agents each blocked on the other would sit until both time out. A target already
 * waiting on *our* thread is the only case the board can see; refuse it up front.
 */
async function refuseMutualWait(ctx: Context, targets: string[]): Promise<void> {
  for (const target of targets) {
    const presence = await ctx.board.presence(target)
    if (presence?.expect === "any") continue
    if (presence && (await ctx.board.threadParticipants(presence.expect.threadId)).includes(ctx.senderName)) {
      throw new CliError(`${target} is already waiting on a reply from you (thread ${presence.expect.threadId}); answer first`)
    }
  }
}

/** Blocks for the reply, prints it in full (marking it read), then the rest of the mailbox as headers. */
async function awaitReply(ctx: Context, message: BoardMessage, seconds: number): Promise<void> {
  const waited = await waitForMail(ctx, { expect: { threadId: message.threadId }, timeoutMs: seconds * 1_000 })
  const unread = await ctx.board.unreadCount(ctx.senderName)
  if (waited.outcome !== WaitOutcome.Arrived) {
    const why = waited.outcome === WaitOutcome.TimedOut ? `no reply within ${seconds}s` : "wait interrupted"
    process.stdout.write(`ttt: ${why}; ${unread} unread.\n`)
    return
  }
  const only = new Set(waited.messages.map((reply) => reply.messageId))
  const shown = await ctx.board.read(ctx.senderName, { max: only.size, peek: false, latest: false, only, ...(ctx.actor ? { actor: ctx.actor } : {}) })
  process.stdout.write(`${formatBatch(shown.messages, shown.remaining, false)}\n`)
  if (shown.remaining > 0) {
    const others = await ctx.board.read(ctx.senderName, { max: 1_000, peek: true, latest: false })
    process.stdout.write(`\n${formatHeaders(others.messages, others.remaining)}\n`)
  }
}

async function resolveTargets(ctx: Context, names: string[]): Promise<Map<string, TmuxWindow>> {
  const winners = winnersByName(await ctx.tmux.inventory.listWindows(ctx.session))
  const targets = new Map<string, TmuxWindow>()
  for (const name of names) {
    const window = winners.get(name)
    if (!window) throw new CliError(`tmux window does not exist: ${ctx.session}:${name}`)
    if (isSelf(ctx, window)) throw new CliError("refusing to send a message to the current window")
    targets.set(name, window)
  }
  return targets
}
