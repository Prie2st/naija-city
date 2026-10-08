import { advance, applyTool, createCity, tileAt } from '../../shared/simulation/engine';
import { decodeCity } from '../../shared/simulation/save-format';
const c = createCity(0);
applyTool(c, 10, 19, 'gas'); applyTool(c, 11, 19, 'treatment'); applyTool(c, 13, 19, 'substation'); applyTool(c, 19, 19, 'substation');
applyTool(c, 13, 21, 'channel'); applyTool(c, 20, 21, 'channel');
for (let x = 5; x <= 22; x++) { applyTool(c, x, 21, 'road'); if (!tileAt(c, x, 20)!.road) applyTool(c, x, 20, x <= 14 ? 'residential' : x <= 18 ? 'commercial' : 'industrial'); }
advance(c, 30);
const b = decodeCity(JSON.parse(JSON.stringify(c)))!;
function diff(x: any, y: any, path: string, out: string[]) {
  if (out.length > 15) return;
  if (typeof x !== typeof y) { out.push(`${path}: ${JSON.stringify(x)?.slice(0,80)} vs ${JSON.stringify(y)?.slice(0,80)}`); return; }
  if (x && typeof x === 'object') { for (const k of new Set([...Object.keys(x), ...Object.keys(y ?? {})])) diff(x[k], y?.[k], `${path}.${k}`, out); return; }
  if (x !== y && !(Number.isNaN(x) && Number.isNaN(y))) out.push(`${path}: ${x} vs ${y}`);
}
const d0: string[] = []; diff(c, b, 'city', d0); console.log('after decode', d0);
for (let i = 0; i < 240; i++) { advance(c, 1); advance(b, 1); const d: string[] = []; diff(c, b, 'city', d); if (d.length) { console.log('tick', c.tick, d); break; } }
