<script setup lang="ts">
import { Showcase } from "../Showcase"
</script>

<template>
  <Story title="02 Molecules/TEntityTree" :layout="{ type: 'single', iframe: true }">
    <Variant title="Default"><Showcase name="TEntityTree" /></Variant>
    <Variant title="Compact"><Showcase name="TEntityTree" variant="compact" /></Variant>
    <Variant title="Edge state"><Showcase name="TEntityTree" variant="edge" /></Variant>
  </Story>
</template>
