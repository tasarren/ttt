<script setup lang="ts">
import { Showcase } from "../Showcase"
</script>

<template>
  <Story title="02 Molecules/TSourceViewer" :layout="{ type: 'single', iframe: true }">
    <Variant title="Default"><Showcase name="TSourceViewer" /></Variant>
    <Variant title="Compact"><Showcase name="TSourceViewer" variant="compact" /></Variant>
    <Variant title="Edge state"><Showcase name="TSourceViewer" variant="edge" /></Variant>
  </Story>
</template>
