---
'@xcrong/docx-editor-vue': patch
---

T28-03 (refs #86, refs #71): Vue agent UI readiness is unchanged — the Vue chat surface (`AgentPanel`, chat log, composer, timeline, `useAgentBridge`) stays partial while six behavioral agent flows (tracked-change, comment threading, tool error, multi-step, streaming, byte-equal output) have no Vue parity specs yet, tracked by #368. Tooling-only release otherwise: pair-edit watch mode (`bun run dev:parity:watch`), a weekly a11y-parity cron, and an "AI assistant in 30 lines" snippet in the Vue README.
