<script setup lang="ts">
import { Showcase } from "../Showcase"
</script>

<template>
  <Story title="03 Organisms/HarnessEditor" :layout="{ type: 'single', iframe: true }">
    <Variant title="Default"><Showcase name="HarnessEditor" /></Variant>
    <Variant title="Compact"><Showcase name="HarnessEditor" variant="compact" /></Variant>
    <Variant title="Edge state"><Showcase name="HarnessEditor" variant="edge" /></Variant>
  </Story>
</template>
