/**
 * Context menu item providers (task 4.x).
 *
 * Each provider maps a resolved {@link ContextInfo} to the menu items for
 * one context (base/text/table/image/link). `composeMenuItems` combines them
 * with separator dividers between non-empty groups. All labels come from
 * the caller's `t()`; hosts MAY override the four table-collection labels
 * (`mergeCells`, `splitCell`, `selectTable`, `deleteTable`) via the
 * `tableOverrides` param.
 */

import type { TranslationKey } from '@xcrong/docx-editor-i18n';
import type { ContextInfo } from '@xcrong/docx-editor-core/prosemirror';
import { formatKeys } from './dialogs/KeyboardShortcutsDialog/ShortcutItem';
import type { TextContextMenuItem } from './TextContextMenu';

/** Translate function for `contextMenu.*` and `table.*` keys. */
export type MenuTranslator = (
  key: Extract<TranslationKey, `contextMenu.${string}` | `table.${string}`>
) => string;
/* (Callers pass `t` directly.) */

export function getBaseItems(ctx: ContextInfo, t: MenuTranslator): TextContextMenuItem[] {
  return [
    {
      action: 'cut',
      icon: 'content_cut',
      label: t('contextMenu.cut'),
      shortcut: formatKeys(t('contextMenu.cutShortcut')),
      disabled: !ctx.isTextSelected,
    },
    {
      action: 'copy',
      icon: 'content_copy',
      label: t('contextMenu.copy'),
      shortcut: formatKeys(t('contextMenu.copyShortcut')),
      disabled: !ctx.isTextSelected,
    },
    {
      action: 'paste',
      icon: 'content_paste',
      label: t('contextMenu.paste'),
      shortcut: formatKeys(t('contextMenu.pasteShortcut')),
    },
    {
      action: 'pasteAsPlainText',
      icon: 'content_paste_off',
      label: t('contextMenu.pastePlainText'),
      shortcut: formatKeys(t('contextMenu.pastePlainTextShortcut')),
      dividerAfter: true,
    },
    {
      action: 'delete',
      icon: 'delete',
      label: t('contextMenu.delete'),
      shortcut: formatKeys(t('contextMenu.deleteShortcut')),
      disabled: !ctx.isTextSelected,
    },
  ];
}

export function getTextItems(ctx: ContextInfo, t: MenuTranslator): TextContextMenuItem[] {
  if (!ctx.isTextSelected) return [];
  return [
    { action: 'addComment', icon: 'add_comment', label: t('contextMenu.comment') },
    { action: 'insertLink', icon: 'add_link', label: t('contextMenu.insertLink') },
    {
      action: 'clearFormatting',
      icon: 'format_clear',
      label: t('contextMenu.clearFormatting'),
    },
  ];
}

export function getTableItems(
  ctx: ContextInfo,
  t: MenuTranslator,
  opts: { hasMultiCellSelection: boolean; canSplitCell: boolean },
  tableOverrides?: {
    mergeCells?: string | null;
    splitCell?: string | null;
    selectTable?: string | null;
    deleteTable?: string | null;
  }
): TextContextMenuItem[] {
  if (!ctx.isInTable) return [];
  return [
    { action: 'addRowAbove', icon: 'keyboard_arrow_up', label: t('table.insertRowAbove') },
    { action: 'addRowBelow', icon: 'keyboard_arrow_down', label: t('table.insertRowBelow') },
    { action: 'deleteRow', icon: 'delete', label: t('table.deleteRow'), dividerAfter: true },
    { action: 'addColumnLeft', icon: 'keyboard_arrow_left', label: t('table.insertColumnLeft') },
    {
      action: 'addColumnRight',
      icon: 'keyboard_arrow_right',
      label: t('table.insertColumnRight'),
    },
    { action: 'deleteColumn', icon: 'delete', label: t('table.deleteColumn') },
    {
      action: 'mergeCells',
      icon: 'call_merge',
      label: tableOverrides?.mergeCells ?? t('table.mergeCells'),
      disabled: !opts.hasMultiCellSelection,
    },
    {
      action: 'splitCell',
      icon: 'call_split',
      label: tableOverrides?.splitCell ?? t('table.splitCell'),
      disabled: !opts.canSplitCell,
      dividerAfter: true,
    },
    {
      action: 'selectTable',
      icon: 'table_rows',
      label: tableOverrides?.selectTable ?? t('table.selectTable'),
    },
    {
      action: 'deleteTable',
      icon: 'delete',
      label: tableOverrides?.deleteTable ?? t('table.deleteTable'),
    },
  ];
}

export function getImageItems(ctx: ContextInfo): TextContextMenuItem[] {
  if (!ctx.isOnImage) return [];
  // The image menu surface (ImageContextMenu) renders its own wrap options
  // and properties rows; the provider contract only gates visibility here.
  return [];
}

export function getLinkItems(ctx: ContextInfo, t: MenuTranslator): TextContextMenuItem[] {
  if (!ctx.isOnHyperlink) return [];
  return [
    { action: 'editLink', icon: 'link', label: t('contextMenu.editLink') },
    { action: 'removeLink', icon: 'link_off', label: t('contextMenu.removeLink') },
    {
      action: 'openLink',
      icon: 'open_in_new',
      label: t('contextMenu.openLink'),
    },
  ];
}

/**
 * Combine all providers with separator dividers between non-empty groups.
 * Group order: base, text, link, table, selectAll (matches the spec's
 * layout rule; the Vue twin emits the same order).
 */
export function composeMenuItems(
  ctx: ContextInfo,
  t: MenuTranslator,
  tableOpts: { hasMultiCellSelection: boolean; canSplitCell: boolean },
  tableOverrides?: {
    mergeCells?: string | null;
    splitCell?: string | null;
    selectTable?: string | null;
    deleteTable?: string | null;
  }
): TextContextMenuItem[] {
  const selectAll: TextContextMenuItem = {
    action: 'selectAll',
    label: t('contextMenu.selectAll'),
    shortcut: formatKeys(t('contextMenu.selectAllShortcut')),
  };
  const groups = [
    getBaseItems(ctx, t),
    getTextItems(ctx, t),
    getLinkItems(ctx, t),
    getTableItems(ctx, t, tableOpts, tableOverrides),
    [selectAll],
  ].filter((g) => g.length > 0);
  const items: TextContextMenuItem[] = [];
  groups.forEach((group, groupIndex) => {
    group.forEach((item, itemIndex) => {
      const isGroupTail = itemIndex === group.length - 1;
      const groupContinues = groupIndex < groups.length - 1;
      items.push({
        ...item,
        dividerAfter: item.dividerAfter || (isGroupTail && groupContinues),
      });
    });
  });
  return items;
}
