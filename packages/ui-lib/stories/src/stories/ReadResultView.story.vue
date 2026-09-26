<script setup lang="ts">
import { Showcase } from "../Showcase"
</script>

<template>
  <Story title="03 Organisms/ReadResultView" :layout="{ type: 'single', iframe: true }">
    <Variant title="Default"><Showcase name="ReadResultView" /></Variant>
    <Variant title="Compact"><Showcase name="ReadResultView" variant="compact" /></Variant>
    <Variant title="Edge state"><Showcase name="ReadResultView" variant="edge" /></Variant>
  </Story>
</template>
