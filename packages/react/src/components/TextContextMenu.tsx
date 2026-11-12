/**
 * Text Context Menu Component
 *
 * Right-click context menu for text editing operations.
 * Shows Cut, Copy, Paste, and other text editing options.
 */

import React, { useCallback, useEffect, useRef, useState, useMemo } from 'react';
import { MaterialSymbol } from './ui/Icons';
import { useTranslation } from '../i18n';
import { Z_INDEX } from '../styles/zIndex';

// ============================================================================
// TYPES
// ============================================================================

/**
 * Context menu action types
 */
export type TextContextAction =
  | 'cut'
  | 'copy'
  | 'paste'
  | 'pasteAsPlainText'
  | 'selectAll'
  | 'delete'
  | 'separator'
  | 'addRowAbove'
  | 'addRowBelow'
  | 'deleteRow'
  | 'addColumnLeft'
  | 'addColumnRight'
  | 'deleteColumn'
  | 'mergeCells'
  | 'splitCell'
  | 'selectTable'
  | 'deleteTable'
  | 'addComment'
  | 'insertLink'
  | 'clearFormatting'
  | 'editLink'
  | 'removeLink'
  | 'openLink';

/**
 * Menu item configuration
 */
export interface TextContextMenuItem {
  /** Action type */
  action: TextContextAction;
  /** Display label */
  label: string;
  /** Material Symbol icon name (rendered via `<MaterialSymbol>`) */
  icon?: string;
  /** Keyboard shortcut hint */
  shortcut?: string;
  /** Whether the item is disabled */
  disabled?: boolean;
  /** Whether to show divider after this item */
  dividerAfter?: boolean;
}

/**
 * Context menu props
 */
export interface TextContextMenuProps {
  /** Whether the menu is visible */
  isOpen: boolean;
  /** Menu position */
  position: { x: number; y: number };
  /** Whether there's a selection (enables copy/cut) */
  hasSelection: boolean;
  /** Whether the editor is editable (enables paste/cut/delete) */
  isEditable: boolean;
  /** Whether clipboard has content (enables paste) */
  hasClipboardContent?: boolean;
  /** Callback when an action is selected */
  onAction: (action: TextContextAction) => void;
  /** Callback when menu is closed */
  onClose: () => void;
  /** Custom menu items (overrides default) */
  items?: TextContextMenuItem[];
  /** Additional className */
  className?: string;
}

// ============================================================================
// ICONS
// ============================================================================

const CutIcon = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
    <circle cx="4" cy="12" r="2" stroke="currentColor" strokeWidth="1.5" />
    <circle cx="12" cy="12" r="2" stroke="currentColor" strokeWidth="1.5" />
    <path
      d="M5.5 10.5L10.5 3M10.5 10.5L5.5 3"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
    />
  </svg>
);

const CopyIcon = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
    <rect x="5" y="5" width="8" height="9" rx="1" stroke="currentColor" strokeWidth="1.5" />
    <path
      d="M11 5V3a1 1 0 00-1-1H4a1 1 0 00-1 1v8a1 1 0 001 1h2"
      stroke="currentColor"
      strokeWidth="1.5"
    />
  </svg>
);

const PasteIcon = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
    <rect x="3" y="3" width="10" height="11" rx="1" stroke="currentColor" strokeWidth="1.5" />
    <path d="M6 3V2a1 1 0 011-1h2a1 1 0 011 1v1" stroke="currentColor" strokeWidth="1.5" />
    <path d="M6 8h4M6 11h4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
  </svg>
);

const DeleteIcon = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
  </svg>
);

const SelectAllIcon = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
    <rect
      x="2"
      y="2"
      width="12"
      height="12"
      rx="1"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeDasharray="2 2"
    />
    <rect x="4" y="4" width="8" height="8" fill="currentColor" opacity="0.3" />
  </svg>
);

const AddRowAboveIcon = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
    <rect x="2" y="6" width="12" height="4" rx="0.5" stroke="currentColor" strokeWidth="1.2" />
    <rect x="2" y="10" width="12" height="4" rx="0.5" stroke="currentColor" strokeWidth="1.2" />
    <path d="M8 1v3M6.5 2.5h3" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
  </svg>
);

const AddRowBelowIcon = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
    <rect x="2" y="2" width="12" height="4" rx="0.5" stroke="currentColor" strokeWidth="1.2" />
    <rect x="2" y="6" width="12" height="4" rx="0.5" stroke="currentColor" strokeWidth="1.2" />
    <path d="M8 12v3M6.5 13.5h3" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
  </svg>
);

const DeleteRowIcon = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
    <rect x="2" y="2" width="12" height="4" rx="0.5" stroke="currentColor" strokeWidth="1.2" />
    <rect
      x="2"
      y="6"
      width="12"
      height="4"
      rx="0.5"
      stroke="currentColor"
      strokeWidth="1.2"
      opacity="0.3"
    />
    <rect x="2" y="10" width="12" height="4" rx="0.5" stroke="currentColor" strokeWidth="1.2" />
    <path d="M5 8h6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
  </svg>
);

const AddColumnLeftIcon = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
    <rect x="6" y="2" width="4" height="12" rx="0.5" stroke="currentColor" strokeWidth="1.2" />
    <rect x="10" y="2" width="4" height="12" rx="0.5" stroke="currentColor" strokeWidth="1.2" />
    <path d="M3 8H0.5M1.75 6.5v3" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
  </svg>
);

const AddColumnRightIcon = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
    <rect x="2" y="2" width="4" height="12" rx="0.5" stroke="currentColor" strokeWidth="1.2" />
    <rect x="6" y="2" width="4" height="12" rx="0.5" stroke="currentColor" strokeWidth="1.2" />
    <path d="M13 8h2.5M14.25 6.5v3" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
  </svg>
);

const DeleteColumnIcon = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
    <rect x="2" y="2" width="4" height="12" rx="0.5" stroke="currentColor" strokeWidth="1.2" />
    <rect
      x="6"
      y="2"
      width="4"
      height="12"
      rx="0.5"
      stroke="currentColor"
      strokeWidth="1.2"
      opacity="0.3"
    />
    <rect x="10" y="2" width="4" height="12" rx="0.5" stroke="currentColor" strokeWidth="1.2" />
    <path d="M8 5v6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
  </svg>
);

const MergeCellsIcon = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
    <rect x="2" y="4" width="4" height="8" rx="0.5" stroke="currentColor" strokeWidth="1.2" />
    <rect x="10" y="4" width="4" height="8" rx="0.5" stroke="currentColor" strokeWidth="1.2" />
    <path d="M7 8h2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    <path d="M8 7l1 1-1 1" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
  </svg>
);

const SplitCellIcon = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
    <rect x="2" y="4" width="12" height="8" rx="0.5" stroke="currentColor" strokeWidth="1.2" />
    <path d="M8 4v8" stroke="currentColor" strokeWidth="1.2" strokeDasharray="2 1" />
    <path d="M6.5 8h-1M9.5 8h1" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
  </svg>
);

const SelectTableIcon = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
    <rect
      x="2"
      y="2"
      width="12"
      height="12"
      rx="1"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeDasharray="2 1.5"
    />
    <path d="M8 2v12M2 8h12" stroke="currentColor" strokeWidth="1.2" />
  </svg>
);

const DeleteTableIcon = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
    <rect x="2" y="2" width="12" height="12" rx="1" stroke="currentColor" strokeWidth="1.3" />
    <path d="M5 2v12M2 8h11" stroke="currentColor" strokeWidth="1.1" opacity="0.6" />
    <path
      d="M5.5 5.5l5 5M10.5 5.5l-5 5"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
    />
  </svg>
);

const CommentIcon = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path
      d="M3 3h10a1 1 0 011 1v6a1 1 0 01-1 1H6l-3 2.5V11H3a1 1 0 01-1-1V4a1 1 0 011-1z"
      stroke="currentColor"
      strokeWidth="1.3"
    />
    <path d="M5 6h6M5 8.5h4" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
  </svg>
);

/**
 * Get icon for action
 */
function getActionIcon(action: TextContextAction): React.ReactNode {
  switch (action) {
    case 'cut':
      return <CutIcon />;
    case 'copy':
      return <CopyIcon />;
    case 'paste':
    case 'pasteAsPlainText':
      return <PasteIcon />;
    case 'delete':
      return <DeleteIcon />;
    case 'selectAll':
      return <SelectAllIcon />;
    case 'addRowAbove':
      return <AddRowAboveIcon />;
    case 'addRowBelow':
      return <AddRowBelowIcon />;
    case 'deleteRow':
      return <DeleteRowIcon />;
    case 'addColumnLeft':
      return <AddColumnLeftIcon />;
    case 'addColumnRight':
      return <AddColumnRightIcon />;
    case 'deleteColumn':
      return <DeleteColumnIcon />;
    case 'mergeCells':
      return <MergeCellsIcon />;
    case 'splitCell':
      return <SplitCellIcon />;
    case 'selectTable':
      return <SelectTableIcon />;
    case 'deleteTable':
      return <DeleteTableIcon />;
    case 'addComment':
      return <CommentIcon />;
    default:
      return null;
  }
}

// ============================================================================
// MENU ITEM COMPONENT
// ============================================================================

interface MenuItemComponentProps {
  item: TextContextMenuItem;
  onClick: () => void;
  isHighlighted: boolean;
  onMouseEnter: () => void;
}

const MenuItemComponent: React.FC<MenuItemComponentProps> = ({
  item,
  onClick,
  isHighlighted,
  onMouseEnter,
}) => {
  if (item.action === 'separator') {
    return (
      <div
        className="docx-text-context-menu-separator"
        style={{
          height: '1px',
          backgroundColor: 'var(--doc-border)',
          margin: '4px 12px',
        }}
      />
    );
  }

  return (
    <>
      <button
        type="button"
        className={`docx-text-context-menu-item ${isHighlighted ? 'docx-text-context-menu-item-highlighted' : ''} ${item.disabled ? 'docx-text-context-menu-item-disabled' : ''}`}
        onClick={onClick}
        onMouseEnter={onMouseEnter}
        disabled={item.disabled}
        role="menuitem"
        aria-disabled={item.disabled}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '10px',
          width: '100%',
          padding: '8px 12px',
          border: 'none',
          background: isHighlighted && !item.disabled ? 'var(--doc-primary-light)' : 'transparent',
          cursor: item.disabled ? 'not-allowed' : 'pointer',
          fontSize: '13px',
          color: item.disabled ? 'var(--doc-text-subtle)' : 'var(--doc-text)',
          textAlign: 'left',
          opacity: item.disabled ? 0.6 : 1,
        }}
      >
        <span
          style={{
            display: 'flex',
            color: item.disabled ? 'var(--doc-border)' : 'var(--doc-text-muted)',
          }}
        >
          {item.icon ? <MaterialSymbol name={item.icon} size={18} /> : getActionIcon(item.action)}
        </span>
        <span style={{ flex: 1 }}>{item.label}</span>
        {item.shortcut && (
          <span
            style={{
              fontSize: '11px',
              color: 'var(--doc-text-subtle)',
              fontFamily: 'monospace',
            }}
          >
            {item.shortcut}
          </span>
        )}
      </button>
      {item.dividerAfter && (
        <div
          className="docx-text-context-menu-separator"
          style={{
            height: '1px',
            backgroundColor: 'var(--doc-border)',
            margin: '4px 12px',
          }}
        />
      )}
    </>
  );
};

// ============================================================================
// TEXT CONTEXT MENU COMPONENT
// ============================================================================

export const TextContextMenu: React.FC<TextContextMenuProps> = ({
  isOpen,
  position,
  hasSelection,
  isEditable,
  hasClipboardContent = true,
  onAction,
  onClose,
  items,
  className = '',
}) => {
  const menuRef = useRef<HTMLDivElement>(null);
  const [highlightedIndex, setHighlightedIndex] = useState(0);
  const { t } = useTranslation();

  // Fallback items when the host passes no `items` (the live
  // `useContextMenus` hook always supplies composed provider items).
  const translatedDefaults: TextContextMenuItem[] = useMemo(
    () => [
      {
        action: 'cut' as const,
        label: t('contextMenu.cut'),
        shortcut: t('contextMenu.cutShortcut'),
      },
      {
        action: 'copy' as const,
        label: t('contextMenu.copy'),
        shortcut: t('contextMenu.copyShortcut'),
      },
      {
        action: 'paste' as const,
        label: t('contextMenu.paste'),
        shortcut: t('contextMenu.pasteShortcut'),
      },
      {
        action: 'pasteAsPlainText' as const,
        label: t('contextMenu.pastePlainText'),
        shortcut: t('contextMenu.pastePlainTextShortcut'),
        dividerAfter: true,
      },
      {
        action: 'delete' as const,
        label: t('contextMenu.delete'),
        shortcut: t('contextMenu.deleteShortcut'),
        dividerAfter: true,
      },
      {
        action: 'selectAll' as const,
        label: t('contextMenu.selectAll'),
        shortcut: t('contextMenu.selectAllShortcut'),
      },
    ],
    [t]
  );

  // Build menu items with disabled states
  const menuItems = (items || translatedDefaults).map((item) => {
    const disabled = (() => {
      if (item.disabled !== undefined) return item.disabled;
      switch (item.action) {
        case 'cut':
        case 'copy':
        case 'delete':
          return !hasSelection;
        case 'paste':
        case 'pasteAsPlainText':
          return !isEditable || !hasClipboardContent;
        default:
          return false;
      }
    })();

    return { ...item, disabled };
  });

  // Filter out separators for keyboard navigation
  const navigableItems = menuItems.filter((item) => item.action !== 'separator');

  // Handle click outside + scroll (menu is position:fixed, so it must close
  // when the page scrolls underneath it).
  useEffect(() => {
    if (!isOpen) return;

    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    const handleScroll = () => onClose();

    // Use timeout to avoid immediately closing on right-click
    const timer = setTimeout(() => {
      document.addEventListener('mousedown', handleClickOutside);
      document.addEventListener('scroll', handleScroll, true);
    }, 0);

    return () => {
      clearTimeout(timer);
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('scroll', handleScroll, true);
    };
  }, [isOpen, onClose]);

  // Handle keyboard navigation.
  //
  // Capture phase + stopPropagation: focus stays in the hidden ProseMirror
  // while the menu is open, so without capture PM's own keymap would run
  // first (e.g. Enter would delete the current selection before the menu
  // activates its item). Intercepting on the way down keeps menu keys from
  // ever reaching the editor. The Vue twin avoids this by moving focus
  // into the menu; same observable contract.
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      switch (e.key) {
        case 'Escape':
          e.preventDefault();
          e.stopPropagation();
          onClose();
          break;
        case 'ArrowDown':
          e.preventDefault();
          e.stopPropagation();
          setHighlightedIndex((prev) => {
            let next = (prev + 1) % navigableItems.length;
            // Skip disabled items
            while (navigableItems[next]?.disabled && next !== prev) {
              next = (next + 1) % navigableItems.length;
            }
            return next;
          });
          break;
        case 'ArrowUp':
          e.preventDefault();
          e.stopPropagation();
          setHighlightedIndex((prev) => {
            let next = (prev - 1 + navigableItems.length) % navigableItems.length;
            // Skip disabled items
            while (navigableItems[next]?.disabled && next !== prev) {
              next = (next - 1 + navigableItems.length) % navigableItems.length;
            }
            return next;
          });
          break;
        case 'Enter':
          e.preventDefault();
          e.stopPropagation();
          const item = navigableItems[highlightedIndex];
          if (item && !item.disabled) {
            onAction(item.action);
            onClose();
          }
          break;
      }
    };

    document.addEventListener('keydown', handleKeyDown, true);
    return () => document.removeEventListener('keydown', handleKeyDown, true);
  }, [isOpen, highlightedIndex, navigableItems, onAction, onClose]);

  // Reset highlighted index when menu opens
  useEffect(() => {
    if (isOpen) {
      setHighlightedIndex(0);
    }
  }, [isOpen]);

  // Position menu to stay within viewport
  const getMenuStyle = useCallback((): React.CSSProperties => {
    const menuWidth = 220;
    const menuHeight = menuItems.length * 36 + 16;

    let x = position.x;
    let y = position.y;

    if (typeof window !== 'undefined') {
      if (x + menuWidth > window.innerWidth) {
        x = window.innerWidth - menuWidth - 10;
      }
      if (y + menuHeight > window.innerHeight) {
        y = window.innerHeight - menuHeight - 10;
      }
      if (x < 10) x = 10;
      if (y < 10) y = 10;
    }

    return {
      position: 'fixed',
      top: y,
      left: x,
      minWidth: menuWidth,
      background: 'var(--doc-surface)',
      border: '1px solid var(--doc-border-light)',
      borderRadius: '8px',
      boxShadow: '0 2px 10px var(--doc-shadow)',
      zIndex: Z_INDEX.contextMenu,
      padding: '4px 0',
      overflow: 'hidden',
    };
  }, [position, menuItems.length]);

  const handleItemClick = (item: TextContextMenuItem) => {
    if (item.disabled) return;
    onAction(item.action);
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div
      ref={menuRef}
      className={`docx-text-context-menu ${className}`}
      style={getMenuStyle()}
      role="menu"
      // Preserve PM focus/selection: mousedown here must neither move focus
      // nor bubble to the document outside-click closer.
      onMouseDown={(e) => {
        e.preventDefault();
        e.stopPropagation();
      }}
    >
      {menuItems.map((item, index) => {
        // Find the index in navigable items for highlighting
        const navigableIndex = navigableItems.findIndex((ni) => ni === item);

        return (
          <MenuItemComponent
            key={`${item.action}-${index}`}
            item={item}
            onClick={() => handleItemClick(item)}
            isHighlighted={navigableIndex === highlightedIndex}
            onMouseEnter={() => {
              if (navigableIndex >= 0 && !item.disabled) {
                setHighlightedIndex(navigableIndex);
              }
            }}
          />
        );
      })}
    </div>
  );
};

// ============================================================================
// EXPORTS
// ============================================================================

export default TextContextMenu;
