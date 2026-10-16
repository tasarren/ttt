// Rehearse the published 0.1.3 writer, migration of all boards, and rollback from a real backup.
// Usage: node verify-upgrade.mjs /absolute/candidate/ttt.mjs [/absolute/path/to/node]
import assert from "node:assert/strict"
import { execFileSync } from "node:child_process"
import { createHash } from "node:crypto"
import { cp, mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises"
import { join, resolve } from "node:path"
import { fileURLToPath } from "node:url"

const root = fileURLToPath(new URL("../../", import.meta.url))
assert.ok(process.argv[2], "pass the extracted candidate dist/ttt.mjs")
const candidate = resolve(process.argv[2])
const runtime = process.argv[3] ? resolve(process.argv[3]) : process.execPath
const tmp = join(root, ".orchestrator/tmp")
await mkdir(tmp, { recursive: true })
const work = await mkdtemp(join(tmp, "upgrade-"))
const metadataResponse = await fetch("https://registry.npmjs.org/@tasarren%2Fttt/0.1.3")
assert.ok(metadataResponse.ok, "registry metadata download failed")
const metadata = await metadataResponse.json()
assert.equal(metadata.version, "0.1.3")
const tarResponse = await fetch(metadata.dist.tarball)
assert.ok(tarResponse.ok, "registry tarball download failed")
const tar = Buffer.from(await tarResponse.arrayBuffer())
assert.equal(createHash("sha1").update(tar).digest("hex"), metadata.dist.shasum)
const archive = join(work, "0.1.3.tgz")
await writeFile(archive, tar)
execFileSync("tar", ["-xzf", archive, "-C", work])
const old = join(work, "package/dist/ttt.mjs")
const home = join(work, "home")
const boards = join(work, "boards") // Deliberately outside TTT_HOME; both must be backed up.
await mkdir(home)
await writeFile(join(home, "settings.jsonc"), JSON.stringify({ boardRoot: boards, notifySeconds: 0, tmux: { inputSettleMs: 0, postPasteMs: 0, enterPresses: 0, postSendMs: 0 } }))
await mkdir(join(home, "sessions"))
await writeFile(join(home, "sessions", "operator-note.json"), '{"preserve":true}\n')
const socket = `ttt-upgrade-${process.pid}`
const tmux = (...args) => execFileSync("tmux", ["-L", socket, ...args], { cwd: work, encoding: "utf8" }).trim()
const snapshots = async(dir) => {
  const files = (await readdir(dir, { recursive: true, withFileTypes: true })).filter((entry) => entry.isFile())
  return Object.fromEntries(await Promise.all(files.map(async(entry) => {
    const path = join(entry.parentPath, entry.name)
    return [path.slice(dir.length + 1), createHash("sha256").update(await readFile(path)).digest("hex")]
  })))
}
try {
  for (const session of ["FIRST", "SECOND"]) {
    tmux("-f", "/dev/null", "new-session", "-d", "-s", session, "-n", "A", "sh")
    tmux("new-window", "-t", session, "-n", "B", "sh")
  }
  const env = { ...process.env, TTT_HOME: home, TMUX: `${tmux("display-message", "-p", "#{socket_path}")},0,0` }
  delete env.TMUX_PANE
  const cli = (bin, session, from, ...args) => execFileSync(runtime, [bin, "--session", session, "--from", from, ...args], { cwd: work, env, encoding: "utf8" }).trim()
  const fixtures = []
  for (const session of ["FIRST", "SECOND"]) {
    const send = (...args) => {
      const out = cli(old, session, "A", "send", "B", "--urgent", ...args)
      const id = /\b(ttt-\S+) -> B/.exec(out)?.[1]
      assert.ok(id, out)
      return id
    }
    const acked = send("--subject", "Upgrade probe", "--", `preserved body ${session}`)
    assert.match(cli(old, session, "B", "read"), new RegExp(`preserved body ${session}`))
    cli(old, session, "B", "ack", acked, "--", "receipt note survives")
    cli(old, session, "B", "reply", acked, "--urgent", "--", "reply survives")
    cli(old, session, "A", "read")
    const read = send("--no-reply", "--", "read receipt")
    cli(old, session, "B", "read")
    const unread = send("--no-reply", "--", "unread receipt")
    cli(old, session, "A", "migrate")
    await writeFile(join(boards, session, "state/panes.json"), "{}\n")
    const status = [acked, read, unread].map((id) => cli(old, session, "A", "status", id))
    assert.match(status[0], /^B: acked .*receipt note survives/m)
    assert.match(status[1], /^B: read /m)
    assert.match(status[2], /^B: unread /m)
    fixtures.push({ session, ids: [acked, read, unread], status })
  }
  const homeBefore = await snapshots(home)
  const before = await snapshots(boards)
  await cp(home, join(work, "backup-home"), { recursive: true })
  await cp(boards, join(work, "backup-boards"), { recursive: true })
  assert.equal((cli(candidate, "FIRST", "A", "migrate", "--dry-run", "--all").match(/v6 -> v7/g) ?? []).length, 2)
  assert.deepEqual(await snapshots(home), homeBefore, "dry-run keeps settings/session records byte-identical")
  assert.deepEqual(await snapshots(boards), before, "dry-run keeps every board byte-identical")
  assert.equal((cli(candidate, "FIRST", "A", "migrate", "--all").match(/v6 -> v7/g) ?? []).length, 2)
  const migrated = await snapshots(boards)
  const history = (files) => Object.fromEntries(Object.entries(files).filter(([path]) => !/\/state\/(?:schema|panes)\.json$/.test(path)))
  assert.deepEqual(history(migrated), history(before), "migration preserves messages, receipts, and indexes")
  for (const { session, ids, status } of fixtures) {
    assert.equal(JSON.parse(await readFile(join(boards, session, "state/schema.json"), "utf8")).version, 7)
    assert.ok(!Object.hasOwn(migrated, `${session}/state/panes.json`))
    assert.deepEqual(ids.map((id) => cli(candidate, session, "A", "status", id)), status)
    const thread = cli(candidate, session, "A", "thread", ids[0])
    assert.match(thread, new RegExp(`preserved body ${session}`))
    assert.match(thread, /reply survives/)
    const pane = tmux("display-message", "-p", "-t", `${session}:A`, "#{pane_id}")
    const identity = execFileSync(runtime, [candidate, "whoami"], { env: { ...env, TMUX_PANE: pane }, encoding: "utf8" })
    assert.match(identity, /^name: A$/m)
    assert.equal(tmux("display-message", "-p", "-t", pane, "#{@ttt_agent}"), "A")
  }
  const settled = await snapshots(boards)
  assert.equal((cli(candidate, "FIRST", "A", "migrate", "--all").match(/already v7/g) ?? []).length, 2)
  assert.deepEqual(await snapshots(boards), settled, "second migration is byte-identical")
  // Restore only disposable fixture data, including the external boardRoot, before running the old writer.
  await rm(home, { recursive: true })
  await rm(boards, { recursive: true })
  await cp(join(work, "backup-home"), home, { recursive: true })
  await cp(join(work, "backup-boards"), boards, { recursive: true })
  assert.deepEqual(await snapshots(home), homeBefore)
  assert.deepEqual(await snapshots(boards), before)
  for (const { session, ids, status } of fixtures) {
    assert.deepEqual(ids.map((id) => cli(old, session, "A", "status", id)), status)
    assert.match(cli(old, session, "A", "thread", ids[0]), /reply survives/)
    cli(old, session, "A", "send", "B", "--urgent", "--no-reply", "--", "rollback writer works")
    assert.match(cli(old, session, "B", "read"), /rollback writer works/)
  }
  await writeFile(join(work, "result.json"), JSON.stringify({ previous: metadata.version, sha1: metadata.dist.shasum, runtime: execFileSync(runtime, ["--version"], { encoding: "utf8" }).trim(), candidate, sessions: fixtures.map(({ session }) => session), passed: true }, null, 2) + "\n")
  process.stdout.write(`Upgrade, receipt preservation, re-seating, and backup rollback passed: ${work}\n`)
} finally {
  try { tmux("kill-server") } catch { /* This fixture owns only its private server. */ }
}
