// Presentation fixtures only. A group is a visual composition, not a city entity.
export type DistrictId = 'low' | 'estate' | 'urban' | 'mixed' | 'boulevard';
export type CameraPreset = 'city' | 'district' | 'block' | 'street';
export interface LabObject {
  id: string;
  asset: string;
  x: number;
  y: number;
  scale: number;
  district: DistrictId;
  group: string;
  detail: 'major' | 'medium' | 'close';
}
export interface Road {
  id: string;
  axis: 'x' | 'y';
  at: number;
  from: number;
  to: number;
  kind: 'local' | 'avenue' | 'boulevard';
}
export interface Surface {
  x: number; y: number; w: number; d: number;
  kind: 'paving' | 'grass' | 'earth' | 'parking' | 'path' | 'play' | 'planting';
}
export const WORLD_SCALE = {
  metresPerLogicalTile: 20,
  laneWidth: 3.1,
  localCarriageway: 6.4,
  avenueCarriageway: 12.4,
  boulevardCarriageway: 21.4,
  boulevardMedian: 2.8,
  sidewalkWidth: 2.4,
  parkingBay: { width: 2.6, length: 5.2 },
  sedan: { length: 4.6, width: 1.8 },
} as const;

export const districts: Record<DistrictId, { title: string; note: string; center: [number, number]; bounds: [number, number, number, number] }> = {
  low: { title: 'A · Compound street', note: 'Detached homes, planted yards and narrow local roads.', center: [62,222], bounds: [9,182,117,258] },
  estate: { title: 'B · Residential estate', note: 'Terraces, shared gardens and connected pedestrian paths.', center: [66,99], bounds: [9,36,117,174] },
  urban: { title: 'C · Courtyard district', note: 'Eight 6–12-storey blocks, courts, parking and a continuous public realm.', center: [235,108], bounds: [147,35,313,174] },
  mixed: { title: 'D · Mixed-use street', note: 'Retail podiums, upper floors, paved frontage and a civic plaza.', center: [235,226], bounds: [147,182,313,258] },
  boulevard: { title: 'E · Urban boulevard', note: 'Six lanes, a planted median, sidewalks and properly scaled transport.', center: [132,132], bounds: [117,12,147,268] },
};

export function projectMetres(x: number, y: number, z = 0) {
  return { x: (x-y)*1.2, y: (x+y)*.6-z*Math.sqrt(2.16) };
}

// Future production composition can use this without adding population entities.
export function densityComposition(level: number) {
  return [
    { structures: 2, form: 'compound' },
    { structures: 3, form: 'terraces' },
    { structures: 2, form: 'low-rise' },
    { structures: 3, form: 'mid-rise-estate' },
    { structures: 4, form: 'urban-complex' },
  ][Math.max(0,Math.min(4,Math.floor(level)-1))];
}

export function createComposition() {
  const objects: LabObject[] = [];
  const surfaces: Surface[] = [];
  const add = (asset: string, x: number, y: number, district: DistrictId, detail: LabObject['detail']='major', scale=1, group= district+'-public-realm') => {
    const item: LabObject = { id: `${district}-${asset}-${objects.length}`, asset, x,y,scale,district,detail,group };
    objects.push(item); return item;
  };
  const ground = (x: number,y: number,w: number,d: number,kind: Surface['kind']) => surfaces.push({x,y,w,d,kind});
  const parking = (x: number,y: number,count: number,district: DistrictId) => {
    ground(x+(count-1)*1.3,y,count*2.6+1.6,7,'parking');
    for(let i=0;i<count;i++) if(i%4!==2)add(i%3===0?'suv-1':'sedan-1',x+i*2.6,y,district,'medium');
  };
  const tree = (x: number,y: number,district: DistrictId,kind='shade-tree',scale=1) => add(kind,x,y,district,'medium',scale);
  const lamp = (x: number,y: number,district: DistrictId) => add('lamp',x,y,district,'medium');
  // Dense block is explicitly composed; there are no simulation or tile-sized empty plots.
  ground(230,105,168,139,'paving');
  const dense: [string,number,number][] = [
    ['linear-6',176,56],['l-block-8',231,61],['tower-10',287,62],
    ['setback-12',287,109],['linear-6',266,150],['l-block-8',226,145],
    ['tower-10',174,145],['u-block-8',174,106],
  ];
  for(const [asset,x,y] of dense)add(asset,x,y,'urban','major',1,'urban-courtyard-complex');
  // Courtyard paths run between entrances instead of arbitrary rectangles of grass.
  ground(225,106,55,42,'grass');
  ground(225,104,55,3.2,'path');ground(222,106,3.2,42,'path');
  ground(237,110,3.2,30,'path');ground(227,119,32,2.4,'path');
  ground(207,93,12,10,'planting');ground(240,91,14,10,'planting');
  ground(233,112,12,8,'play');
  for(const [x,y] of [[204,90],[212,96],[243,90],[247,98],[204,113],[213,123],[243,121],[254,107]])tree(x,y,'urban','shade-tree',.9);
  for(const [x,y] of [[218,100],[226,100],[225,120],[240,116]])add('bench',x,y,'urban','close');
  parking(193,74,8,'urban');parking(251,129,10,'urban');parking(187,159,5,'urban');
  ground(303,104,9,104,'path');ground(231,167,156,3.2,'path');
  ground(231,40,156,3.2,'path');ground(151,102,3.2,118,'path');
  for(let x=155;x<310;x+=15){tree(x,40,'urban','street-tree',.95);tree(x,168,'urban','street-tree',1.05);}
  for(let y=48;y<164;y+=19){tree(308,y,'urban','street-tree');lamp(312,y+7,'urban');}
  for(let x=156;x<305;x+=27){lamp(x,37,'urban');lamp(x,172,'urban');}
  // Service yard sits outside the courtyard; utilities remain separate addressable elements.
  ground(282,85,20,10,'paving');add('substation',282,84,'urban','medium',.55);
  add('water-tower',299,143,'urban','major');ground(299,143,12,12,'paving');

  // Medium estate: repeated terraces create streets and courts rather than isolated icons.
  ground(65,103,99,124,'paving');
  for(const [x,y] of [[39,58],[82,58],[39,112],[82,112]])add('terrace-2',x,y,'estate','major',1,'estate-terraces');
  add('linear-6',72,151,'estate','major',.85,'estate-apartments');
  for(const y of [83,132]){
    ground(64,y,78,22,'grass');ground(64,y,78,2.4,'path');
    for(const x of [28,48,76,96])tree(x,y+5,'estate','shade-tree',.84);
  }
  ground(64,100,3,116,'path');parking(25,72,8,'estate');parking(76,72,8,'estate');
  for(const x of [18,112])for(let y=48;y<166;y+=21){tree(x,y,'estate','street-tree');lamp(x,y+9,'estate');}
  for(const [x,y] of [[55,85],[69,85],[56,132]])add('bench',x,y,'estate','close');

  // Lower density still uses one house family; this task does not add bungalow variants.
  for(const y of [196,244])for(const x of [27,54,81,108]){
    const group=`compound-${x}-${y}`;
    ground(x,y,23,25,'earth');ground(x-6,y+2,7,17,'grass');ground(x+6,y+6,4.2,12,'paving');
    add('bungalow',x,y-2,'low','major',1,group);
    add('gate',x+6,y+(y<220?14:-14),'low','close',1,group);
    tree(x-7,y+7,'low',x===81?'palm':'shade-tree',.75);
    if(x%3===0)add('sedan-1',x+6,y+6,'low','medium',1,group);
  }
  for(let x=20;x<117;x+=22){tree(x,226,'low','street-tree');lamp(x,214,'low');}

  // Commercial frontages address a connected street and a landscaped plaza.
  ground(231,226,167,76,'paving');
  for(const x of [171,221,276])add('mixed-6',x,208,'mixed','major',1,'mixed-use-frontage');
  ground(223,248,74,16,'grass');ground(223,248,74,3.5,'path');
  for(const x of [191,207,230,251]){tree(x,250,'mixed','shade-tree',.94);add('bench',x+4,245,'mixed','close');}
  parking(155,246,10,'mixed');parking(272,246,11,'mixed');
  for(let x=155;x<308;x+=15){tree(x,230,'mixed','street-tree');lamp(x+5,234,'mixed');}

  // Formal boulevard landscaping and vehicle scale exhibition.
  for(let y=14;y<265;y+=15){
    if([32,178,220].some(j=>Math.abs(y-j)<15))continue;
    tree(132,y,'boulevard','street-tree',.76);
    tree(116,y,'boulevard','shade-tree',.9);tree(148,y,'boulevard','shade-tree',.9);
    lamp(120,y+6,'boulevard');lamp(144,y+6,'boulevard');
  }
  for(const [asset,x,y] of [
    ['sedan-1',125.95,83],['suv-3',138.05,96],['keke-1',122.85,114],
    ['danfo-1',129.05,145],['bus-3',134.95,198],['okada-1',125.95,245],
    ['sedan-0',200,178],['danfo-0',255,178],['keke-0',71,220],
  ] as [string,number,number][])add(asset,x,y,'boulevard','medium');
  // Wild land is confined to the perimeter. Planned urban vegetation is separately composed.
  for(let i=0;i<20;i++){
    const x=-8+(i*17)%124,y=5+(i*7)%17;
    tree(x,y,'estate',i%4===0?'palm':'mature-tree',.65+(i%5)*.08);
  }
  const roads: Road[] = [
    {id:'boulevard',axis:'y',at:132,from:8,to:272,kind:'boulevard'},
    {id:'north-street',axis:'x',at:32,from:8,to:318,kind:'local'},
    {id:'south-avenue',axis:'x',at:178,from:8,to:318,kind:'avenue'},
    {id:'compound-street',axis:'x',at:220,from:8,to:318,kind:'local'},
    {id:'west-street',axis:'y',at:8,from:32,to:268,kind:'local'},
    {id:'east-street',axis:'y',at:318,from:32,to:268,kind:'local'},
  ];
  return {objects,surfaces,roads};
}

export function cameraFrame(district: DistrictId, preset: CameraPreset, width: number, height: number) {
  const d=districts[district];
  if(preset==='city')return {x:8,y:6,w:310,d:264,zoom:undefined};
  if(preset==='district')return {x:d.bounds[0],y:d.bounds[1],w:d.bounds[2]-d.bounds[0],d:d.bounds[3]-d.bounds[1],zoom:undefined};
  // These presets only position the developer camera; production Home/zoom are unchanged.
  const close=district==='urban'?[176,106]:d.center;
  return {x:close[0]-25,y:close[1]-20,w:50,d:40,zoom:preset==='street'?(width<600?4:5.3):(width<600?2:3)};
}
