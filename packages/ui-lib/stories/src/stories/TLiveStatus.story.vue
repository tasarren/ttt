<script setup lang="ts">
import { Showcase } from "../Showcase"
</script>

<template>
  <Story title="02 Molecules/TLiveStatus" :layout="{ type: 'single', iframe: true }">
    <Variant title="Default"><Showcase name="TLiveStatus" /></Variant>
    <Variant title="Compact"><Showcase name="TLiveStatus" variant="compact" /></Variant>
    <Variant title="Edge state"><Showcase name="TLiveStatus" variant="edge" /></Variant>
  </Story>
</template>
