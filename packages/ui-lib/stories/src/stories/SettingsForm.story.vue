<script setup lang="ts">
import { Showcase } from "../Showcase"
</script>

<template>
  <Story title="03 Organisms/SettingsForm" :layout="{ type: 'single', iframe: true }">
    <Variant title="Default"><Showcase name="SettingsForm" /></Variant>
    <Variant title="Compact"><Showcase name="SettingsForm" variant="compact" /></Variant>
    <Variant title="Edge state"><Showcase name="SettingsForm" variant="edge" /></Variant>
  </Story>
</template>
