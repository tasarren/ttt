<script setup lang="ts">
import { Showcase } from "../Showcase"
</script>

<template>
  <Story title="02 Molecules/TPageHeader" :layout="{ type: 'single', iframe: true }">
    <Variant title="Default"><Showcase name="TPageHeader" /></Variant>
    <Variant title="Compact"><Showcase name="TPageHeader" variant="compact" /></Variant>
    <Variant title="Edge state"><Showcase name="TPageHeader" variant="edge" /></Variant>
  </Story>
</template>
