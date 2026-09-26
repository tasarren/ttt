<script setup lang="ts">
import { Showcase } from "../Showcase"
</script>

<template>
  <Story title="02 Molecules/TContextMenu" :layout="{ type: 'single', iframe: true }">
    <Variant title="Default"><Showcase name="TContextMenu" /></Variant>
    <Variant title="Compact"><Showcase name="TContextMenu" variant="compact" /></Variant>
    <Variant title="Edge state"><Showcase name="TContextMenu" variant="edge" /></Variant>
  </Story>
</template>
