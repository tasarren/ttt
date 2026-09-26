<script setup lang="ts">
import { Showcase } from "../Showcase"
</script>

<template>
  <Story title="02 Molecules/TDataTable" :layout="{ type: 'single', iframe: true }">
    <Variant title="Default"><Showcase name="TDataTable" /></Variant>
    <Variant title="Compact"><Showcase name="TDataTable" variant="compact" /></Variant>
    <Variant title="Edge state"><Showcase name="TDataTable" variant="edge" /></Variant>
  </Story>
</template>
