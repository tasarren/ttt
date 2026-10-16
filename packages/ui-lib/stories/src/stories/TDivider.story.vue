<script setup lang="ts">
import { Showcase } from "../Showcase"
</script>

<template>
  <Story title="01 Atoms/TDivider" :layout="{ type: 'single', iframe: true }">
    <Variant title="Default"><Showcase name="TDivider" /></Variant>
    <Variant title="Compact"><Showcase name="TDivider" variant="compact" /></Variant>
    <Variant title="Edge state"><Showcase name="TDivider" variant="edge" /></Variant>
  </Story>
</template>
