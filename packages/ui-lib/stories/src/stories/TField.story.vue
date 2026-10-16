<script setup lang="ts">
import { Showcase } from "../Showcase"
</script>

<template>
  <Story title="02 Molecules/TField" :layout="{ type: 'single', iframe: true }">
    <Variant title="Default"><Showcase name="TField" /></Variant>
    <Variant title="Compact"><Showcase name="TField" variant="compact" /></Variant>
    <Variant title="Edge state"><Showcase name="TField" variant="edge" /></Variant>
  </Story>
</template>
