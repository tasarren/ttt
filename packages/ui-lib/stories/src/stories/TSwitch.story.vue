<script setup lang="ts">
import { Showcase } from "../Showcase"
</script>

<template>
  <Story title="01 Atoms/TSwitch" :layout="{ type: 'single', iframe: true }">
    <Variant title="Default"><Showcase name="TSwitch" /></Variant>
    <Variant title="Compact"><Showcase name="TSwitch" variant="compact" /></Variant>
    <Variant title="Edge state"><Showcase name="TSwitch" variant="edge" /></Variant>
  </Story>
</template>
