<script setup lang="ts">
import { Showcase } from "../Showcase"
</script>

<template>
  <Story title="01 Atoms/TBrand" :layout="{ type: 'single', iframe: true }">
    <Variant title="Default"><Showcase name="TBrand" /></Variant>
    <Variant title="Compact"><Showcase name="TBrand" variant="compact" /></Variant>
    <Variant title="Edge state"><Showcase name="TBrand" variant="edge" /></Variant>
  </Story>
</template>
