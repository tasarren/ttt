<script setup lang="ts">
import { Showcase } from "../Showcase"
</script>

<template>
  <Story title="04 Templates/AppShell" :layout="{ type: 'single', iframe: true }">
    <Variant title="Default"><Showcase name="AppShell" /></Variant>
    <Variant title="Compact"><Showcase name="AppShell" variant="compact" /></Variant>
    <Variant title="Edge state"><Showcase name="AppShell" variant="edge" /></Variant>
  </Story>
</template>
