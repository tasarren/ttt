# TTT UI library

`@ttt/ui` is one private Vue component package for the upcoming ttt webapp. It exports 55 presentation components, scoped CSS, and contract types/helpers used by the layout and settings editors. Histoire has component variants and ten page previews built from sample records. It does not read a live board or run tmux.

From the repository root:

```sh
pnpm install
pnpm --filter @ttt/ui stories
pnpm run check
```

Use components from `@ttt/ui`, types and pure data helpers from `@ttt/ui`, and CSS from `@ttt/ui/styles.css`. Wrap standalone components in `.ttt`; `AppShell` supplies that scope. Vue is a peer dependency. [Component API](docs/COMPONENT_API.md) lists props and events; [style guide](docs/STYLE_GUIDE.md) records the visual rules.

`pnpm run check` covers typechecking, tests, library build, and Histoire build. Stories use `fixtures/snapshot.json` only; the Webapp will own routing, live data, persistence, and tmux actions. The JSON Schema source is [ttt-system.schema.json](../../docs/ttt-system.schema.json). Run `pnpm --filter @ttt/ui generate` after changing that schema.
