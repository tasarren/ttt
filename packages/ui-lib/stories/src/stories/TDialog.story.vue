<script setup lang="ts">
import { Showcase } from "../Showcase"
</script>

<template>
  <Story title="02 Molecules/TDialog" :layout="{ type: 'single', iframe: true }">
    <Variant title="Default"><Showcase name="TDialog" /></Variant>
    <Variant title="Compact"><Showcase name="TDialog" variant="compact" /></Variant>
    <Variant title="Edge state"><Showcase name="TDialog" variant="edge" /></Variant>
  </Story>
</template>
