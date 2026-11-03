/**
 * Floating layer test hooks: page/cell floating items expose wrapType/wrapText
 * so directed e2e can distinguish square/tight/through/behind without
 * parsing positions. Visual rendering is unchanged.
 */
import { GlobalRegistrator } from '@happy-dom/global-registrator';
import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { renderFloatingImagesLayer } from '../floatingImageLayer';

beforeAll(() => {
  GlobalRegistrator.register();
});

afterAll(() => {
  GlobalRegistrator.unregister();
});

describe('renderFloatingImagesLayer dataset hooks', () => {
  test('exposes wrapType/wrapText on floating items', () => {
    const layer = renderFloatingImagesLayer(
      [
        {
          src: 'data:image/png;base64,synthetic',
          width: 100,
          height: 80,
          x: 0,
          y: 0,
          wrapType: 'tight',
          wrapText: 'bothSides',
        },
      ],
      document,
      {
        layerClass: 'layout-floating-images-layer',
        itemClass: 'layout-page-floating-image',
        sizing: 'inset0',
        layerMode: 'front',
      }
    );
    const item = layer.querySelector('.layout-page-floating-image') as HTMLElement | null;
    expect(item).not.toBeNull();
    expect(item?.dataset.wrapType).toBe('tight');
    expect(item?.dataset.wrapText).toBe('bothSides');
  });

  test('front layer keeps z-index 10, behind layer keeps DOM order', () => {
    const front = renderFloatingImagesLayer(
      [{ src: 'x', width: 10, height: 10, x: 0, y: 0 }],
      document,
      {
        layerClass: 'layout-floating-images-layer',
        itemClass: 'layout-page-floating-image',
        sizing: 'inset0',
        layerMode: 'front',
      }
    );
    const behind = renderFloatingImagesLayer(
      [{ src: 'x', width: 10, height: 10, x: 0, y: 0 }],
      document,
      {
        layerClass: 'layout-floating-images-layer',
        itemClass: 'layout-page-floating-image',
        sizing: 'inset0',
        layerMode: 'behind',
      }
    );
    expect(front.style.zIndex).toBe('10');
    expect(behind.style.zIndex).toBe('');
  });
});
