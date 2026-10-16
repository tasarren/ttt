<script setup lang="ts">
import { Showcase } from "../Showcase"
</script>

<template>
  <Story title="03 Organisms/MessageBody" :layout="{ type: 'single', iframe: true }">
    <Variant title="Default"><Showcase name="MessageBody" /></Variant>
    <Variant title="Compact"><Showcase name="MessageBody" variant="compact" /></Variant>
    <Variant title="Edge state"><Showcase name="MessageBody" variant="edge" /></Variant>
  </Story>
</template>
