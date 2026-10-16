<script setup lang="ts">
import { TSurface, TBadge, TButton, TInput } from "@ttt/ui"
const colors = { canvas: "#1A1219", panel: "#211922", raised: "#2B2230", border: "#493A4F", mint: "#67E8B1", sage: "#A6DA95", pink: "#F38CBE", lavender: "#CBA6F7", amber: "#EFC86F", coral: "#FF857F" }
</script>
<template>
  <Story title="00 Foundations/Tokens and type" :layout="{ type: 'single', iframe: true }">
    <div class="ttt t-story stack">
      <h1>TTT · Foundations</h1>
      <div class="t-token-grid">
        <TSurface v-for="(hex, name) in colors" :key="name" :title="name">
          <div :style="{ background: hex, height: '70px', borderRadius: '5px', marginBottom: '12px', border: '1px solid #493A4F' }" />
          <code class="mono small">{{ hex }}</code>
        </TSurface>
      </div>
      <TSurface title="Typography"><div class="stack"><h1>Read the conversation.</h1><h2>Window and pane details</h2><p>Proportional text for reading; monospace for paths, identifiers and commands.</p><code class="mono">alpha / main / %0</code><p class="small muted">28/36 page · 20/28 section · 16/24 body · 14/22 UI · 12/18 metadata</p></div></TSurface>
      <TSurface title="Geometry"><div class="row wrap"><TBadge tone="mint">4px spacing rhythm</TBadge><TBadge>4 / 6 / 8px radii</TBadge><TButton>Visible focus</TButton><TButton disabled>Disabled</TButton></div></TSurface>
    </div>
  </Story>
</template>
