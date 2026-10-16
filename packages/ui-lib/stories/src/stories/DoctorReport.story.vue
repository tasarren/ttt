<script setup lang="ts">
import { Showcase } from "../Showcase"
</script>

<template>
  <Story title="03 Organisms/DoctorReport" :layout="{ type: 'single', iframe: true }">
    <Variant title="Default"><Showcase name="DoctorReport" /></Variant>
    <Variant title="Compact"><Showcase name="DoctorReport" variant="compact" /></Variant>
    <Variant title="Edge state"><Showcase name="DoctorReport" variant="edge" /></Variant>
  </Story>
</template>
