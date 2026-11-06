<template>
  <Teleport to="body">
    <div
      v-if="isOpen"
      class="ctx-menu-backdrop"
      @mousedown="$emit('close')"
      @contextmenu.prevent="$emit('close')"
    />
    <div
      v-if="isOpen"
      ref="menuRef"
      :class="['ctx-menu', portalClass]"
      :style="menuStyle"
      tabindex="-1"
      @contextmenu.prevent
      @mousedown.prevent
      @keydown="handleKeyDown"
    >
      <button
        v-for="(item, i) in visibleItems"
        :key="item.id || i"
        :class="[
          'ctx-menu__item',
          {
            'ctx-menu__item--disabled': item.disabled,
            'ctx-menu__item--divider': item.divider,
            'ctx-menu__item--highlighted':
              !item.divider && navigableItems.indexOf(item) === highlightedIndex,
          },
        ]"
      :disabled="item.disabled"
      @click="onAction(item.action)"
      @mouseenter="onItemHover(item)"
      >
        <MaterialSymbol v-if="item.icon" :name="item.icon" :size="18" class="ctx-menu__icon" />
        <span class="ctx-menu__label">{{ item.label }}</span>
        <span v-if="item.shortcut" class="ctx-menu__shortcut">{{ item.shortcut }}</span>
      </button>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { ref, computed, watch, nextTick, onMounted, onUnmounted } from 'vue';
import { useTranslation } from '../i18n';
import { useDocxPortalClass } from '../composables/usePortalClass';
import MaterialSymbol from './ui/MaterialSymbol.vue';

export interface ContextMenuItem {
  id: string;
  label: string;
  action: string;
  icon?: string;
  shortcut?: string;
  disabled?: boolean;
  divider?: boolean;
}

const props = defineProps<{
  isOpen: boolean;
  position: { x: number; y: number };
  hasSelection: boolean;
  isEditable: boolean;
  inTable?: boolean;
  onImage?: boolean;
  isOnHyperlink?: boolean;
  // Mirrors React's tableContext gates: merge needs a multi-cell
}>();

const emit = defineEmits<{
  (e: 'close'): void;
  (e: 'action', action: string): void;
}>();

const { t } = useTranslation();
// Re-apply the editor's `.ep-root` token scope to this body-teleported menu.
const portalClass = useDocxPortalClass();

const menuRef = ref<HTMLElement | null>(null);

const MENU_WIDTH = 220;
const MENU_ITEM_HEIGHT = 32;
const MARGIN = 10;

const visibleItems = computed<ContextMenuItem[]>(() => {
  const items: ContextMenuItem[] = [
    {
      id: 'cut',
      label: t('contextMenu.cut'),
      action: 'cut',
      icon: 'content_cut',
      shortcut: t('contextMenu.cutShortcut'),
      disabled: !props.hasSelection || !props.isEditable,
    },
    {
      id: 'copy',
      label: t('contextMenu.copy'),
      action: 'copy',
      icon: 'content_copy',
      shortcut: t('contextMenu.copyShortcut'),
      disabled: !props.hasSelection,
    },
    {
      id: 'paste',
      label: t('contextMenu.paste'),
      action: 'paste',
      icon: 'content_paste',
      shortcut: t('contextMenu.pasteShortcut'),
      disabled: !props.isEditable,
    },
    {
      id: 'pasteAsPlainText',
      label: t('contextMenu.pastePlainText'),
      action: 'pasteAsPlainText',
      icon: 'content_paste_off',
      shortcut: t('contextMenu.pastePlainTextShortcut'),
      disabled: !props.isEditable,
    },
    { id: 'div1', label: '', action: '', divider: true },
    {
      id: 'delete',
      label: t('contextMenu.delete'),
      action: 'delete',
      icon: 'delete',
      shortcut: t('contextMenu.deleteShortcut'),
      disabled: !props.hasSelection || !props.isEditable,
    },
  ];

  if (props.hasSelection && props.isEditable) {
    items.push(
      { id: 'div-text', label: '', action: '', divider: true },
      {
        id: 'addComment',
        label: t('contextMenu.comment'),
        action: 'addComment',
        icon: 'add_comment',
      },
      {
        id: 'insertLink',
        label: t('contextMenu.insertLink'),
        action: 'insertLink',
        icon: 'add_link',
      },
      {
        id: 'clearFormatting',
        label: t('contextMenu.clearFormatting'),
        action: 'clearFormatting',
        icon: 'format_clear',
      }
    );
  }

  if (props.isOnHyperlink && props.isEditable) {
    items.push(
      { id: 'div-link', label: '', action: '', divider: true },
      {
        id: 'editLink',
        label: t('contextMenu.editLink'),
        action: 'editLink',
        icon: 'link',
      },
      {
        id: 'removeLink',
        label: t('contextMenu.removeLink'),
        action: 'removeLink',
        icon: 'link_off',
      },
      {
        id: 'openLink',
        label: t('contextMenu.openLink'),
        action: 'openLink',
        icon: 'open_in_new',
      }
    );
  }

  // Fallback only: image right-clicks normally route to the dedicated
  // image menu (which closes this menu); these rows cover a missed
  // image lookup on a click flagged on-image.
  if (props.onImage && props.isEditable) {
    items.push(
      { id: 'div-img', label: '', action: '', divider: true },
      { id: 'replaceImage', label: t('imageOverlay.replaceImage'), action: 'replaceImage' },
      {
        id: 'imageProperties',
        label: t('imageWrap.menu.imageProperties'),
        action: 'imageProperties',
      },
      {
        id: 'deleteImage',
        label: t('imageOverlay.deleteImage'),
        action: 'deleteImage',
        shortcut: t('contextMenu.deleteShortcut'),
      }
    );
  }

  if (props.inTable && props.isEditable) {
    items.push(
      { id: 'div2', label: '', action: '', divider: true },
      { id: 'addRowAbove', label: t('table.insertRowAbove'), action: 'addRowAbove', icon: 'keyboard_arrow_up' },
      { id: 'addRowBelow', label: t('table.insertRowBelow'), action: 'addRowBelow', icon: 'keyboard_arrow_down' },
      { id: 'deleteRow', label: t('table.deleteRow'), action: 'deleteRow', icon: 'delete' },
      { id: 'div3', label: '', action: '', divider: true },
      { id: 'addColLeft', label: t('table.insertColumnLeft'), action: 'addColumnLeft', icon: 'keyboard_arrow_left' },
      { id: 'addColRight', label: t('table.insertColumnRight'), action: 'addColumnRight', icon: 'keyboard_arrow_right' },
      { id: 'deleteCol', label: t('table.deleteColumn'), action: 'deleteColumn', icon: 'delete' },
      { id: 'div4', label: '', action: '', divider: true },
      {
        id: 'mergeCells',
        label: t('table.mergeCells'),
        action: 'mergeCells',
        icon: 'call_merge',
        disabled: !props.canMergeCells,
      },
      {
        id: 'splitCell',
        label: t('table.splitCell'),
        action: 'splitCell',
        icon: 'call_split',
        disabled: !props.canSplitCell,
      },
      { id: 'selectTable', label: t('table.selectTable'), action: 'selectTable', icon: 'table_rows' },
      { id: 'deleteTable', label: t('table.deleteTable'), action: 'deleteTable', icon: 'delete' }
    );
  }

  // selectAll closes the menu (base, text, link, [image fallback,] table,
  // then selectAll) — same trailing position as React's composeMenuItems.
  items.push(
    { id: 'div-select-all', label: '', action: '', divider: true },
    {
      id: 'selectAll',
      label: t('contextMenu.selectAll'),
      action: 'selectAll',
      shortcut: t('contextMenu.selectAllShortcut'),
    }
  );

  return items;
});

const menuStyle = computed(() => {
  let x = props.position.x;
  let y = props.position.y;
  const itemCount = visibleItems.value.filter((i) => !i.divider).length;
  const dividerCount = visibleItems.value.filter((i) => i.divider).length;
  const menuHeight = itemCount * MENU_ITEM_HEIGHT + dividerCount * 9;

  if (typeof window !== 'undefined') {
    if (x + MENU_WIDTH + MARGIN > window.innerWidth) {
      x = window.innerWidth - MENU_WIDTH - MARGIN;
    }
    if (y + menuHeight + MARGIN > window.innerHeight) {
      y = window.innerHeight - menuHeight - MARGIN;
    }
  }

  return {
    position: 'fixed' as const,
    left: `${x}px`,
    top: `${y}px`,
    zIndex: 400,
  };
});

const highlightedIndex = ref(0);

const navigableItems = computed(() => visibleItems.value.filter((i) => !i.divider));

function onItemHover(item: ContextMenuItem) {
  if (item.divider || item.disabled) return;
  const idx = navigableItems.value.indexOf(item);
  if (idx >= 0) highlightedIndex.value = idx;
}

function onAction(action: string) {
  if (!action) return;
  emit('action', action);
  emit('close');
}

function handleKeyDown(e: KeyboardEvent) {
  if (e.key === 'Escape') {
    e.preventDefault();
    emit('close');
    return;
  }
  if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp' && e.key !== 'Enter') return;
  e.preventDefault();
  const items = navigableItems.value;
  if (e.key === 'Enter') {
    const item = items[highlightedIndex.value];
    if (item && !item.disabled) onAction(item.action);
    return;
  }
  const dir = e.key === 'ArrowDown' ? 1 : -1;
  let next = highlightedIndex.value;
  for (let i = 0; i < items.length; i++) {
    next = (next + dir + items.length) % items.length;
    if (!items[next].disabled) break;
  }
  highlightedIndex.value = next;
}

watch(
  () => props.isOpen,
  (open) => {
    if (open) {
      highlightedIndex.value = 0;
      nextTick(() => menuRef.value?.focus());
    }
  }
);

// The menu is position:fixed — close it when the page scrolls underneath.
// Registered while open only; capture phase catches scrolls in any scroller.
function handleWindowScroll() {
  emit('close');
}
watch(
  () => props.isOpen,
  (open) => {
    if (open) window.addEventListener('scroll', handleWindowScroll, true);
    else window.removeEventListener('scroll', handleWindowScroll, true);
  }
);
onUnmounted(() => window.removeEventListener('scroll', handleWindowScroll, true));
</script>

<style scoped>
.ctx-menu-backdrop {
  position: fixed;
  inset: 0;
  z-index: 399;
}
.ctx-menu {
  background: var(--doc-surface);
  border: 1px solid var(--doc-border-dark);
  border-radius: 6px;
  box-shadow: 0 4px 16px var(--doc-shadow);
  min-width: 220px;
  padding: 4px 0;
  outline: none;
}
.ctx-menu__item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
  padding: 6px 14px;
  border: none;
  background: transparent;
  cursor: pointer;
  font-size: 13px;
  color: var(--doc-text);
  text-align: left;
  height: 32px;
}
.ctx-menu__item:hover:not(.ctx-menu__item--disabled):not(.ctx-menu__item--divider) {
  background: var(--doc-bg-hover);
}
.ctx-menu__item--disabled {
  color: var(--doc-text-subtle);
  cursor: default;
}
.ctx-menu__item--divider {
  height: 1px;
  padding: 0;
  margin: 4px 8px;
  background: var(--doc-border);
  cursor: default;
  pointer-events: none;
}
.ctx-menu__label {
  flex: 1;
}
.ctx-menu__icon {
  display: inline-flex;
  margin-right: 10px;
  color: var(--doc-text-muted);
}
.ctx-menu__item--highlighted:not(.ctx-menu__item--disabled) {
  background: var(--doc-bg-hover);
}
.ctx-menu__shortcut {
  font-size: 11px;
  color: var(--doc-text-subtle);
  margin-left: 16px;
}
</style>
