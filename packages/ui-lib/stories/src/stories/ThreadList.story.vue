<script setup lang="ts">
import { Showcase } from "../Showcase"
</script>

<template>
  <Story title="03 Organisms/ThreadList" :layout="{ type: 'single', iframe: true }">
    <Variant title="Default"><Showcase name="ThreadList" /></Variant>
    <Variant title="Compact"><Showcase name="ThreadList" variant="compact" /></Variant>
    <Variant title="Edge state"><Showcase name="ThreadList" variant="edge" /></Variant>
  </Story>
</template>
