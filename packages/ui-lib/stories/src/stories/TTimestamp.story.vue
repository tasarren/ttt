<script setup lang="ts">
import { Showcase } from "../Showcase"
</script>

<template>
  <Story title="01 Atoms/TTimestamp" :layout="{ type: 'single', iframe: true }">
    <Variant title="Default"><Showcase name="TTimestamp" /></Variant>
    <Variant title="Compact"><Showcase name="TTimestamp" variant="compact" /></Variant>
    <Variant title="Edge state"><Showcase name="TTimestamp" variant="edge" /></Variant>
  </Story>
</template>
