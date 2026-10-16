<script setup lang="ts">
import { Showcase } from "../Showcase"
</script>

<template>
  <Story title="03 Organisms/NotificationBatch" :layout="{ type: 'single', iframe: true }">
    <Variant title="Default"><Showcase name="NotificationBatch" /></Variant>
    <Variant title="Compact"><Showcase name="NotificationBatch" variant="compact" /></Variant>
    <Variant title="Edge state"><Showcase name="NotificationBatch" variant="edge" /></Variant>
  </Story>
</template>
