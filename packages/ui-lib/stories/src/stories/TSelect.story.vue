<script setup lang="ts">
import { Showcase } from "../Showcase"
</script>

<template>
  <Story title="01 Atoms/TSelect" :layout="{ type: 'single', iframe: true }">
    <Variant title="Default"><Showcase name="TSelect" /></Variant>
    <Variant title="Compact"><Showcase name="TSelect" variant="compact" /></Variant>
    <Variant title="Edge state"><Showcase name="TSelect" variant="edge" /></Variant>
  </Story>
</template>
