<script setup lang="ts">
import { Showcase } from "../Showcase"
</script>

<template>
  <Story title="01 Atoms/TIdentifier" :layout="{ type: 'single', iframe: true }">
    <Variant title="Default"><Showcase name="TIdentifier" /></Variant>
    <Variant title="Compact"><Showcase name="TIdentifier" variant="compact" /></Variant>
    <Variant title="Edge state"><Showcase name="TIdentifier" variant="edge" /></Variant>
  </Story>
</template>
