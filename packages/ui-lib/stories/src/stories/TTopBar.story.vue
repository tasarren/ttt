<script setup lang="ts">
import { Showcase } from "../Showcase"
</script>

<template>
  <Story title="03 Organisms/TTopBar" :layout="{ type: 'single', iframe: true }">
    <Variant title="Default"><Showcase name="TTopBar" /></Variant>
    <Variant title="Compact"><Showcase name="TTopBar" variant="compact" /></Variant>
    <Variant title="Edge state"><Showcase name="TTopBar" variant="edge" /></Variant>
  </Story>
</template>
