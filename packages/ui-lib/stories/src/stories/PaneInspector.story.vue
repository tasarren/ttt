<script setup lang="ts">
import { Showcase } from "../Showcase"
</script>

<template>
  <Story title="03 Organisms/PaneInspector" :layout="{ type: 'single', iframe: true }">
    <Variant title="Default"><Showcase name="PaneInspector" /></Variant>
    <Variant title="Compact"><Showcase name="PaneInspector" variant="compact" /></Variant>
    <Variant title="Edge state"><Showcase name="PaneInspector" variant="edge" /></Variant>
  </Story>
</template>
