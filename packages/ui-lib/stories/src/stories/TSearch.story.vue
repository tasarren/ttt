<script setup lang="ts">
import { Showcase } from "../Showcase"
</script>

<template>
  <Story title="02 Molecules/TSearch" :layout="{ type: 'single', iframe: true }">
    <Variant title="Default"><Showcase name="TSearch" /></Variant>
    <Variant title="Compact"><Showcase name="TSearch" variant="compact" /></Variant>
    <Variant title="Edge state"><Showcase name="TSearch" variant="edge" /></Variant>
  </Story>
</template>
