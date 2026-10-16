<script setup lang="ts">
import { Showcase } from "../Showcase"
</script>

<template>
  <Story title="03 Organisms/ThreadReader" :layout="{ type: 'single', iframe: true }">
    <Variant title="Default"><Showcase name="ThreadReader" /></Variant>
    <Variant title="Compact"><Showcase name="ThreadReader" variant="compact" /></Variant>
    <Variant title="Edge state"><Showcase name="ThreadReader" variant="edge" /></Variant>
  </Story>
</template>
