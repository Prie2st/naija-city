import type { City } from '../../shared/types/city';
import { buildingHeight } from './building-art';
import { infrastructureHeight } from './infrastructure-art';
import { modelBuilding } from './model-policy';

export function developedBounds(city: City) {
  const active = city.tiles.filter(t => city.transit?.stops.some(s=>s.tileId===t.y*city.size+t.x) || t.publicFacility || t.building || t.road || t.infrastructure || t.zone || t.progress > 0);
  if (!active.length) return null;
  let left = Infinity, right = -Infinity, top = Infinity, bottom = -Infinity;
  for (const t of active) {
    const x = 840 + (t.x - t.y) * 24, y = (t.x + t.y) * 12;
    const height = t.building ? modelBuilding(t.building)?.visualHeight??buildingHeight(t.building) : t.infrastructure ? infrastructureHeight(t) : 0;
    left = Math.min(left, x - 24); right = Math.max(right, x + 24);
    top = Math.min(top, y - height); bottom = Math.max(bottom, y + 24);
  }
  return { left: left - 65, right: right + 65, top: top - 55, bottom: bottom + 55 };
}

export function cityFraming(city: City, width: number, height: number) {
  const bounds = developedBounds(city), mobile = width < 600;
  const top = mobile ? 230 : 150, bottom = mobile ? 190 : 120;
  const availableHeight = Math.max(140, height - top - bottom);
  if (!bounds) return { x: 840, y: 355, zoom: mobile ? 0.9 : Math.min(1.15, Math.max(0.6, width / 1250)) };
  const zoom = Math.max(0.12, Math.min(2.1, (width - (mobile ? 45 : 120)) / (bounds.right - bounds.left), availableHeight / (bounds.bottom - bounds.top)));
  // Centre the settlement in the unobstructed space between the HUD and toolbar.
  return { x: (bounds.left + bounds.right) / 2, y: (bounds.top + bounds.bottom) / 2 - (top - bottom) / (2 * zoom), zoom };
}
