// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from 'vitest';
import { tools, toolHref, type Tool } from '../content/tools';

describe('tool navigation contract', () => {
  it('keeps routes unique and relative so palette destinations cannot inject script URLs', () => {
    expect(new Set(tools.map(tool => tool.slug)).size).toBe(tools.length);
    for (const tool of tools) {
      expect(tool.href).toMatch(/^\/[a-z0-9-]+$/);
      expect(tool.repoPath).toMatch(/^packages\/[a-z0-9-]+$/);
    }
  });
  it('does not send visitors to missing pages for planned tools', () => {
    const tool: Tool = { slug: 'test', name: 'Test', tagline: 'Test', status: 'planned', href: '/test', repoPath: 'packages/test' };
    expect(toolHref(tool)).toBe('https://github.com/zkasuran/flop-lab/tree/main/packages/test');
    expect(toolHref({ ...tool, status: 'alpha' })).toBe('/test');
    expect(toolHref({ ...tool, status: 'live' })).toBe('/test');
  });
});
