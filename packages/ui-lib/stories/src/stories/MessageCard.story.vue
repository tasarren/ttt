<script setup lang="ts">
import { Showcase } from "../Showcase"
</script>

<template>
  <Story title="03 Organisms/MessageCard" :layout="{ type: 'single', iframe: true }">
    <Variant title="Default"><Showcase name="MessageCard" /></Variant>
    <Variant title="Compact"><Showcase name="MessageCard" variant="compact" /></Variant>
    <Variant title="Edge state"><Showcase name="MessageCard" variant="edge" /></Variant>
  </Story>
</template>
