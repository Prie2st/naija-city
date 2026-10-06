import { describe, expect, it } from 'vitest';
import { applyTool, createCity, previewTool, tileAt } from '../shared/simulation/engine';
import type { Tool } from '../shared/types/city';

describe('terrain and placement presentation contracts', () => {
  it('generates repeatable groves from the city seed and keeps open expansion areas', () => {
    const a = createCity(0, 731), b = createCity(0, 731), c = createCity(0, 999);
    expect(a.tiles).toEqual(b.tiles);
    expect(a.tiles.map(t => t.terrain)).not.toEqual(c.tiles.map(t => t.terrain));
    const trees = a.tiles.filter(t => t.terrain === 'vegetation');
    expect(trees.length).toBeGreaterThan(25);
    expect(trees.length).toBeLessThan(500);
    const clustered = trees.filter(t => [[1, 0], [-1, 0], [0, 1], [0, -1]].filter(([dx, dy]) => tileAt(a, t.x + dx, t.y + dy)?.terrain === 'vegetation').length >= 2);
    expect(clustered.length / trees.length).toBeGreaterThan(0.8);
    expect(a.tiles.filter(t => t.road || t.building).every(t => t.terrain === 'land')).toBe(true);
  });
  it('previews construction without modifying the city and matches committed costs', () => {
    for (const tool of ['road', 'residential', 'commercial', 'industrial'] as Tool[]) {
      const c = createCity(0), before = JSON.stringify(c);
      const preview = previewTool(c, 10, 10, tool);
      expect(preview.status).toBe('valid'); expect(JSON.stringify(c)).toBe(before);
      applyTool(c, 10, 10, tool); expect(c.treasury).toBe(500000000 - preview.cost);
      expect(previewTool(c, 10, 10, tool).status).toBe('unchanged');
    }
  });
  it('previews invalid terrain, occupied tiles, and insufficient funds', () => {
    const c = createCity(0);
    for (const [x, y] of [[31, 0], [12, 10]]) {
      const preview = previewTool(c, x, y, 'road');
      expect(preview.status).toBe('invalid'); expect(applyTool(c, x, y, 'road')).toBe(preview.reason);
    }
    c.treasury = 0;
    expect(previewTool(c, 10, 10, 'commercial').reason).toContain('low');
    expect(previewTool(c, -1, 0, 'road').status).toBe('invalid');
  });
  it('clears vegetation when land is occupied by roads or zoning', () => {
    for (const tool of ['road', 'residential'] as Tool[]) {
      const c = createCity(0), t = c.tiles.find(t => t.terrain === 'vegetation')!;
      applyTool(c, t.x, t.y, tool); expect(t.terrain).toBe('land');
    }
  });
});
