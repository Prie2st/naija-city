"""Visual Lab: independent architectural-model masters, in metres.

Blender 4.4 --background --factory-startup --python tools/art/render_visual_lab.py
All detail is baked offline. Nothing here imports or changes simulation rules.
"""
import bpy
import math
import random
import json
import sys
from pathlib import Path
from mathutils import Vector
from bpy_extras.object_utils import world_to_camera_view

sys.path.insert(0, str(Path(__file__).parent))
import render_models as m

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / 'art/visual-lab/masters'
OUT.mkdir(parents=True, exist_ok=True)
PPM = 48 / (20 * math.sqrt(2)) * 24


def setup():
  m.setup()
  s = bpy.context.scene
  s.eevee.taa_render_samples = 48
  s.view_settings.look = 'AgX - Medium High Contrast'
  s.view_settings.exposure = .45
  s.world.node_tree.nodes['Background'].inputs[1].default_value = .65
  for name, color, rough, metal in [
    ('model-white', (.82,.82,.79), .75, 0),
    ('render', (.66,.65,.60), .82, 0),
    ('stone', (.46,.46,.43), .8, 0),
    ('facade-dark', (.115,.13,.135), .55, .05),
    ('recess', (.035,.055,.064), .7, 0),
    ('glazing', (.17,.25,.28), .25, .32),
    ('glazing-light', (.38,.44,.45), .3, .25),
    ('rail', (.25,.28,.29), .42, .45),
    ('terrace', (.49,.48,.43), .9, 0),
    ('plant-dark', (.09,.19,.08), .95, 0),
    ('plant-mid', (.17,.29,.12), .95, 0),
    ('plant-light', (.26,.35,.16), .95, 0),
    ('plant-fresh', (.32,.39,.21), .95, 0),
    ('silver-body', (.48,.51,.52), .28, .5),
    ('cream-body', (.81,.80,.73), .3, .28),
    ('rubber', (.026,.03,.03), .9, 0),
    ('orange-body', (.7,.46,.12), .42, .18),
    ('lamp', (.82,.79,.65), .32, .1),
  ]:
    m.material(name, color, rough, metal)


def slab(x,y,z,w,d,mat='model-white',h=.18):
  return m.box(x,y,z,w,d,h,mat,.018)


def facade(x,y,w,floors,side=False,balconies=True,dark=False):
  """True openings: continuous spandrels, piers and recessed glazing.

  The wall is NOT a solid cuboid with windows painted on top.
  """
  count = max(2,round(w/3.15))
  bay = w/count
  wall = 'facade-dark' if dark else 'model-white'
  def b(u,v,z,ww,dd,hh,mat,bevel=.01):
    return m.box(x+(v if side else u), y+(u if side else v), z,
      dd if side else ww, ww if side else dd, hh,mat,bevel)
  for f in range(floors):
    z=f*3.15+.22
    b(0,0,z,w,.3,.86,wall)
    b(0,0,z+2.85,w,.3,.3,wall)
    for n in range(count+1):
      u=-w/2+n*bay
      b(u,0,z+.85,.34,.35,2,wall)
    for n in range(count):
      u=-w/2+(n+.5)*bay
      bw=bay-.38
      b(u,-.22,z+.9,bw,.09,1.85,'recess')
      b(u,-.16,z+1,bw-.18,.05,1.63,'glazing-light' if (n+f)%5==0 else 'glazing')
      b(u,-.07,z+.98,.055,.07,1.7,'rail')
      for dz in [.97,2.68]:b(u,-.05,z+dz,bw,.08,.06,'rail')
      # Alternate recessed loggias and projecting balconies, with shade and rails.
      if balconies and n%3!=1:
        b(u,.5,z+.75,bay-.2,1.4,.16,'stone')
        b(u,1.15,z+.93,bay-.3,.10,.76,wall)
        b(u,1.15,z+1.69,bay-.24,.12,.055,'rail')
        for uu in [u-bay/2+.18,u+bay/2-.18]:
          b(uu,.5,z+.92,.1,1.32,.84,wall)
      elif f>0:
        b(u,.16,z+.87,bw+.12,.42,.11,'render')
  # Roof lip, plinth and vertical facade rhythm.
  b(0,.06,0,w,.52,.22,'stone')
  b(0,.02,floors*3.15,w+.25,.45,.62,wall)
  for n in range(0,count+1,3):
    b(-w/2+n*bay,.07,.2,.3,.48,floors*3.15,'stone' if not dark else 'render')


def wing(x,y,w,d,floors,balconies=True,dark=False):
  h=floors*3.15
  # The inside core stops short of apertures, making dimensional window recesses.
  m.box(x,y,0,w-.9,d-.9,h,'recess',0)
  slab(x,y,0,w+.35,d+.35,'stone',.16)
  for f in range(1,floors+1):slab(x,y,f*3.15-.16,w,d,'render',.16)
  facade(x,y+d/2,w,floors,False,balconies,dark)
  facade(x+w/2,y,d,floors,True,balconies,dark)
  # Rear faces are solid with service ribbons; opposite side exposed in court assets.
  m.box(x,y-d/2,0,w,.3,h,'render',0)
  m.box(x-w/2,y,0,.3,d,h,'render',0)
  slab(x,y,h,w-.3,d-.3,'facade-dark',.18)
  slab(x-w*.12,y-d*.16,h+.18,w*.25,d*.25,'stone',1.5)
  for xx in [-w*.32,w*.33]:
    slab(x+xx,y-d*.25,h+.2,1.4,1.8,'rail',.55)
    for i in range(4):slab(x+xx,y-d*.25-.55+i*.34,h+.76,1.35,.12,'model-white',.05)


def entrance(x,y,w=3.3):
  m.box(x,y,.18,w,.32,2.7,'glazing',.01)
  for xx in [x-w/2,x,x+w/2]:m.box(xx,y+.2,.15,.09,.1,2.8,'rail',0)
  slab(x,y+1,2.9,w+1.4,3,'model-white',.2)
  for xx in [x-w/2-.35,x+w/2+.35]:m.box(xx,y+1.9,0,.18,.18,2.9,'stone')
  slab(x,y+.9,0,w+1.1,2.6,'terrace',.12)
  slab(x,y+2.45,0,w+.8,.55,'stone',.07)


def linear():
  wing(0,0,33,12,6,True)
  wing(-4,-9,6,6,6,False,True)
  entrance(6,6)
  # Side circulation stair with recessed landing glazing.
  for f in range(6):
    m.box(16.7,-3,f*3.15+.7,.35,1.7,2,'glazing-light',0)


def lblock():
  wing(-8,-8,34,12,8,True)
  wing(-19,7,12,19,8,True,True)
  entrance(1,-2)
  # Extended parapet defines a real L plan; roof terrace has transparent rails.
  for x in [-13,-2,8]:m.box(x,-3,25.5,2,.15,.6,'rail',0)


def ublock():
  wing(-11,0,12,34,8,True,True)
  wing(4,-12,20,10,8,True)
  wing(4,12,20,10,8,True)
  entrance(-5,0,3)


def tower():
  wing(-2,0,17,19,10,True)
  wing(8,-4,6,10,10,False,True)
  entrance(-2,9.5)
  # A lower entrance pavilion and recessed service mass avoid one tall cuboid.
  wing(-6,11,8,4,1,False,True)


def stepped():
  wing(0,0,26,17,9,True)
  before=set(bpy.context.scene.objects)
  wing(-2,-1,21,13,2,True,True)
  for o in set(bpy.context.scene.objects)-before:o.location.z+=9*3.15
  before=set(bpy.context.scene.objects)
  wing(-3,-2,15,9,1,False)
  for o in set(bpy.context.scene.objects)-before:o.location.z+=11*3.15
  entrance(3,8.5)


def terrace():
  for i,x in enumerate([-9,0,9]):
    wing(x,0,8.2,10,2,True,i==1)
    entrance(x,5,1.5)
    m.roof(x,-1,7.6,8,6.6,1.3,'zinc')


def bungalow():
  m.box(-2,-1,0,10,8,3.2,'model-white')
  m.box(4,1,0,4,7,3.2,'render')
  m.roof(-2,-1,10,8,3.25,1.7,'zinc')
  m.roof(4,1,4,7,3.3,1.3,'roof')
  for x in [-5,-1]:m.window(x,3,.95,1.7,1.35)
  for y in [-1,2]:m.window(6,y,.95,1.4,1.35,True)
  entrance(2,4.5,1.4)
  slab(-2,4,0,7,2,'terrace',.12)
  for x in [-5,1]:m.box(x,4.7,0,.17,.17,3,'model-white')
  slab(-2,4,3.05,7.4,2.4,'render',.15)


def mixed():
  wing(0,-2,32,14,6,False)
  wing(-11,0,6,18,6,False,True)
  # Glazed retail podium, articulated awnings, framed storefronts.
  for n in range(6):
    x=-12.5+n*5
    m.box(x,6,.2,4.5,.22,3.2,'glazing',.01)
    slab(x,7,3.55,4.7,3,'facade-dark',.17)
    m.box(x,6.3,2.7,4,.13,.5,'wood',0)
    for dx in [-2,0,2]:m.box(x+dx,6.2,.2,.07,.13,2.5,'model-white',0)
  entrance(12,7,2)


def tree(kind):
  rng=random.Random(871+kind)
  height=[5,8.5,12,13][kind]
  if kind==3:
    for n in range(14):
      z=n*.68
      m.cylinder(.08*math.sin(n/4),0,z,.16-n*.003,.7,'bark',12)
    # Individual leaflets on curved, asymmetric fronds, merged offline.
    verts=[];faces=[]
    for n in range(11):
      angle=n*math.tau/11
      for j in range(1,18):
        t=j/18;r=t*4.5
        z=height-1.5+math.sin(t*math.pi)*1.1-t*1.7
        cx,cy=r*math.cos(angle),r*math.sin(angle)
        m.rod((cx,cy,z),(cx+.15*math.cos(angle),cy+.15*math.sin(angle),z),.018,'plant-mid')
        for side in [-1,1]:
          length=.9*(1-t*.6)
          start=len(verts)
          verts.extend([(cx,cy,z),(cx+length*math.cos(angle+side*.75),cy+length*math.sin(angle+side*.75),z-.28),
            (cx+.22*math.cos(angle),cy+.22*math.sin(angle),z+.025)])
          faces.append((start,start+1,start+2))
    m.mesh('Palm pinnae',verts,faces,'plant-mid')
    return
  m.rod((0,0,0),(.18,.1,height*.65),.12+kind*.04,'bark')
  # Thousands of small leaf facets in four batched meshes, not spherical canopy blobs.
  clusters=[]
  for n in range(13+kind*4):
    a=rng.random()*math.tau;r=rng.uniform(.5,1.9+kind*.6)
    cx,cy=r*math.cos(a),r*math.sin(a);cz=height*.69+rng.uniform(-.7,1.3)
    clusters.append((cx,cy,cz))
    m.rod((.1,0,height*.38),(cx,cy,cz-.45),.04+kind*.012,'bark')
  for color in range(4):
    vertices=[];faces=[]
    for cx,cy,cz in clusters:
      for n in range(120):
        a=rng.random()*math.tau;v=rng.uniform(-1,1);r=rng.random()**(1/3)*(1+kind*.28)
        xx=cx+r*math.sqrt(1-v*v)*math.cos(a);yy=cy+r*math.sqrt(1-v*v)*math.sin(a);zz=cz+r*v*.72
        size=rng.uniform(.1,.25);angle=rng.random()*math.tau;start=len(vertices)
        vertices.extend([(xx-size,yy,zz),(xx,yy+size*.7,zz+.05),(xx+size,yy,zz),(xx,yy-size*.7,zz-.04)])
        faces.append((start,start+1,start+2,start+3))
    m.mesh('Individual leaf clusters',vertices,faces,['plant-dark','plant-mid','plant-light','plant-fresh'][color])


def vehicle(kind,heading):
  before=set(bpy.context.scene.objects)
  if kind=='okada':
    for x in [-.65,.7]:
      wheel=m.cylinder(x,0,0,.3,.12,'rubber',20);wheel.rotation_euler.x=math.pi/2;wheel.location.z=.3
    m.box(0,0,.45,1.1,.5,.3,'facade-dark')
    m.box(.1,0,.85,.6,.38,.15,'rubber')
    m.rod((-.5,0,.55),(-.7,0,1.15),.055,'rail')
    m.rod((-.7,-.3,1.1),(-.7,.3,1.1),.04,'rail')
  else:
    length,width,height={'sedan':(4.6,1.8,1.45),'suv':(4.8,1.98,1.8),
      'keke':(2.7,1.4,1.9),'danfo':(5.1,1.9,2.35),'bus':(12,2.55,3.2)}[kind]
    mat='orange-body' if kind in ['keke','danfo'] else 'cream-body' if kind=='bus' else 'silver-body'
    lo=length*.5
    # Bevelled, tapered coachwork and actual curved roof silhouette.
    verts=[(-lo,-width*.42,.32),(lo,-width*.42,.32),(lo,width*.42,.32),(-lo,width*.42,.32),
      (-lo+.2,-width*.5,.82),(lo-.18,-width*.5,.82),(lo-.18,width*.5,.82),(-lo+.2,width*.5,.82)]
    m.mesh('Coachwork',verts,[(0,3,2,1),(4,5,6,7),(0,1,5,4),(1,2,6,5),(2,3,7,6),(3,0,4,7)],mat)
    cabin=length*(.56 if kind in ['sedan','suv'] else .8)
    m.box(.12,0,.79,cabin,width*.91,height-.87,'glazing',.14)
    slab(.12,0,height-.10,cabin+.05,width*.94,mat,.12)
    for x in [-cabin/2+.12,cabin/2+.12]:m.box(x,0,.8,.1,width*.96,height-.85,mat,0)
    if kind in ['danfo','bus']:
      for x in range(1,round(cabin)):
        m.box(-cabin/2+x,0,.8,.07,width*.94,height-.85,mat,0)
      slab(0,0,.92,length*.95,width*.98,'facade-dark',.1)
    if kind=='keke':
      # Narrow single front wheel and passenger canopy make the three-wheeler distinct.
      m.box(-lo+.3,0,.5,.5,.7,.75,'orange-body')
      slab(.3,0,height-.1,1.7,width*1.1,'facade-dark',.12)
    for x in [-length*.31,length*.31]:
      for side in [-1,1]:
        if kind=='keke' and x<0 and side==1:continue
        yy=0 if kind=='keke' and x<0 else side*width*.46
        wheel=m.cylinder(x,yy,0,.29 if kind!='bus' else .43,.15,'rubber',20)
        wheel.rotation_euler.x=math.pi/2;wheel.location.z=.3 if kind!='bus' else .43
        hub=m.cylinder(x,yy-.09,0,.14 if kind!='bus' else .2,.025,'rail',16)
        hub.rotation_euler.x=math.pi/2;hub.location.z=wheel.location.z
    for y in [-width*.28,width*.28]:
      m.box(-lo+.01,y,.63,.08,.32,.14,'lamp',0)
      m.box(lo-.01,y,.63,.08,.24,.13,'wood',0)
  for o in set(bpy.context.scene.objects)-before:
    xx,yy=o.location.x,-o.location.y;a=heading*math.pi/2
    o.location=(xx*math.cos(a)-yy*math.sin(a),-(xx*math.sin(a)+yy*math.cos(a)),o.location.z)
    o.rotation_euler.z-=a


def utility(kind):
  if kind=='water-tower':
    for x in [-2.5,2.5]:
      for y in [-2.5,2.5]:
        slab(x,y,0,1.2,1.2,'stone',.35)
        m.rod((x,y,.3),(x*.7,y*.7,12),.13,'rail')
    for z in [3,6,9]:
      for y in [-2.5,2.5]:
        m.rod((-2.5,y,z),(2.5,y,z+3),.055,'rail')
        m.rod((2.5,y,z),(-2.5,y,z+3),.055,'rail')
      for x in [-2.5,2.5]:m.rod((x,-2.5,z),(x,2.5,z+3),.055,'rail')
    m.cylinder(0,0,11.8,3.2,3.4,'model-white',48)
    m.cylinder(0,0,11.65,3.6,.18,'rail',48)
    m.cylinder(0,0,15.2,3.2,.17,'stone',48)
    for n in range(24):
      a=n*math.tau/24;x=3.52*math.cos(a);y=3.52*math.sin(a)
      m.rod((x,y,11.8),(x,y,12.8),.028,'rail')
    for n in range(40):m.rod((3.2,-.4,n*.32),(3.2,.4,n*.32),.025,'rail')
    for y in [-.4,.4]:m.rod((3.2,y,0),(3.2,y,13),.04,'rail')
    m.rod((0,0,12),(0,0,16),.06,'rail')
    slab(-4,1,0,2.7,3.5,'render',2.4)
    slab(-4,1,2.4,3,3.8,'facade-dark',.15)
  elif kind=='substation':
    for x in [-3.5,3.5]:
      m.box(x,0,.2,3,4,2.5,'render')
      for n in range(10):m.box(x-1.3+n*.28,2.12,.5,.10,.4,1.9,'rail',0)
      for xx in [-.8,0,.8]:
        for y in [-1,1]:
          m.cylinder(x+xx,y,2.7,.11,1.1,'stone',12)
          for z in [2.9,3.1,3.3,3.5]:m.cylinder(x+xx,y,z,.18,.05,'model-white',12)
    for x in [-7,7]:
      for y in [-4.5,4.5]:m.rod((x,y,0),(x,y,5),.08,'rail')
    for y in [-4.5,4.5]:
      m.rod((-7,y,4.9),(7,y,4.9),.1,'rail')
      m.box(0,y,0,14,.14,1.8,'rail',0)
    for x in [-7,7]:m.box(x,0,0,.14,9,1.8,'rail',0)
  elif kind=='lamp':
    m.cylinder(0,0,0,.14,.25,'stone',12)
    m.rod((0,0,.2),(0,0,7),.047,'rail')
    m.rod((0,0,6.9),(1.3,0,7.2),.04,'rail')
    slab(1.25,0,7.16,.65,.32,'rail',.10)
    slab(1.25,0,7.1,.45,.24,'lamp',.05)
  elif kind=='bench':
    for x in [-.7,.7]:m.box(x,0,0,.09,.55,.5,'rail')
    for y in [-.2,0,.2]:slab(0,y,.5,1.9,.16,'wood',.07)
    for z in [.75,.92]:m.box(0,-.25,z,1.9,.09,.12,'wood',0)
  elif kind=='gate':
    for x in [-2.2,2.2]:m.box(x,0,0,.4,.5,2,'render')
    for n in range(21):m.box(-2+n*.2,0,.1,.065,.1,1.6,'rail',0)
    for z in [.2,1.6]:m.box(0,0,z,4.1,.10,.08,'rail',0)


def render(name,kind,footprint,floors,build):
  path=OUT/(name+'.png')
  if path.exists() and '--force' not in sys.argv:return
  setup();build()
  s=bpy.context.scene
  bpy.context.view_layer.update()
  direction=Vector((1,-1,math.sqrt(2/3))).normalized()
  rotation=(-direction).to_track_quat('-Z','Y')
  right=rotation@Vector((1,0,0));up=rotation@Vector((0,1,0))
  coords=[o.matrix_world@Vector(v) for o in s.objects if o.type in ['MESH','FONT'] for v in o.bound_box]
  minx=min(v.dot(right) for v in coords)-.25;maxx=max(v.dot(right) for v in coords)+.25
  miny=min(v.dot(up) for v in coords)-.25;maxy=max(v.dot(up) for v in coords)+.25
  width=maxx-minx;height=maxy-miny
  cam=bpy.data.cameras.new('Locked orthographic 45 / 30');cam.type='ORTHO';cam.ortho_scale=max(width,height)
  obj=bpy.data.objects.new('Camera',cam);s.collection.objects.link(obj)
  obj.location=right*((minx+maxx)/2)+up*((miny+maxy)/2)+direction*250
  obj.rotation_euler=rotation.to_euler();s.camera=obj
  s.render.resolution_x=math.ceil(width*PPM);s.render.resolution_y=math.ceil(height*PPM)
  s.render.filepath=str(path)
  bpy.context.view_layer.update()
  origin=world_to_camera_view(s,obj,Vector((0,0,0)))
  sample=world_to_camera_view(s,obj,right)
  scale=(sample.x-origin.x)*s.render.resolution_x/(48/(20*math.sqrt(2)))
  meta={'id':name,'type':kind,'footprint':footprint,'floors':floors,'heightMetres':floors*3.15 if floors else max(v.z for v in coords),
    'sourceScale':scale,'originPixels':[origin.x*s.render.resolution_x,(1-origin.y)*s.render.resolution_y],
    'camera':{'azimuth':45,'elevation':30},'sockets':{'entrance':[0,footprint[1]/2],'service':[-footprint[0]/2,0]},
    'lighting':'neutral warm northwest daylight','lod':[2,6,9,12]}
  print('LAB_RENDER_START',name,s.render.resolution_x,s.render.resolution_y,flush=True)
  bpy.ops.render.render(write_still=True)
  (OUT/(name+'.json')).write_text(json.dumps(meta,indent=2),encoding='utf8')
  if name=='linear-6':bpy.ops.wm.save_as_mainfile(filepath=str(ROOT/'art/visual-lab/linear-6-source.blend'))
  print('LAB_RENDER_DONE',name,flush=True)


if __name__=='__main__':
  jobs=[('linear-6','building',[33,16],6,linear),('l-block-8','building',[34,34],8,lblock),
    ('u-block-8','building',[37,34],8,ublock),('tower-10','building',[23,25],10,tower),
    ('setback-12','building',[26,19],12,stepped),('terrace-2','building',[27,12],2,terrace),
    ('bungalow','building',[14,12],1,bungalow),('mixed-6','building',[34,20],6,mixed)]
  for i,name in enumerate(['street-tree','shade-tree','mature-tree','palm']):
    jobs.append((name,'tree',[4+i,4+i],0,lambda i=i:tree(i)))
  for kind in ['water-tower','substation','lamp','bench','gate']:
    jobs.append((kind,'infrastructure' if kind in ['water-tower','substation'] else 'prop',[7,7] if kind=='water-tower' else [14,9] if kind=='substation' else [2,1],0,lambda k=kind:utility(k)))
  for kind in ['sedan','suv','keke','danfo','bus','okada']:
    for heading in range(4):
      length,width={'sedan':(4.6,1.8),'suv':(4.8,1.98),'keke':(2.7,1.4),'danfo':(5.1,1.9),'bus':(12,2.55),'okada':(2.1,.8)}[kind]
      jobs.append((f'{kind}-{heading}','vehicle',[length,width] if heading%2==0 else [width,length],0,lambda k=kind,h=heading:vehicle(k,h)))
  only=sys.argv[sys.argv.index('--only')+1].split(',') if '--only' in sys.argv else None
  for name,kind,footprint,floors,build in jobs:
    if not only or name in only:render(name,kind,footprint,floors,build)
