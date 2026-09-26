<script setup lang="ts">
import { Showcase } from "../Showcase"
</script>

<template>
  <Story title="01 Atoms/TButton" :layout="{ type: 'single', iframe: true }">
    <Variant title="Default"><Showcase name="TButton" /></Variant>
    <Variant title="Compact"><Showcase name="TButton" variant="compact" /></Variant>
    <Variant title="Edge state"><Showcase name="TButton" variant="edge" /></Variant>
  </Story>
</template>
