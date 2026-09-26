<script setup lang="ts">
import { Showcase } from "../Showcase"
</script>

<template>
  <Story title="02 Molecules/TEmptyState" :layout="{ type: 'single', iframe: true }">
    <Variant title="Default"><Showcase name="TEmptyState" /></Variant>
    <Variant title="Compact"><Showcase name="TEmptyState" variant="compact" /></Variant>
    <Variant title="Edge state"><Showcase name="TEmptyState" variant="edge" /></Variant>
  </Story>
</template>
