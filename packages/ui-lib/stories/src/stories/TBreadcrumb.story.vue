<script setup lang="ts">
import { Showcase } from "../Showcase"
</script>

<template>
  <Story title="02 Molecules/TBreadcrumb" :layout="{ type: 'single', iframe: true }">
    <Variant title="Default"><Showcase name="TBreadcrumb" /></Variant>
    <Variant title="Compact"><Showcase name="TBreadcrumb" variant="compact" /></Variant>
    <Variant title="Edge state"><Showcase name="TBreadcrumb" variant="edge" /></Variant>
  </Story>
</template>
