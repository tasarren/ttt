// Pack the real artifact, inspect its boundary, then reuse the CLI suites on a selected Node binary.
// Usage: pnpm run verify:packed [/absolute/path/to/node]
import assert from "node:assert/strict"
import { execFileSync } from "node:child_process"
import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises"
import { isBuiltin } from "node:module"
import { join, resolve } from "node:path"
import { fileURLToPath } from "node:url"

import ts from "typescript"

const root = fileURLToPath(new URL("../../", import.meta.url))
const runtime = process.argv[2] ? resolve(process.argv[2]) : process.execPath
const tmp = join(root, ".orchestrator/tmp")
await mkdir(tmp, { recursive: true })
const work = await mkdtemp(join(tmp, "p-"))
process.stdout.write(`Packed verification artifacts: ${work}\n`)
execFileSync("corepack", ["pnpm@11.24.0", "--filter", "@tasarren/ttt", "pack", "--pack-destination", work], { cwd: root, stdio: "inherit" })
const source = JSON.parse(await readFile(join(root, "packages/cli/package.json"), "utf8"))
const tarball = join(work, `tasarren-ttt-${source.version}.tgz`)
const files = execFileSync("tar", ["-tzf", tarball], { encoding: "utf8" }).trim().split("\n").sort()
assert.deepEqual(files, ["package/LICENSE", "package/README.md", "package/dist/ttt.mjs", "package/package.json", "package/skills/ttt/SKILL.md"].sort())
execFileSync("tar", ["-xzf", tarball, "-C", work])
const pkg = JSON.parse(await readFile(join(work, "package/package.json"), "utf8"))
assert.equal(pkg.version, source.version)
assert.deepEqual(pkg.bin, { ttt: "./dist/ttt.mjs" })
assert.deepEqual(pkg.dependencies, {})
assert.equal(pkg.engines.node, ">=24.11.0")
assert.equal(/^version: (.+)$/m.exec(await readFile(join(work, "package/skills/ttt/SKILL.md"), "utf8"))?.[1], pkg.version)
const bin = join(work, "package/dist/ttt.mjs")
const bundle = await readFile(bin, "utf8")
const ast = ts.createSourceFile(bin, bundle, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS)
function inspect(node) {
  if (ts.isImportDeclaration(node) || ts.isExportDeclaration(node) && node.moduleSpecifier) {
    assert.ok(ts.isStringLiteral(node.moduleSpecifier) && isBuiltin(node.moduleSpecifier.text), "bundle imports must be Node built-ins")
  }
  if (ts.isCallExpression(node)) {
    assert.ok(node.expression.kind !== ts.SyntaxKind.ImportKeyword && !(ts.isIdentifier(node.expression) && ["require", "createRequire"].includes(node.expression.text)), "bundle must not load runtime dependencies dynamically")
  }
  ts.forEachChild(node, inspect)
}
inspect(ast)
const regions = [...bundle.matchAll(/^\/\/#region (.+)$/gm)].map((match) => match[1])
assert.ok(regions.length > 0, "bundler module inventory missing")
assert.ok(regions.every((path) => /^(?:src\/|\.\.\/(?:board|tmux|migrations)\/src\/)/.test(path) || /\/node_modules\/jsonc-parser\/lib\/esm\//.test(path)), `unexpected bundled modules: ${regions.join(", ")}`)
await writeFile(join(work, "bundled-modules.json"), JSON.stringify(regions, null, 2) + "\n")
for (const args of [["--help"], ["create", "--help"], ["tmux", "--help"]]) {
  assert.match(execFileSync(runtime, [bin, ...args], { cwd: work, encoding: "utf8" }), /ttt/)
}
const testTmp = join(work, "t")
await mkdir(testTmp)
const tests = []
for (const name of ["e2e", "setup-paths"]) {
  const original = await readFile(join(root, `packages/cli/tests/${name}.test.ts`), "utf8")
  const entry = 'const BIN = new URL("../src/ttt.ts", import.meta.url).pathname'
  assert.equal(original.split(entry).length, 2, "suite entrypoint changed; update packed adaptation")
  const adapted = original.replace(entry, `const BIN = ${JSON.stringify(bin)}`).replace('import { tmpdir } from "node:os"', `const tmpdir = () => ${JSON.stringify(testTmp)}`)
  const file = join(work, `${name}.test.ts`)
  await writeFile(file, adapted)
  tests.push(file)
}
execFileSync(runtime, ["--test", ...tests], { cwd: work, stdio: "inherit", timeout: 300_000 })
process.stdout.write(`Packed ${pkg.name}@${pkg.version} passed on ${execFileSync(runtime, ["--version"], { encoding: "utf8" }).trim()}\n`)
