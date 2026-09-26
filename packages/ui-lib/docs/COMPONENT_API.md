# Component API

55 public components, grouped by atomic layer. Each matching story shows default, compact and edge-case specimens.

All presentation components are named exports of `@ttt/ui`. Wrap standalone usage in `.ttt` and import `@ttt/ui/styles.css`. `AppShell` provides the scope. Native attributes/listeners fall through unless a component explicitly controls inheritance; do not assume an arbitrary component is a form input.

The `props` and `emits` blocks retain the actual runtime declarations. Imported TypeScript aliases are defined in the linked source and exported where applicable. Boolean props follow Vue boolean-prop behavior; an optional non-boolean prop remains absent unless its declaration provides a default.

## Atoms

### TBadge

Named semantic label. Receipt states, message kinds and priorities remain separate values.

[Source](../src/atoms/TBadge.ts) · [Story](../stories/src/stories/TBadge.story.vue)

**Props**

```ts
  value: String
  tone: String as PropType<Tone>
  dot: Boolean
```

**Slots:** `default`. Scoped slot arguments are visible in the source and story.

### TBrand

TTT wordmark with optional official logo asset supplied by the host.

[Source](../src/atoms/TBrand.ts) · [Story](../stories/src/stories/TBrand.story.vue)

**Props**

```ts
  logoSrc: String
```

### TButton

Native action button with intent, size, pending and disabled presentation.

[Source](../src/atoms/TButton.ts) · [Story](../stories/src/stories/TButton.story.vue)

**Props**

```ts
  intent: { type: String as PropType<"primary" | "secondary" | "ghost" | "danger">, default: "secondary" }
  size: { type: String as PropType<"sm" | "md" | "lg">, default: "md" }
  disabled: Boolean
  loading: Boolean
  type: { type: String as PropType<"button" | "submit" | "reset">, default: "button" }
```

**Slots:** `default`. Scoped slot arguments are visible in the source and story.

### TCheckbox

Native labelled checkbox for explicit choices.

[Source](../src/atoms/TCheckbox.ts) · [Story](../stories/src/stories/TCheckbox.story.vue)

**Props**

```ts
  modelValue: Boolean
  label: { type: String, required: true }
  disabled: Boolean
```

**Declared events**

```ts
{
    "update:modelValue": (_value: boolean) => true
  }
```

### TCount

Count that distinguishes a recorded zero from an absent value.

[Source](../src/atoms/TCount.ts) · [Story](../stories/src/stories/TCount.story.vue)

**Props**

```ts
  value: Number
  label: String
```

### TDivider

Subtle structural separator.

[Source](../src/atoms/TDivider.ts) · [Story](../stories/src/stories/TDivider.story.vue)

No declared props.

### TIdentifier

Full-value identifier with optional navigation and clipboard action.

[Source](../src/atoms/TIdentifier.ts) · [Story](../stories/src/stories/TIdentifier.story.vue)

**Props**

```ts
  value: String as PropType<string | undefined>
  short: Boolean
  copy: { type: Boolean, default: true }
```

### TInput

Native input exposing a controlled value and native attributes.

[Source](../src/atoms/TInput.ts) · [Story](../stories/src/stories/TInput.story.vue)

**Props**

```ts
  modelValue: { type: [ String, Number ], default: "" }
  type: { type: String, default: "text" }
```

**Declared events**

```ts
{
    "update:modelValue": (_value: string) => true
  }
```

### TKbd

Keyboard shortcut label.

[Source](../src/atoms/TKbd.ts) · [Story](../stories/src/stories/TKbd.story.vue)

No declared props.

**Slots:** `default`. Scoped slot arguments are visible in the source and story.

### TSelect

Native single-select with explicit labelled options.

[Source](../src/atoms/TSelect.ts) · [Story](../stories/src/stories/TSelect.story.vue)

**Props**

```ts
  modelValue: String
  options: { type: Array as PropType<readonly SelectOption[]>, default: () => [] }
```

**Declared events**

```ts
{
    "update:modelValue": (_value: string) => true
  }
```

### TSkeleton

Loading placeholder with reduced-motion handling.

[Source](../src/atoms/TSkeleton.ts) · [Story](../stories/src/stories/TSkeleton.story.vue)

**Props**

```ts
  lines: { type: Number, default: 3 }
```

### TSurface

Quiet panel wrapper with title, actions and content slots.

[Source](../src/atoms/TSurface.ts) · [Story](../stories/src/stories/TSurface.story.vue)

**Props**

```ts
  title: String
  padded: { type: Boolean, default: true }
```

**Slots:** `header`, `actions`, `default`. Scoped slot arguments are visible in the source and story.

### TSwitch

Keyboard-operable boolean switch with an accessible label.

[Source](../src/atoms/TSwitch.ts) · [Story](../stories/src/stories/TSwitch.story.vue)

**Props**

```ts
  modelValue: Boolean
  label: { type: String, required: true }
  disabled: Boolean
```

**Declared events**

```ts
{
    "update:modelValue": (_value: boolean) => true
  }
```

### TTextarea

Controlled native multiline text input.

[Source](../src/atoms/TTextarea.ts) · [Story](../stories/src/stories/TTextarea.story.vue)

**Props**

```ts
  modelValue: { type: String, default: "" }
```

**Declared events**

```ts
{
    "update:modelValue": (_value: string) => true
  }
```

### TTimestamp

Readable timestamp retaining its exact source value.

[Source](../src/atoms/TTimestamp.ts) · [Story](../stories/src/stories/TTimestamp.story.vue)

**Props**

```ts
  value: String as PropType<string | undefined>
  full: Boolean
```

## Molecules

### TBreadcrumb

Context path, with navigation delegated to the host.

[Source](../src/molecules/TBreadcrumb.ts) · [Story](../stories/src/stories/TBreadcrumb.story.vue)

**Props**

```ts
  items: { type: Array as PropType<readonly Crumb[]>, required: true }
```

### TCodeBlock

Escaped source text and explicit clipboard action; no code execution.

[Source](../src/molecules/TCodeBlock.ts) · [Story](../stories/src/stories/TCodeBlock.story.vue)

**Props**

```ts
  code: { type: String, required: true }
  language: { type: String, default: "text" }
```

### TContextMenu

Secondary action disclosure with keyboard navigation.

[Source](../src/molecules/TContextMenu.ts) · [Story](../stories/src/stories/TContextMenu.story.vue)

**Props**

```ts
  items: { type: Array as PropType<readonly MenuItem[]>, required: true }
  label: { type: String, default: "More" }
```

**Declared events**

```ts
{
    select: (_id: string) => true
  }
```

### TDataTable

Captioned table with configurable columns and a cell-rendering slot.

[Source](../src/molecules/TDataTable.ts) · [Story](../stories/src/stories/TDataTable.story.vue)

**Props**

```ts
  columns: { type: Array as PropType<readonly TableColumn[]>, required: true }
  rows: { type: Array as PropType<readonly Record<string, unknown>[]>, required: true }
  caption: { type: String, required: true }
  selected: [ String, Number ]
  rowKey: { type: String, default: "id" }
```

**Slots:** `cell`. Scoped slot arguments are visible in the source and story.

### TDialog

Native modal dialog, labelled title and scoped teleported content.

[Source](../src/molecules/TDialog.ts) · [Story](../stories/src/stories/TDialog.story.vue)

**Props**

```ts
  modelValue: Boolean
  title: { type: String, required: true }
```

**Declared events**

```ts
{
    "update:modelValue": (_v: boolean) => true
  }
```

**Slots:** `default`. Scoped slot arguments are visible in the source and story.

### TDisclosure

Progressive disclosure for optional details.

[Source](../src/molecules/TDisclosure.ts) · [Story](../stories/src/stories/TDisclosure.story.vue)

**Props**

```ts
  title: { type: String, required: true }
  open: Boolean
```

**Slots:** `default`. Scoped slot arguments are visible in the source and story.

### TEmptyState

Concise empty, missing or unavailable content state.

[Source](../src/molecules/TEmptyState.ts) · [Story](../stories/src/stories/TEmptyState.story.vue)

**Props**

```ts
  title: { type: String, default: "Nothing to show" }
  detail: String
```

**Slots:** `default`. Scoped slot arguments are visible in the source and story.

### TEntityTree

Hierarchical context navigator with local selection and keyboard controls.

[Source](../src/molecules/TEntityTree.ts) · [Story](../stories/src/stories/TEntityTree.story.vue)

**Props**

```ts
  nodes: { type: Array as PropType<readonly EntityNode[]>, required: true }
  // EntityNode may carry a small ID badge and a message-count label beside its human name.
  selected: String as PropType<string | undefined>
  contextIds: { type: Array as PropType<readonly string[]>, default: () => [] }
  label: { type: String, default: "Items" }
```

**Declared events**

```ts
{
    select: (_id: string) => true
  }
```

### TField

Visible label, supporting text and validation error around a control.

[Source](../src/molecules/TField.ts) · [Story](../stories/src/stories/TField.story.vue)

**Props**

```ts
  label: { type: String, required: true }
  id: String
  error: String as PropType<string | undefined>
  hint: String
```

**Slots:** `default`. Scoped slot arguments are visible in the source and story.

### TInspector

Inspectable record fields that retain absence, null, zero and false.

[Source](../src/molecules/TInspector.ts) · [Story](../stories/src/stories/TInspector.story.vue)

**Props**

```ts
  items: { type: Array as PropType<readonly InspectorItem[]>, required: true }
```

**Slots:** `value`. Scoped slot arguments are visible in the source and story.

### TLiveStatus

Viewer connection state, not agent presence or a receipt state.

[Source](../src/molecules/TLiveStatus.ts) · [Story](../stories/src/stories/TLiveStatus.story.vue)

**Props**

```ts
  state: { type: String as PropType<ConnectionState>, default: "live" }
```

### TNotice

Inline feedback with a named tone and readable text.

[Source](../src/molecules/TNotice.ts) · [Story](../stories/src/stories/TNotice.story.vue)

**Props**

```ts
  tone: { type: String as PropType<Tone>, default: "amber" }
  title: String
```

**Slots:** `default`. Scoped slot arguments are visible in the source and story.

### TPageHeader

Page title, optional context and contextual actions.

[Source](../src/molecules/TPageHeader.ts) · [Story](../stories/src/stories/TPageHeader.story.vue)

**Props**

```ts
  title: { type: String, required: true }
  subtitle: String as PropType<string | undefined>
```

**Slots:** `breadcrumb`, `actions`. Scoped slot arguments are visible in the source and story.

### TSearch

Labelled controlled search field.

[Source](../src/molecules/TSearch.ts) · [Story](../stories/src/stories/TSearch.story.vue)

**Props**

```ts
  modelValue: { type: String, default: "" }
  label: { type: String, default: "Search" }
```

**Declared events**

```ts
{
    "update:modelValue": (_value: string) => true
  }
```

### TSourceViewer

Lossless source inspection with readable formatting and copy support.

[Source](../src/molecules/TSourceViewer.ts) · [Story](../stories/src/stories/TSourceViewer.story.vue)

**Props**

```ts
  value: null
  source: String as PropType<string | undefined>
```

### TTabs

Keyboard-navigable tab selector.

[Source](../src/molecules/TTabs.ts) · [Story](../stories/src/stories/TTabs.story.vue)

**Props**

```ts
  modelValue: { type: String, required: true }
  tabs: { type: Array as PropType<readonly Tab[]>, required: true }
  label: { type: String, default: "Views" }
```

**Declared events**

```ts
{
    "update:modelValue": (_value: string) => true
  }
```

## Organisms

### ActivityTimeline

Timestamp-derived activity; not an invented durable event ledger.

[Source](../src/organisms/ActivityTimeline.ts) · [Story](../stories/src/stories/ActivityTimeline.story.vue)

**Props**

```ts
  entries: { type: Array as PropType<readonly TimelineEntry[]>, required: true }
  compact: Boolean
  detailsOpen: { type: Boolean, default: undefined }
```

**Declared events**

```ts
{
    inspect: (_id: string) => true
  }
```

### DoctorReport

Doctor findings with exact ok/warn/fail severity and optional fix disclosure.

[Source](../src/organisms/DoctorReport.ts) · [Story](../stories/src/stories/DoctorReport.story.vue)

**Props**

```ts
  findings: { type: Array as PropType<readonly DoctorFinding[]>, required: true }
```

### HarnessEditor

Name-keyed harness configuration, preserving optional fields.

[Source](../src/organisms/HarnessEditor.ts) · [Story](../stories/src/stories/HarnessEditor.story.vue)

**Props**

```ts
  modelValue: Object as PropType<Record<string, HarnessEntry> | undefined>
```

**Declared events**

```ts
{
    "update:modelValue": (_v: Record<string, HarnessEntry> | undefined) => true
  }
```

### LayoutCanvas

Spatial pane composition with pointer and keyboard split resizing.

[Source](../src/organisms/LayoutCanvas.ts) · [Story](../stories/src/stories/LayoutCanvas.story.vue)

**Props**

```ts
  modelValue: { type: Object as PropType<LayoutNode>, required: true }
  tiles: { type: Array as PropType<readonly PaneTile[]>, required: true }
  selected: { type: Number, default: 0 }
  editable: Boolean
```

**Declared events**

```ts
{
    "update:modelValue": (_tree: LayoutNode) => true, select: (_id: number) => true, error: (_message: string) => true
  }
```

### LayoutEditor

Visual and JSONC views of a layout; validates before emitting a saved record.

[Source](../src/organisms/LayoutEditor.ts) · [Story](../stories/src/stories/LayoutEditor.story.vue)

**Props**

```ts
  modelValue: { type: Object as PropType<LayoutFile>, required: true }
  source: String as PropType<string | undefined>
  fileName: { type: String, default: "research.jsonc" }
```

**Declared events**

```ts
{
    "update:modelValue": (_value: LayoutFile) => true, save: (_value: LayoutFile, _source: string) => true, dirty: (_dirty: boolean) => true
  }
```

### MailboxSummary

The five source receipt-state counts with optional recorded counters.

[Source](../src/organisms/MailboxSummary.ts) · [Story](../stories/src/stories/MailboxSummary.story.vue)

**Props**

```ts
  summary: { type: Object as PropType<InboxSummary>, required: true }
```

### MessageBody

Escaped message text with fenced-code rendering; intentionally not full Markdown.

[Source](../src/organisms/MessageBody.ts) · [Story](../stories/src/stories/MessageBody.story.vue)

**Props**

```ts
  body: { type: String, required: true }
```

### MessageCard

Sender, recipients, body, timestamp and contextual message metadata.

[Source](../src/organisms/MessageCard.ts) · [Story](../stories/src/stories/MessageCard.story.vue)

**Props**

```ts
  message: { type: Object as PropType<BoardMessage>, required: true }
  ordinal: Number
```

**Declared events**

```ts
{
    inspect: (_id: string) => true, parent: (_id: string) => true
  }
```

**Slots:** `receipts`. Scoped slot arguments are visible in the source and story.

### MessageInspector

Complete BoardMessage record inspection.

[Source](../src/organisms/MessageInspector.ts) · [Story](../stories/src/stories/MessageInspector.story.vue)

**Props**

```ts
  message: { type: Object as PropType<BoardMessage>, required: true }
```

### NotificationBatch

Transient batching marker and delivery callback summary, kept distinct.

[Source](../src/organisms/NotificationBatch.ts) · [Story](../stories/src/stories/NotificationBatch.story.vue)

**Props**

```ts
  marker: Object as PropType<NotificationMarker | undefined>
  summary: Object as PropType<NotificationSummary | undefined>
```

### PaneInspector

Complete TreePane record inspection, without invented process status.

[Source](../src/organisms/PaneInspector.ts) · [Story](../stories/src/stories/PaneInspector.story.vue)

**Props**

```ts
  pane: { type: Object as PropType<TreePane>, required: true }
```

### PaneTable

Live pane rows with explicit selection, agent and helper distinctions.

[Source](../src/organisms/PaneTable.ts) · [Story](../stories/src/stories/PaneTable.story.vue)

**Props**

```ts
  panes: { type: Array as PropType<readonly TreePane[]>, required: true }
  selected: String
```

**Declared events**

```ts
{
    select: (_id: string) => true
  }
```

### PaneViewport

Native-ID-matched geometry when supplied, otherwise a labelled illustrative arrangement.

[Source](../src/organisms/PaneViewport.ts) · [Story](../stories/src/stories/PaneViewport.story.vue)

**Props**

```ts
  panes: { type: Array as PropType<readonly TreePane[]>, required: true }
  selected: String
  geometry: String as PropType<string | undefined>
  captures: { type: Object as PropType<Record<string, string>>, default: () => ({}) }
```

**Declared events**

```ts
{
    select: (_id: string) => true
  }
```

### ReadResultView

Inspection of an existing ReadResult; never invokes the source mailbox read operation.

[Source](../src/organisms/ReadResultView.ts) · [Story](../stories/src/stories/ReadResultView.story.vue)

**Props**

```ts
  result: { type: Object as PropType<ReadResult>, required: true }
```

### ReceiptInspector

Complete per-recipient receipt, timestamps, replacement and actor attribution.

[Source](../src/organisms/ReceiptInspector.ts) · [Story](../stories/src/stories/ReceiptInspector.story.vue)

**Props**

```ts
  receipt: { type: Object as PropType<MessageReceipt>, required: true }
```

### ReceiptTable

Intended recipients joined to available receipts, including missing receipt records.

[Source](../src/organisms/ReceiptTable.ts) · [Story](../stories/src/stories/ReceiptTable.story.vue)

**Props**

```ts
  status: { type: Object as PropType<MessageStatus>, required: true }
```

**Declared events**

```ts
{
    inspect: (_receipt: MessageReceipt) => true
  }
```

### SchemaLedgerView

Recorded ledger version or explicit absence, with source inspection.

[Source](../src/organisms/SchemaLedgerView.ts) · [Story](../stories/src/stories/SchemaLedgerView.story.vue)

**Props**

```ts
  ledger: Object as PropType<SchemaLedger | undefined>
```

### SessionTree

TreeSession → TreeWindow → TreePane navigation; selection is not runtime focus.

[Source](../src/organisms/SessionTree.ts) · [Story](../stories/src/stories/SessionTree.story.vue)

**Props**

```ts
  sessions: { type: Array as PropType<readonly TreeSession[]>, required: true }
  selected: String
  unreadCounts: { type: Object as PropType<Readonly<Record<string, number>>>, default: () => ({}) }
```

**Declared events**

```ts
{
    select: (_id: string) => true
  }
```

### SettingsForm

Typed optional settings and JSONC editing, explicit overrides, validation and save events.

[Source](../src/organisms/SettingsForm.ts) · [Story](../stories/src/stories/SettingsForm.story.vue)

**Props**

```ts
  modelValue: { type: Object as PropType<SettingsFile>, required: true }
  source: String
  shippedHarnesses: { type: Array as PropType<readonly string[]> }
```

**Declared events**

```ts
{
    "update:modelValue": (_v: SettingsFile) => true,
    save: (_v: SettingsFile, _source: string) => true,
    dirty: (_value: boolean) => true
  }
```

### TTopBar

Consistent TTT navigation, density toggle and viewer connection state.

[Source](../src/organisms/TTopBar.ts) · [Story](../stories/src/stories/TTopBar.story.vue)

**Props**

```ts
  items: { type: Array as PropType<readonly NavItem[]>, required: true }
  active: String
  state: { type: String as PropType<ConnectionState>, default: "live" }
  logoSrc: String
```

**Declared events**

```ts
{
    navigate: (_href: string) => true
  }
```

**Slots:** `actions`. Scoped slot arguments are visible in the source and story.

### ThreadList

Root-subject thread rows built from append-ordered indexes and available messages.

[Source](../src/organisms/ThreadList.ts) · [Story](../stories/src/stories/ThreadList.story.vue)

**Props**

```ts
  messages: { type: Array as PropType<readonly BoardMessage[]>, required: true }
  threads: { type: Object as PropType<Record<string, string[]>>, required: true }
  query: { type: String, default: "" }
  urgent: Boolean
  summaryOnly: Boolean
  selected: String
```

**Declared events**

```ts
{
    select: (_id: string) => true
  }
```

### ThreadReader

Append-ordered agent conversation with parent links and non-disruptive live insertion.

[Source](../src/organisms/ThreadReader.ts) · [Story](../stories/src/stories/ThreadReader.story.vue)

**Props**

```ts
  messages: { type: Array as PropType<readonly BoardMessage[]>, required: true }
  index: { type: Array as PropType<readonly string[]>, required: true }
  pageScroll: Boolean
```

**Declared events**

```ts
{
    inspect: (_id: string) => true
  }
```

### WaitingPresence

Blocked --wait process and recorded wait streak; absence is not offline.

[Source](../src/organisms/WaitingPresence.ts) · [Story](../stories/src/stories/WaitingPresence.story.vue)

**Props**

```ts
  presence: Object as PropType<Presence | undefined>
  streak: Object as PropType<WaitStreak | undefined>
```

## Templates

### AppShell

Top bar, context navigation, reading region and toggled right details sidebar.

[Source](../src/templates/AppShell.ts) · [Story](../stories/src/stories/AppShell.story.vue)

**Props**

```ts
  compact: Boolean
```

**Slots:** `topbar`, `sidebar`, `default`, `inspector`. Scoped slot arguments are visible in the source and story.

Optional `detailsOpen` model lets pane controls open the same sidebar. `update:detailsOpen` emits
when the user toggles or closes it. Without the model, the shell keeps its own local state.

## Composition and persistence

`LayoutEditor` and `SettingsForm` keep local drafts and emit explicit save events. The host owns persistent writes and rejection handling. Story previews use sample drafts and never execute tmux actions. `TEntityTree`/`SessionTree` selection is local UI state, separate from runtime `active` flags.

Pass raw JSONC `source` to editors to preserve comments. After a successful save, update their model/source
with the persisted result; rejected saves retain the draft. `SessionTree` highlights selected session/window
ancestors. `AppShell` opens its `inspector` slot with Details and keeps it hidden until requested.

Message and receipt views expose read-only navigation and source inspection. Receipt acknowledgements are source data, never a side effect of opening the human viewer. Webapp routing and live data belong to its host.
