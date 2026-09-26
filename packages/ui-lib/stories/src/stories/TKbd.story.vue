<script setup lang="ts">
import { Showcase } from "../Showcase"
</script>

<template>
  <Story title="01 Atoms/TKbd" :layout="{ type: 'single', iframe: true }">
    <Variant title="Default"><Showcase name="TKbd" /></Variant>
    <Variant title="Compact"><Showcase name="TKbd" variant="compact" /></Variant>
    <Variant title="Edge state"><Showcase name="TKbd" variant="edge" /></Variant>
  </Story>
</template>
