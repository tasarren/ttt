<script setup lang="ts">
import { Showcase } from "../Showcase"
</script>

<template>
  <Story title="03 Organisms/PaneTable" :layout="{ type: 'single', iframe: true }">
    <Variant title="Default"><Showcase name="PaneTable" /></Variant>
    <Variant title="Compact"><Showcase name="PaneTable" variant="compact" /></Variant>
    <Variant title="Edge state"><Showcase name="PaneTable" variant="edge" /></Variant>
  </Story>
</template>
