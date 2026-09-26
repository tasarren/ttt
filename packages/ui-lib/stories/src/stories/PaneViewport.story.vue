<script setup lang="ts">
import { Showcase } from "../Showcase"
</script>

<template>
  <Story title="03 Organisms/PaneViewport" :layout="{ type: 'single', iframe: true }">
    <Variant title="Default"><Showcase name="PaneViewport" /></Variant>
    <Variant title="Compact"><Showcase name="PaneViewport" variant="compact" /></Variant>
    <Variant title="Edge state"><Showcase name="PaneViewport" variant="edge" /></Variant>
  </Story>
</template>
