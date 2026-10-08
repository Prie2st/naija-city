import { Bot, STRATEGIES } from './bot';
import { applyTool } from '../../shared/simulation/engine';
import { updateInfrastructure } from '../../shared/simulation/infrastructure';
const bot = new Bot(STRATEGIES.dense, 731); bot.run(360 * 5);
const c = bot.city; c.treasury = 5e9;
const avg = () => { const b = c.tiles.filter(t => t.building); return [b.reduce((s, t) => s + t.services.powerCoverage, 0) / b.length, b.reduce((s, t) => s + t.services.powerReliability, 0) / b.length, c.infrastructure.power.supply, c.infrastructure.power.demand].map(v => +v.toFixed(1)); };
console.log('subs', c.tiles.filter(t => t.infrastructure?.kind === 'substation').length, 'coverage/reliability/supply/demand', avg());
let added = 0;
for (const t of c.tiles) if (!t.building && !t.road && !t.zone && !t.infrastructure && !t.publicFacility && t.terrain !== 'water' && t.terrain !== 'wetland' && Math.hypot(t.x - 13, t.y - 13) < 9 && added < 10) { applyTool(c, t.x, t.y, 'substation'); added++; }
for (let i = 0; i < 3; i++) applyTool(c, 0, 20 + i, 'gas');
updateInfrastructure(c, false);
console.log('after +', added, 'substations and +75MW gas', avg());
