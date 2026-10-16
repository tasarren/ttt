<script setup lang="ts">
import { Showcase } from "../Showcase"
</script>

<template>
  <Story title="01 Atoms/TBadge" :layout="{ type: 'single', iframe: true }">
    <Variant title="Default"><Showcase name="TBadge" /></Variant>
    <Variant title="Compact"><Showcase name="TBadge" variant="compact" /></Variant>
    <Variant title="Edge state"><Showcase name="TBadge" variant="edge" /></Variant>
  </Story>
</template>
