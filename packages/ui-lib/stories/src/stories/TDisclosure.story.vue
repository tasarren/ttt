<script setup lang="ts">
import { Showcase } from "../Showcase"
</script>

<template>
  <Story title="02 Molecules/TDisclosure" :layout="{ type: 'single', iframe: true }">
    <Variant title="Default"><Showcase name="TDisclosure" /></Variant>
    <Variant title="Compact"><Showcase name="TDisclosure" variant="compact" /></Variant>
    <Variant title="Edge state"><Showcase name="TDisclosure" variant="edge" /></Variant>
  </Story>
</template>
