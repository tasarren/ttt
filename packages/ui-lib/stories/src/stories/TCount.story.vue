<script setup lang="ts">
import { Showcase } from "../Showcase"
</script>

<template>
  <Story title="01 Atoms/TCount" :layout="{ type: 'single', iframe: true }">
    <Variant title="Default"><Showcase name="TCount" /></Variant>
    <Variant title="Compact"><Showcase name="TCount" variant="compact" /></Variant>
    <Variant title="Edge state"><Showcase name="TCount" variant="edge" /></Variant>
  </Story>
</template>
