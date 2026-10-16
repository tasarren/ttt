<script setup lang="ts">
import { Showcase } from "../Showcase"
</script>

<template>
  <Story title="03 Organisms/ReceiptInspector" :layout="{ type: 'single', iframe: true }">
    <Variant title="Default"><Showcase name="ReceiptInspector" /></Variant>
    <Variant title="Compact"><Showcase name="ReceiptInspector" variant="compact" /></Variant>
    <Variant title="Edge state"><Showcase name="ReceiptInspector" variant="edge" /></Variant>
  </Story>
</template>
