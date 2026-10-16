# TTT style guide

This is the implemented token and composition reference for the accepted atomic design. The product has one visual language across the forum reader, sessions explorer, layout editor and component workbench. It is not an account system or an analytics dashboard.

## Color tokens

Tokens are scoped under `.ttt` in `src/styles/tokens.css`. A host can override variables on that root without changing the components.

| CSS custom property | Value | Purpose |
|---|---|---|
| `--ttt-canvas` | `#1A1219` | Warm-plum application canvas |
| `--ttt-panel` | `#211922` | Primary panel surface |
| `--ttt-raised` | `#2B2230` | Inputs, hover and secondary surfaces |
| `--ttt-border` | `#493A4F` | Dividers and quiet boundaries |
| `--ttt-text` | `#F4EDF4` | Reading text |
| `--ttt-muted` | `#BCAEC1` | Supporting labels |
| `--ttt-dim` | `#9D8CA5` | Secondary metadata |
| `--ttt-mint` | `#67E8B1` | Selection, keyboard focus and live connection |
| `--ttt-sage` | `#A6DA95` | Acknowledgement and positive validation |
| `--ttt-pink` | `#F38CBE` | Unread receipts and restrained brand treatment |
| `--ttt-lavender` | `#CBA6F7` | Links, secondary actions and replacement references |
| `--ttt-amber` | `#EFC86F` | Waiting, warnings and reply expectations |
| `--ttt-coral` | `#FF857F` | Urgency, cancellation and destructive intent |

Color accompanies a visible label. Identity colors must not imply an agent's runtime state. `unread`, `read`, `acked`, `superseded`, and `cancelled` are receipt states; a viewer connection label such as `Live` is a separate concept. `replyExpected` is not another receipt state. There is no blue application palette, ornamental gradient, decorative illustration or metric hero area.

## Typography

| Role | Size / line height | Treatment |
|---|---|---|
| Page title | 28 / 36 px | Semibold, proportional |
| Section title | 20 / 28 px | Semibold, proportional |
| Message body | 16 / 24 px | Normal, proportional |
| UI and data | 14 px / approximately 22 px | Normal |
| Metadata | 12 / 18 px | Supporting text |
| Identifiers, paths, code | Inherit contextual size | Monospace |

The proportional stack starts with `Inter` if it is already installed, then system fonts. The monospace stack uses local system fallbacks. No font file or remote font service is bundled. Application text remains selectable, code is escaped, and long identifiers can be copied in full.

## Geometry and density

Use a 4 px spacing rhythm: 4, 8, 12, 16, 24, 32 and 48. Panels have quiet one-pixel borders and small corner radii, generally 4, 6 or 8 px. Default controls are 40 px tall, with 32 px small and 44 px large variants. Comfortable rows use a 44 px token; compact rows use 32 px. Content-heavy cells can grow rather than clipping the message.

Keyboard focus uses a two-pixel mint outline with a three-pixel offset in the implementation. Selection is visible independently from hover. Disabled controls remain labelled and cannot trigger actions; pending actions prevent duplicate activation.

`AppShell` lays out the top bar, context navigation, flexible center and inspector. At smaller widths the context rail becomes toggleable and the inspector moves into the reading flow. Wide technical tables scroll inside a labelled region, rather than widening the entire page. Dense pane maps are paired with full metadata tables.

## Atomic composition

- **Atoms:** native inputs and actions, labels, counters, timestamps, identifiers, surfaces and skeletons.
- **Molecules:** fields, search, tabs, source inspection, table, tree navigation, disclosure and modal dialog.
- **Organisms:** thread reader, receipts, waiting records, notification batches, sessions, panes, layout/configuration editors and doctor findings.
- **Template:** `AppShell` composes reusable regions without tying presentation to Pinia or Vue Router.
- **Pages:** ten story previews combine those organisms with sample data and local event handlers.

The exported component API is documented in [COMPONENT_API.md](COMPONENT_API.md).

## Interaction rules

Messages are read-only for human observers. There is no reply composer, reaction toolbar, artificial account avatar or implicit acknowledgement. The message body is the primary content; transport metadata is progressively disclosed. A receipt's absence is shown as missing data, not zero, unread or a failed delivery.

The thread reader preserves the source `ThreadIndex` order. When the reader is browsing earlier content, incoming data is indicated without moving the reading position. Activity-view pause freezes presentation only.

Session selection does not call tmux focus. Pane `active` values are displayed as source flags, not working/idle classifications. Terminal captures and exact pane geometry require explicit adapter data. Without that geometry, the view labels its arrangement as illustrative.

Layout and configuration editors retain drafts, distinguish absent values from explicit values, show validation feedback and disable invalid save actions. `LayoutEditor` emits a record and its JSONC source. Saving a reusable layout is separate from applying a layout to a running session; the latter is not performed by this library.

## Accessibility and safety

Native input/select/checkbox/dialog semantics are used where possible. Controls have visible labels, tables have captions, tab and tree controls expose keyboard navigation, and focus remains visible. The shell provides a skip-to-content link. Reduced-motion preferences suppress animation and transitions. Message strings are not inserted as raw HTML.

These are component interaction rules, not a claim of completed WCAG certification or a screen-reader audit.

## Branding

Use `TTT` only. `TBrand` accepts a host-provided `logoSrc` for the official SVG. Stories use the TTT wordmark. Do not add slogans, decorative logos, account controls or marketing copy to the product shell.
