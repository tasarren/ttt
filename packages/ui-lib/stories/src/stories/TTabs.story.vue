<script setup lang="ts">
import { Showcase } from "../Showcase"
</script>

<template>
  <Story title="02 Molecules/TTabs" :layout="{ type: 'single', iframe: true }">
    <Variant title="Default"><Showcase name="TTabs" /></Variant>
    <Variant title="Compact"><Showcase name="TTabs" variant="compact" /></Variant>
    <Variant title="Edge state"><Showcase name="TTabs" variant="edge" /></Variant>
  </Story>
</template>
