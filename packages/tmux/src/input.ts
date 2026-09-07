import { randomBytes } from "node:crypto"
import { setTimeout as sleep } from "node:timers/promises"

import type { TmuxRunner } from "./runner.ts"

export interface TmuxOptions {
  /** Pause after clearing the target's input line, before pasting. */
  inputSettleMs: number
  /** Pause after the paste and between Enter presses. */
  postPasteMs: number
  /** How many times Enter is pressed after the paste; slow TUIs may swallow the first ones. */
  enterPresses: number
  /** Pause after the last Enter before returning. */
  postSendMs: number
}

export const DEFAULT_TMUX_OPTIONS: TmuxOptions = {
  inputSettleMs: 800,
  postPasteMs: 500,
  enterPresses: 3,
  postSendMs: 300,
}

/** Keys tmux understands by name; anything else is sent literally. */
export const Key = {
  Enter: "Enter",
  Escape: "Escape",
  Tab: "Tab",
  Interrupt: "C-c",
  ClearLine: "C-u",
  EndOfFile: "C-d",
} as const
export type Key = (typeof Key)[keyof typeof Key]

/** Typing into panes. Pastes go through a private buffer so the text never touches the user's clipboard. */
export class Input {
  private readonly run: TmuxRunner
  private readonly options: TmuxOptions

  constructor(run: TmuxRunner, options: TmuxOptions) {
    this.run = run
    this.options = options
  }

  /** Clears the target's input line, pastes `text` through a private buffer, then presses Enter. */
  async sendText(target: string, text: string): Promise<void> {
    const { inputSettleMs, postPasteMs, enterPresses, postSendMs } = this.options
    await this.run(["send-keys", "-t", target, Key.ClearLine])
    if (inputSettleMs > 0) await sleep(inputSettleMs)
    const buffer = await this.fillBuffer(text)
    try {
      await this.pasteBuffer(buffer, target, false)
      if (postPasteMs > 0) await sleep(postPasteMs)
      for (let press = 0; press < enterPresses; press += 1) {
        await this.run(["send-keys", "-t", target, Key.Enter])
        if (postPasteMs > 0 && press + 1 < enterPresses) await sleep(postPasteMs)
      }
      if (postSendMs > 0) await sleep(postSendMs)
    } finally {
      await this.dropBuffer(buffer)
    }
  }

  /** Pastes without clearing or pressing Enter; bracketed so TUIs treat it as one paste. */
  async type(target: string, text: string): Promise<void> {
    const buffer = await this.fillBuffer(text)
    try {
      await this.pasteBuffer(buffer, target, true)
    } finally {
      await this.dropBuffer(buffer)
    }
  }

  /** `key` is a tmux key name (`Enter`, `C-c`, `M-x`, ...); see `Key` for the ones ttt uses itself. */
  async press(target: string, key: string): Promise<void> {
    await this.run(["send-keys", "-t", target, key])
  }

  async interrupt(target: string): Promise<void> {
    await this.press(target, Key.Interrupt)
  }

  private async fillBuffer(text: string): Promise<string> {
    const buffer = `ttt-${process.pid}-${randomBytes(4).toString("hex")}`
    await this.run(["set-buffer", "-b", buffer, "--", text])
    return buffer
  }

  private async pasteBuffer(buffer: string, target: string, bracketed: boolean): Promise<void> {
    const args = ["paste-buffer", "-b", buffer, "-d"]
    if (bracketed) args.push("-p")
    await this.run([...args, "-t", target])
  }

  /** paste-buffer -d already deleted it on success; this only matters when the paste failed. */
  private async dropBuffer(buffer: string): Promise<void> {
    await this.run(["delete-buffer", "-b", buffer]).catch(() => undefined)
  }
}
