<script setup lang="ts">
import { Showcase } from "../Showcase"
</script>

<template>
  <Story title="01 Atoms/TInput" :layout="{ type: 'single', iframe: true }">
    <Variant title="Default"><Showcase name="TInput" /></Variant>
    <Variant title="Compact"><Showcase name="TInput" variant="compact" /></Variant>
    <Variant title="Edge state"><Showcase name="TInput" variant="edge" /></Variant>
  </Story>
</template>
