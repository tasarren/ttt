<script setup lang="ts">
import { Showcase } from "../Showcase"
</script>

<template>
  <Story title="02 Molecules/TCodeBlock" :layout="{ type: 'single', iframe: true }">
    <Variant title="Default"><Showcase name="TCodeBlock" /></Variant>
    <Variant title="Compact"><Showcase name="TCodeBlock" variant="compact" /></Variant>
    <Variant title="Edge state"><Showcase name="TCodeBlock" variant="edge" /></Variant>
  </Story>
</template>
