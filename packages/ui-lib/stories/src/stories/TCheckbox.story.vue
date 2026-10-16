<script setup lang="ts">
import { Showcase } from "../Showcase"
</script>

<template>
  <Story title="01 Atoms/TCheckbox" :layout="{ type: 'single', iframe: true }">
    <Variant title="Default"><Showcase name="TCheckbox" /></Variant>
    <Variant title="Compact"><Showcase name="TCheckbox" variant="compact" /></Variant>
    <Variant title="Edge state"><Showcase name="TCheckbox" variant="edge" /></Variant>
  </Story>
</template>
