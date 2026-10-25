import { describe, it, expect } from 'vitest';
import { getAssetUrl } from '../core/paths';

describe('Cross-Platform Path Resolution', () => {
  it('correctly prepends base URL for public assets', () => {
    const url = getAssetUrl('wasm/vision_wasm_internal.wasm');
    expect(url).toContain('wasm/vision_wasm_internal.wasm');
    expect(url.startsWith('/')).toBe(true);
  });

  it('handles paths with leading slash cleanly', () => {
    const url1 = getAssetUrl('audio/notice.wav');
    const url2 = getAssetUrl('/audio/notice.wav');
    expect(url1).toBe(url2);
  });
});
