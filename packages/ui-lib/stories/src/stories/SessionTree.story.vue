<script setup lang="ts">
import { Showcase } from "../Showcase"
</script>

<template>
  <Story title="03 Organisms/SessionTree" :layout="{ type: 'single', iframe: true }">
    <Variant title="Default"><Showcase name="SessionTree" /></Variant>
    <Variant title="Compact"><Showcase name="SessionTree" variant="compact" /></Variant>
    <Variant title="Edge state"><Showcase name="SessionTree" variant="edge" /></Variant>
  </Story>
</template>
