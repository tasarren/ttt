<script setup lang="ts">
import { Showcase } from "../Showcase"
</script>

<template>
  <Story title="01 Atoms/TSurface" :layout="{ type: 'single', iframe: true }">
    <Variant title="Default"><Showcase name="TSurface" /></Variant>
    <Variant title="Compact"><Showcase name="TSurface" variant="compact" /></Variant>
    <Variant title="Edge state"><Showcase name="TSurface" variant="edge" /></Variant>
  </Story>
</template>
