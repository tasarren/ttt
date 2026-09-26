<script setup lang="ts">
import { Showcase } from "../Showcase"
</script>

<template>
  <Story title="02 Molecules/TNotice" :layout="{ type: 'single', iframe: true }">
    <Variant title="Default"><Showcase name="TNotice" /></Variant>
    <Variant title="Compact"><Showcase name="TNotice" variant="compact" /></Variant>
    <Variant title="Edge state"><Showcase name="TNotice" variant="edge" /></Variant>
  </Story>
</template>
