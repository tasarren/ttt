import { randomUUID } from "node:crypto"
import { mkdir, readFile, readdir, rename, rm, stat, writeFile } from "node:fs/promises"
import { dirname, join } from "node:path"
import { setTimeout as sleep } from "node:timers/promises"

export function isErrno(error: unknown, code: string): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === code
}

/** Write via a sibling temp file + rename so readers never observe a half-written document. */
export async function atomicWriteJson(path: string, value: unknown): Promise<void> {
  await mkdir(dirname(path), { recursive: true })
  const temporary = `${path}.tmp.${process.pid}.${randomUUID()}`
  await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, "utf8")
  await rename(temporary, path)
}

export async function readJsonIfExists<T>(path: string): Promise<T | undefined> {
  try {
    return JSON.parse(await readFile(path, "utf8")) as T
  } catch(error) {
    if (isErrno(error, "ENOENT")) return undefined
    throw error
  }
}

/** Every parseable `.json` document under `root` (recursively). Corrupt or vanished files are skipped. */
export async function readJsonTree<T>(root: string): Promise<T[]> {
  let entries
  try {
    entries = await readdir(root, { recursive: true, withFileTypes: true })
  } catch(error) {
    if (isErrno(error, "ENOENT")) return []
    throw error
  }
  const documents: T[] = []
  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith(".json")) continue
    try {
      const document = await readJsonIfExists<T>(join(entry.parentPath, entry.name))
      if (document !== undefined) documents.push(document)
    } catch {
      // A corrupt document must not make the whole tree unreadable.
    }
  }
  return documents
}

/**
 * Best-effort cleanup of `atomicWriteJson` temp files orphaned by crashed writers
 * (`<name>.tmp.<pid>.<uuid>`). Only files older than `olderThanMs` are removed so a
 * concurrent live writer is never disturbed. Never throws.
 */
export async function sweepTempFiles(root: string, olderThanMs: number): Promise<number> {
  let entries
  try {
    entries = await readdir(root, { recursive: true, withFileTypes: true })
  } catch(error) {
    if (isErrno(error, "ENOENT")) return 0
    throw error
  }
  const cutoff = Date.now() - olderThanMs
  let removed = 0
  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.includes(".tmp.")) continue
    const path = join(entry.parentPath, entry.name)
    try {
      const info = await stat(path)
      if (info.mtimeMs > cutoff) continue
      await rm(path, { force: true })
      removed += 1
    } catch {
      // A concurrent writer may rename the file first; that just means no cleanup is needed.
    }
  }
  return removed
}

export interface LockOptions {
  timeoutMs: number
  /** A lock directory older than this is assumed to belong to a dead process and is removed. */
  staleMs: number
}

/** Cross-process mutex via atomic `mkdir`. Works on every local filesystem without extra tooling. */
export async function withDirectoryLock<T>(
  lockPath: string,
  options: LockOptions,
  callback: () => Promise<T>,
): Promise<T> {
  const start = Date.now()
  await mkdir(dirname(lockPath), { recursive: true })

  for (;;) {
    try {
      await mkdir(lockPath)
      break
    } catch(error) {
      if (!isErrno(error, "EEXIST")) throw error
    }

    try {
      const info = await stat(lockPath)
      if (Date.now() - info.mtimeMs > options.staleMs) {
        await rm(lockPath, { recursive: true, force: true })
        continue
      }
    } catch(error) {
      if (!isErrno(error, "ENOENT")) throw error
      continue
    }

    if (Date.now() - start >= options.timeoutMs) throw new Error(`timed out waiting for lock: ${lockPath}`)
    await sleep(25)
  }

  try {
    return await callback()
  } finally {
    await rm(lockPath, { recursive: true, force: true })
  }
}
