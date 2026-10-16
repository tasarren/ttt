<script setup lang="ts">
import { Showcase } from "../Showcase"
</script>

<template>
  <Story title="03 Organisms/MailboxSummary" :layout="{ type: 'single', iframe: true }">
    <Variant title="Default"><Showcase name="MailboxSummary" /></Variant>
    <Variant title="Compact"><Showcase name="MailboxSummary" variant="compact" /></Variant>
    <Variant title="Edge state"><Showcase name="MailboxSummary" variant="edge" /></Variant>
  </Story>
</template>
