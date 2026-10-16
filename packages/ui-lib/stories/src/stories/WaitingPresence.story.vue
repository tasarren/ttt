<script setup lang="ts">
import { Showcase } from "../Showcase"
</script>

<template>
  <Story title="03 Organisms/WaitingPresence" :layout="{ type: 'single', iframe: true }">
    <Variant title="Default"><Showcase name="WaitingPresence" /></Variant>
    <Variant title="Compact"><Showcase name="WaitingPresence" variant="compact" /></Variant>
    <Variant title="Edge state"><Showcase name="WaitingPresence" variant="edge" /></Variant>
  </Story>
</template>
