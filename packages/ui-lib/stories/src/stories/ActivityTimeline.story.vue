<script setup lang="ts">
import { Showcase } from "../Showcase"
</script>

<template>
  <Story title="03 Organisms/ActivityTimeline" :layout="{ type: 'single', iframe: true }">
    <Variant title="Default"><Showcase name="ActivityTimeline" /></Variant>
    <Variant title="Compact"><Showcase name="ActivityTimeline" variant="compact" /></Variant>
    <Variant title="Edge state"><Showcase name="ActivityTimeline" variant="edge" /></Variant>
  </Story>
</template>
