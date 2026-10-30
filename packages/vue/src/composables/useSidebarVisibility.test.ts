import { describe, test, expect } from 'bun:test';
import { ref } from 'vue';
import { useSidebarVisibility } from './useSidebarVisibility';

describe('useSidebarVisibility.handleToggleSidebar', () => {
  test('opening seeds fresh data, closing does not', () => {
    let seeds = 0;
    const showSidebar = ref(false);
    const { handleToggleSidebar } = useSidebarVisibility({
      showSidebar,
      extractCommentsAndChanges: () => {
        seeds += 1;
      },
    });

    handleToggleSidebar();
    expect(showSidebar.value).toBe(true);
    expect(seeds).toBe(1);

    handleToggleSidebar();
    expect(showSidebar.value).toBe(false);
    expect(seeds).toBe(1);
  });
});
