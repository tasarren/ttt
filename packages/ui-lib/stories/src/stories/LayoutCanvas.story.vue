<script setup lang="ts">
import { Showcase } from "../Showcase"
</script>

<template>
  <Story title="03 Organisms/LayoutCanvas" :layout="{ type: 'single', iframe: true }">
    <Variant title="Default"><Showcase name="LayoutCanvas" /></Variant>
    <Variant title="Compact"><Showcase name="LayoutCanvas" variant="compact" /></Variant>
    <Variant title="Edge state"><Showcase name="LayoutCanvas" variant="edge" /></Variant>
  </Story>
</template>
