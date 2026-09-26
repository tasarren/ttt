<script setup lang="ts">
import { Showcase } from "../Showcase"
</script>

<template>
  <Story title="03 Organisms/SchemaLedgerView" :layout="{ type: 'single', iframe: true }">
    <Variant title="Default"><Showcase name="SchemaLedgerView" /></Variant>
    <Variant title="Compact"><Showcase name="SchemaLedgerView" variant="compact" /></Variant>
    <Variant title="Edge state"><Showcase name="SchemaLedgerView" variant="edge" /></Variant>
  </Story>
</template>
