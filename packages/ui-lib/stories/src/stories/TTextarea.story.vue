<script setup lang="ts">
import { Showcase } from "../Showcase"
</script>

<template>
  <Story title="01 Atoms/TTextarea" :layout="{ type: 'single', iframe: true }">
    <Variant title="Default"><Showcase name="TTextarea" /></Variant>
    <Variant title="Compact"><Showcase name="TTextarea" variant="compact" /></Variant>
    <Variant title="Edge state"><Showcase name="TTextarea" variant="edge" /></Variant>
  </Story>
</template>
