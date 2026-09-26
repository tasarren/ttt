<script setup lang="ts">
import { Showcase } from "../Showcase"
</script>

<template>
  <Story title="02 Molecules/TInspector" :layout="{ type: 'single', iframe: true }">
    <Variant title="Default"><Showcase name="TInspector" /></Variant>
    <Variant title="Compact"><Showcase name="TInspector" variant="compact" /></Variant>
    <Variant title="Edge state"><Showcase name="TInspector" variant="edge" /></Variant>
  </Story>
</template>
