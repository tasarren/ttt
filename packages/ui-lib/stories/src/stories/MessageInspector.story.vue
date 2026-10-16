<script setup lang="ts">
import { Showcase } from "../Showcase"
</script>

<template>
  <Story title="03 Organisms/MessageInspector" :layout="{ type: 'single', iframe: true }">
    <Variant title="Default"><Showcase name="MessageInspector" /></Variant>
    <Variant title="Compact"><Showcase name="MessageInspector" variant="compact" /></Variant>
    <Variant title="Edge state"><Showcase name="MessageInspector" variant="edge" /></Variant>
  </Story>
</template>
