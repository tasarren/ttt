import { cloneData } from "./clone.ts"
/** UI geometry model. It serializes into LayoutWindow.layout, never into extra contract fields. */
export interface LayoutNode {
  width: number
  height: number
  x: number
  y: number
  pane?: number
  direction?: "horizontal" | "vertical"
  children?: LayoutNode[]
}
export type Direction = "horizontal" | "vertical"
export function checksum(text: string): string {
  let sum = 0
  for (const c of text)
    sum = (((sum >> 1) | ((sum & 1) << 15)) + c.charCodeAt(0)) & 0xffff
  return sum.toString(16).padStart(4, "0")
}
export function leafCount(node: LayoutNode): number {
  return node.children ? node.children.reduce((n, c) => n + leafCount(c), 0) : 1
}
export function leaves(node: LayoutNode): LayoutNode[] {
  return node.children ? node.children.flatMap(leaves) : [
    node,
  ]
}
export function serializeLayout(tree: LayoutNode): string {
  const body = (node: LayoutNode): string => `${node.width}x${node.height},${node.x},${node.y}` + (node.children ? `${node.direction === "horizontal" ? "{" : "["}${node.children.map(body).join(",")}${node.direction === "horizontal" ? "}" : "]"}` : `,${node.pane ?? 0}`)
  const value = body(tree)
  return `${checksum(value)},${value}`
}
export function parseLayout(text: string): LayoutNode {
  if (text.length > 100000)
    throw new Error("Layout exceeds 100 KB")
  if (!/^[a-f0-9]{4},/i.test(text) || checksum(text.slice(5)) !== text.slice(0, 4).toLowerCase())
    throw new Error("Invalid layout checksum")
  let at = 5
  function number() {
    const match = /^\d+/.exec(text.slice(at))
    if (!match)
      throw new Error(`Expected number at ${at}`)
    at += match[0].length
    const value = Number(match[0])
    if (!Number.isSafeInteger(value) || value > 100000)
      throw new Error("Layout number out of range")
    return value
  }
  function take(c: string) {
    if (text[at++] !== c)
      throw new Error(`Expected ${c} at ${at - 1}`)
  }
  function node(depth: number): LayoutNode {
    if (depth > 32)
      throw new Error("Layout nesting exceeds 32")
    const width = number()
    take("x")
    const height = number()
    take(",")
    const x = number()
    take(",")
    const y = number()
    if (width < 2 || height < 2)
      throw new Error("Pane dimensions must be at least 2")
    const result: LayoutNode = {
      width, height, x, y,
    }
    if (text[at] === "{" || text[at] === "[") {
      const horizontal = text[at++] === "{"
      const close = horizontal ? "}" : "]"
      result.direction = horizontal ? "horizontal" : "vertical"
      result.children = []
      for (;;) {
        result.children.push(node(depth + 1))
        if (text[at] === close) {
          at++
          break
        }
        take(",")
      }
      if (result.children.length < 2)
        throw new Error("Split needs two children")
      const dim = horizontal ? "width" : "height"
      const other = horizontal ? "height" : "width"
      const pos = horizontal ? "x" : "y"
      const otherPos = horizontal ? "y" : "x"
      let cursor = result[pos]
      for (const child of result.children) {
        if (child[pos] !== cursor || child[otherPos] !== result[otherPos] || child[other] !== result[other])
          throw new Error("Invalid child geometry")
        cursor += child[dim] + 1
      }
      if (cursor - 1 !== result[pos] + result[dim])
        throw new Error("Split dimensions do not match parent")
    }
    else {
      take(",")
      result.pane = number()
    }
    return result
  }
  const result = node(0)
  if (at !== text.length)
    throw new Error("Unexpected layout suffix")
  const ids = leaves(result).map(l => l.pane)
  if (new Set(ids).size !== ids.length)
    throw new Error("Duplicate pane IDs")
  return result
}
function place(node: LayoutNode, width: number, height: number, x: number, y: number): void {
  if (width < 2 || height < 2)
    throw new Error("Not enough space for this split")
  const old = node.children?.map(c => node.direction === "horizontal" ? c.width : c.height)
  Object.assign(node, {
    width, height, x, y,
  })
  if (!node.children || !old)
    return
  const horizontal = node.direction === "horizontal"
  const total = (horizontal ? width : height) - node.children.length + 1
  const weight = old.reduce((a, b) => a + b, 0)
  let used = 0
  node.children.forEach((c, i, all) => {
    const size = i === all.length - 1 ? total - used : Math.max(2, Math.min(total - used - 2 * (all.length - i - 1), Math.round(total * old[i]! / weight)))
    place(c, horizontal ? size : width, horizontal ? height : size, horizontal ? x + used + i : x, horizontal ? y : y + used + i)
    used += size
  })
}
export function makeLayout(count: number, width = 160, height = 48): LayoutNode {
  if (!Number.isInteger(count) || count < 1 || count > 24)
    throw new Error("Choose 1–24 panes")
  let tree: LayoutNode = {
    width, height, x: 0, y: 0, pane: 0,
  }
  for (let i = 1; i < count; i++) {
    const largest = leaves(tree).sort((a, b) => b.width * b.height - a.width * a.height)[0]!
    tree = splitPane(tree, largest.pane!, largest.width / largest.height > 3 ? "horizontal" : "vertical")
  }
  return tree
}
export function splitPane(input: LayoutNode, pane: number, direction: Direction): LayoutNode {
  const tree: LayoutNode = cloneData(input)
  const target = leaves(tree).find(l => l.pane === pane)
  if (!target)
    throw new Error("Pane not found")
  const next = Math.max(...leaves(tree).map(l => l.pane!)) + 1
  const child = {
    ...target,
  }
  delete target.pane
  target.direction = direction
  target.children = [
    child, {
      ...child, pane: next,
    },
  ]
  place(target, target.width, target.height, target.x, target.y)
  return tree
}
export function removePane(input: LayoutNode, pane: number): LayoutNode {
  if (leafCount(input) === 1)
    throw new Error("Cannot remove the last pane")
  if (!leaves(input).some(l => l.pane === pane))
    throw new Error("Pane not found")
  function prune(node: LayoutNode): LayoutNode | null {
    if (!node.children)
      return node.pane === pane ? null : {
        ...node,
      }
    const children = node.children.map(prune).filter((x): x is LayoutNode => x !== null)
    if (children.length === 1) {
      place(children[0]!, node.width, node.height, node.x, node.y)
      return children[0]!
    }
    const result = {
      ...node, children,
    }
    place(result, node.width, node.height, node.x, node.y)
    return result
  }
  const tree = prune(cloneData(input))!
  return tree
}
export function renumberLayout(input: LayoutNode): LayoutNode {
  const tree: LayoutNode = cloneData(input)
  leaves(tree).forEach((l, i) => {
    l.pane = i
  })
  return tree
}
export function resizeSplit(input: LayoutNode, path: number[], ratio: number, boundary = 0): LayoutNode {
  if (!Number.isFinite(ratio))
    throw new Error("Invalid split ratio")
  const tree: LayoutNode = cloneData(input)
  let node = tree
  for (const i of path) {
    if (!node.children?.[i])
      throw new Error("Split path not found")
    node = node.children[i]!
  }
  if (!node.children || !Number.isInteger(boundary) || boundary < 0 || boundary >= node.children.length - 1) {
    throw new Error("Split boundary not found")
  }
  const horizontal = node.direction === "horizontal"
  const dim = horizontal ? "width" : "height"
  const first = node.children[boundary]!
  const second = node.children[boundary + 1]!
  const total = first[dim] + second[dim]
  const size = Math.max(2, Math.min(total - 2, Math.round(total * Math.min(0.9, Math.max(0.1, ratio)))))
  const x = first.x
  const y = first.y
  place(first, horizontal ? size : node.width, horizontal ? node.height : size, x, y)
  place(second, horizontal ? total - size : node.width, horizontal ? node.height : total - size, horizontal ? x + size + 1 : x, horizontal ? y : y + size + 1)
  return tree
}
