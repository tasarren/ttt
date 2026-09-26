<script setup lang="ts">
import { Showcase } from "../Showcase"
</script>

<template>
  <Story title="03 Organisms/LayoutEditor" :layout="{ type: 'single', iframe: true }">
    <Variant title="Default"><Showcase name="LayoutEditor" /></Variant>
    <Variant title="Compact"><Showcase name="LayoutEditor" variant="compact" /></Variant>
    <Variant title="Edge state"><Showcase name="LayoutEditor" variant="edge" /></Variant>
  </Story>
</template>
