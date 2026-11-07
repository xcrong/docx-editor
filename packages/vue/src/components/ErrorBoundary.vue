<template>
  <div class="error-boundary">
    <slot />

    <!-- Toast notification container -->
    <Teleport to="body">
      <div class="error-toasts">
        <TransitionGroup name="toast">
          <div
            v-for="toast in toasts"
            :key="toast.id"
            :class="['error-toast', `error-toast--${toast.severity}`]"
          >
            <span class="error-toast__icon">{{ severityIcon(toast.severity) }}</span>
            <span class="error-toast__message">{{ toast.message }}</span>
            <button class="error-toast__close" @click="dismissToast(toast.id)">&#x2715;</button>
          </div>
        </TransitionGroup>
      </div>
    </Teleport>
  </div>
</template>

<script setup lang="ts">
/**
 * ErrorBoundary — Vue counterpart to React's `ErrorProvider` + `ErrorBoundary`.
 *
 * Thin Vue wrapper around the framework-agnostic ErrorManager from core.
 * All notification state (show/dismiss/auto-dismiss) lives in the manager;
 * this component only subscribes to its snapshot and forwards Vue/global
 * errors into it — the same semantics React gets via useSyncExternalStore.
 */
import { computed, onBeforeUnmount, onErrorCaptured, onMounted, ref } from 'vue';
import { ErrorManager } from '@xcrong/docx-editor-core';
import type { ErrorSeverity as CoreErrorSeverity } from '@xcrong/docx-editor-core';

export type ErrorSeverity = CoreErrorSeverity;

const props = withDefaults(
  defineProps<{
    /** Auto-dismiss timeout in ms (0 = rely on the manager's own policy) */
    autoDismiss?: number;
  }>(),
  { autoDismiss: 5000 }
);

const emit = defineEmits<{
  (e: 'error', error: Error, severity: ErrorSeverity): void;
}>();

// ErrorManager owns all notification state, mirroring React's ErrorProvider.
const manager = new ErrorManager();

// Re-render whenever the manager snapshot changes (same role as
// useSyncExternalStore in React).
const version = ref(0);
const toasts = computed(() => {
  void version.value;
  return manager.getSnapshot().notifications.filter((n) => !n.dismissed);
});
const unsubscribe = manager.subscribe(() => {
  version.value++;
});

function addToast(message: string, severity: ErrorSeverity = 'error'): string {
  const id =
    severity === 'warning'
      ? manager.showWarning(message)
      : severity === 'info'
        ? manager.showInfo(message)
        : manager.showError(message);

  if (props.autoDismiss > 0) {
    setTimeout(() => manager.dismiss(id), props.autoDismiss);
  }
  return id;
}

function dismissToast(id: string) {
  manager.dismiss(id);
}

function severityIcon(severity: ErrorSeverity): string {
  switch (severity) {
    case 'error': return '\u26D4';
    case 'warning': return '\u26A0';
    case 'info': return '\u2139';
  }
}

// Capture Vue component errors
onErrorCaptured((err, instance, info) => {
  const error = err instanceof Error ? err : new Error(String(err));
  addToast(error.message, 'error');
  emit('error', error, 'error');
  return false; // prevent propagation
});

// Global unhandled errors
function handleGlobalError(event: ErrorEvent) {
  addToast(event.message || 'An unexpected error occurred', 'error');
}

function handleUnhandledRejection(event: PromiseRejectionEvent) {
  const msg = event.reason?.message || String(event.reason) || 'Unhandled promise rejection';
  manager.showWarning(msg);
}

onMounted(() => {
  window.addEventListener('error', handleGlobalError);
  window.addEventListener('unhandledrejection', handleUnhandledRejection);
});

onBeforeUnmount(() => {
  window.removeEventListener('error', handleGlobalError);
  window.removeEventListener('unhandledrejection', handleUnhandledRejection);
  unsubscribe();
  manager.destroy();
});

defineExpose({ addToast, dismissToast });
</script>

<style scoped>
.error-boundary { position: relative; }
.error-toasts {
  position: fixed;
  top: 16px;
  right: 16px;
  z-index: 50000;
  display: flex;
  flex-direction: column;
  gap: 8px;
  max-width: 400px;
}
.error-toast {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  padding: 10px 14px;
  border-radius: 6px;
  box-shadow: 0 4px 12px var(--doc-shadow);
  font-size: 13px;
  line-height: 1.4;
}
.error-toast--error { background: var(--doc-error-bg); color: var(--doc-error); border: 1px solid var(--doc-error); }
.error-toast--warning { background: var(--doc-warning-bg); color: var(--doc-warning-text); border: 1px solid var(--doc-warning); }
.error-toast--info { background: var(--doc-primary-light); color: var(--doc-primary); border: 1px solid var(--doc-primary); }
.error-toast__icon { flex-shrink: 0; font-size: 14px; }
.error-toast__message { flex: 1; }
.error-toast__close {
  border: none;
  background: transparent;
  cursor: pointer;
  font-size: 12px;
  opacity: 0.5;
  padding: 0;
  line-height: 1;
}
.error-toast__close:hover { opacity: 1; }

/* Transition animations */
.toast-enter-active { transition: all 0.3s ease-out; }
.toast-leave-active { transition: all 0.2s ease-in; }
.toast-enter-from { opacity: 0; transform: translateX(30px); }
.toast-leave-to { opacity: 0; transform: translateX(30px); }
</style>
