"""Pack independent Lab masters; generate reusable footprint/contact shadows.

Run with Python + Pillow after render_visual_lab.py. No production atlas is changed.
"""
import json
import math
from pathlib import Path
from PIL import Image, ImageDraw, ImageFilter, ImageEnhance

ROOT=Path(__file__).resolve().parents[2]
SRC=ROOT/'art/visual-lab/masters'
OUT=ROOT/'public/assets/visual-lab'
DOC=ROOT/'docs/visual-lab'
TIERS=(2,6,9,12)


def power2(n):return 2**math.ceil(math.log2(max(64,n)))


def shadow(meta):
  w,d=meta['footprint'];h=meta['heightMetres'];scale=24
  # Shared sunlight vector; footprint extrusion follows height instead of a circular blob.
  # Tree footprints follow a ragged crown, not a square contact patch.
  if meta['type']=='tree':
    corners=[(math.cos(n*math.tau/24)*w*.68*(.85+.15*math.sin(n*2.7)),
      math.sin(n*math.tau/24)*d*.68*(.85+.15*math.sin(n*2.7))) for n in range(24)]
  else:corners=[(-w/2,-d/2),(w/2,-d/2),(w/2,d/2),(-w/2,d/2)]
  projection=lambda x,y:((x-y)*1.2,(x+y)*.6)
  contact=[projection(x,y) for x,y in corners]
  shift=(h*.39,h*.12)
  cast=[projection(x+shift[0],y+shift[1]) for x,y in corners]
  points=contact+cast
  # Convex hull encloses the projected footprint and sunlight extrusion.
  points=sorted(set(points))
  cross=lambda o,a,b:(a[0]-o[0])*(b[1]-o[1])-(a[1]-o[1])*(b[0]-o[0])
  lower=[];upper=[]
  for p in points:
    while len(lower)>=2 and cross(lower[-2],lower[-1],p)<=0:lower.pop()
    lower.append(p)
  for p in reversed(points):
    while len(upper)>=2 and cross(upper[-2],upper[-1],p)<=0:upper.pop()
    upper.append(p)
  hull=lower[:-1]+upper[:-1]
  minx=min(x for x,y in hull)-2;maxx=max(x for x,y in hull)+2
  miny=min(y for x,y in hull)-2;maxy=max(y for x,y in hull)+2
  size=(math.ceil((maxx-minx)*scale),math.ceil((maxy-miny)*scale))
  alpha=Image.new('L',size)
  coords=lambda ps:[((x-minx)*scale,(y-miny)*scale) for x,y in ps]
  if meta['type']=='tree':
    ImageDraw.Draw(alpha).polygon(coords(cast),fill=52)
  else:ImageDraw.Draw(alpha).polygon(coords(hull),fill=44 if meta['type']=='building' else 32)
  alpha=alpha.filter(ImageFilter.GaussianBlur(scale*.28))
  ao=Image.new('L',size)
  if meta['type']=='tree':
    ox,oy=-minx*scale,-miny*scale
    ImageDraw.Draw(ao).ellipse((ox-scale*.16,oy-scale*.08,ox+scale*.16,oy+scale*.08),fill=58)
  else:ImageDraw.Draw(ao).polygon(coords(contact),fill=66)
  ao=ao.filter(ImageFilter.GaussianBlur(scale*.12))
  from PIL import ImageChops
  alpha=ImageChops.lighter(alpha,ao)
  image=Image.new('RGBA',size,(36,40,34));image.putalpha(alpha)
  new=dict(meta,id=meta['id']+'-shadow',type='shadow',sourceScale=24,originPixels=[-minx*scale,-miny*scale])
  return new,image


def build():
  OUT.mkdir(parents=True,exist_ok=True);DOC.mkdir(parents=True,exist_ok=True)
  inputs=[]
  for path in sorted(SRC.glob('*.json')):
    meta=json.loads(path.read_text(encoding='utf8'))
    image=Image.open(path.with_suffix('.png')).convert('RGBA')
    alpha=image.getchannel('A')
    if meta['type']=='tree':
      image=ImageEnhance.Color(ImageEnhance.Brightness(image.convert('RGB')).enhance(.78)).enhance(1.15).convert('RGBA')
    else:
      image=image.point(lambda value:max(0,min(255,round((value-18)*255/237))))
    image.putalpha(alpha)
    inputs.append((meta,image))
    if meta['type'] in ['building','infrastructure','tree','vehicle']:inputs.append(shadow(meta))
  assets=[];pictures={}
  for meta,image in inputs:
    bounds=image.getbbox()
    if not bounds:raise ValueError('Empty asset '+meta['id'])
    master=list(image.size);image=image.crop(bounds);scale=meta['sourceScale']
    ox,oy=meta.pop('originPixels')
    anchor=[(ox-bounds[0])/image.width,(oy-bounds[1])/image.height]
    asset=dict(meta,anchor=anchor,worldWidth=image.width/scale,worldHeight=image.height/scale,masterSize=master)
    assets.append(asset);pictures[asset['id']]=image
  sheets={};locations={}
  for tier in TIERS:
    groups={}
    for a in assets:
      p=pictures[a['id']];size=(max(1,round(p.width/a['sourceScale']*tier)),max(1,round(p.height/a['sourceScale']*tier)))
      if max(size)>2044:raise ValueError('Asset exceeds atlas '+a['id'])
      if size[0]>p.width or size[1]>p.height:raise ValueError('Upscaling '+a['id'])
      groups.setdefault(a['type'],[]).append((a,p.resize(size,Image.Resampling.LANCZOS)))
    sheets[tier]=[];locations[tier]={}
    for group,items in groups.items():
      size=512 if tier==2 else 2048;pages=[]
      for a,p in sorted(items,key=lambda pair:pair[1].height,reverse=True):
        w,h=p.size;page=None
        for c in pages:
          x,y,row=c['x'],c['y'],c['row']
          if x+w+4>size:x,y,row=0,y+row,0
          if y+h+4<=size:page=c;page.update(x=x,y=y,row=row);break
        if page is None:
          page={'image':Image.new('RGBA',(size,size)),'x':0,'y':0,'row':0,'frames':{},'right':0,'bottom':0};pages.append(page)
        x,y=page['x']+2,page['y']+2
        page['image'].paste(p,(x,y))
        for rect,dest,sz in [((0,0,1,h),(x-2,y),(2,h)),((w-1,0,w,h),(x+w,y),(2,h)),((0,0,w,1),(x,y-2),(w,2)),((0,h-1,w,h),(x,y+h),(w,2))]:
          page['image'].paste(p.crop(rect).resize(sz),dest)
        page['frames'][a['id']]={'frame':{'x':x,'y':y,'w':w,'h':h},'rotated':False,'trimmed':False,'spriteSourceSize':{'x':0,'y':0,'w':w,'h':h},'sourceSize':{'w':w,'h':h}}
        page['x']+=w+4;page['row']=max(page['row'],h+4)
        page['right']=max(page['right'],x+w+2);page['bottom']=max(page['bottom'],y+h+2)
      for n,page in enumerate(pages):
        key=f'lab-{group}-{tier}-{n}';width=power2(page['right']);height=power2(page['bottom'])
        page['image'].crop((0,0,width,height)).save(OUT/(key+'.png'),optimize=True)
        (OUT/(key+'.json')).write_text(json.dumps({'frames':page['frames'],'meta':{'image':key+'.png','size':{'w':width,'h':height}}},separators=(',',':')),encoding='utf8')
        sheets[tier].append({'key':key,'width':width,'height':height})
        for frame in page['frames']:locations[tier][frame]=key
    print(tier,len(sheets[tier]),'pages',round(sum(s['width']*s['height']*4/1048576 for s in sheets[tier]),1),'MiB')
  (OUT/'manifest.json').write_text(json.dumps({'assets':assets,'sheets':sheets,'locations':locations},indent=2),encoding='utf8')
  buildings=[a for a in assets if a['type']=='building']
  contact=Image.new('RGB',(1800,math.ceil(len(buildings)/4)*620),'#e6e7e1');pen=ImageDraw.Draw(contact)
  for i,a in enumerate(buildings):
    p=pictures[a['id']].copy();p.thumbnail((420,555),Image.Resampling.LANCZOS);x=i%4*450;y=i//4*620
    contact.paste(p,(x+(450-p.width)//2,y+560-p.height),p);pen.text((x+18,y+580),a['id']+' / '+str(a['floors'])+' floors',fill='#29302c')
  contact.save(DOC/'source-library.jpg',quality=95)


if __name__=='__main__':build()
