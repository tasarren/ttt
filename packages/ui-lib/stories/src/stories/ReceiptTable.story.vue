<script setup lang="ts">
import { Showcase } from "../Showcase"
</script>

<template>
  <Story title="03 Organisms/ReceiptTable" :layout="{ type: 'single', iframe: true }">
    <Variant title="Default"><Showcase name="ReceiptTable" /></Variant>
    <Variant title="Compact"><Showcase name="ReceiptTable" variant="compact" /></Variant>
    <Variant title="Edge state"><Showcase name="ReceiptTable" variant="edge" /></Variant>
  </Story>
</template>
