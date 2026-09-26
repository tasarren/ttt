<script setup lang="ts">
import { Showcase } from "../Showcase"
</script>

<template>
  <Story title="01 Atoms/TSkeleton" :layout="{ type: 'single', iframe: true }">
    <Variant title="Default"><Showcase name="TSkeleton" /></Variant>
    <Variant title="Compact"><Showcase name="TSkeleton" variant="compact" /></Variant>
    <Variant title="Edge state"><Showcase name="TSkeleton" variant="edge" /></Variant>
  </Story>
</template>
