"""Blender 4.4 offline architectural model benchmark (metres, not game rules).

blender --background --factory-startup --python tools/art/render_models.py -- --only bungalow
Omit --only to render the benchmark. --hero renders the assembled urban block.
No Blender, mesh, lighting or per-window geometry is shipped to the browser.
"""
import bpy
import math
import json
import sys
import random
from pathlib import Path
from mathutils import Vector
from bpy_extras.object_utils import world_to_camera_view

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / 'art/model/masters'
OUT.mkdir(parents=True, exist_ok=True)
SAMPLES = 24  # Twice the maximum 6x zoom * DPR 2 sampling.
PPM = 48 / (20 * math.sqrt(2)) * SAMPLES
MATS = {}
CATALOG = []


def material(name, color, roughness=.7, metal=0):
  if name in MATS:
    return MATS[name]
  mat = bpy.data.materials.new(name)
  mat.diffuse_color = (*color, 1)
  mat.use_nodes = True
  bsdf = mat.node_tree.nodes.get('Principled BSDF')
  bsdf.inputs['Base Color'].default_value = (*color, 1)
  bsdf.inputs['Roughness'].default_value = roughness
  bsdf.inputs['Metallic'].default_value = metal
  MATS[name] = mat
  return mat


def setup():
  bpy.ops.object.select_all(action='SELECT')
  bpy.ops.object.delete(use_global=False)
  s = bpy.context.scene
  s.render.engine = 'BLENDER_EEVEE_NEXT'
  s.eevee.taa_render_samples = 32
  s.cycles.samples = 16
  s.cycles.use_denoising = True
  s.cycles.max_bounces = 4
  s.cycles.diffuse_bounces = 2
  s.cycles.transparent_max_bounces = 4
  s.render.film_transparent = True
  s.render.image_settings.file_format = 'PNG'
  s.render.image_settings.color_mode = 'RGBA'
  s.render.resolution_percentage = 100
  s.world.use_nodes = True
  s.world.node_tree.nodes['Background'].inputs[0].default_value = (.76, .82, .86, 1)
  s.world.node_tree.nodes['Background'].inputs[1].default_value = .45
  s.view_settings.view_transform = 'AgX'
  s.view_settings.look = 'AgX - Medium High Contrast'
  light = bpy.data.lights.new('Northwest soft daylight', 'AREA')
  light.energy = 1800
  light.shape = 'DISK'
  light.size = 14
  obj = bpy.data.objects.new('Northwest soft daylight', light)
  s.collection.objects.link(obj)
  obj.location = (-22, -16, 38)
  obj.rotation_euler = (Vector((0, 0, 0)) - obj.location).to_track_quat('-Z', 'Y').to_euler()
  sun = bpy.data.lights.new('Warm sun', 'SUN')
  sun.energy = 1.8
  sun.angle = math.radians(8)
  sun.color = (1, .94, .84)
  obj = bpy.data.objects.new('Warm sun', sun)
  s.collection.objects.link(obj)
  obj.rotation_euler = (math.radians(28), math.radians(-26), math.radians(-32))
  for name, col, rough, metal in [
    ('ivory', (.78,.77,.70), .72, 0), ('white', (.9,.89,.83), .65, 0),
    ('concrete', (.55,.56,.53), .9, 0), ('limestone', (.69,.66,.59), .8, 0),
    ('charcoal', (.15,.17,.17), .65, 0), ('glass', (.12,.2,.23), .22, .25),
    ('frame', (.26,.29,.28), .4, .35), ('zinc', (.36,.4,.39), .48, .45),
    ('roof', (.23,.27,.28), .5, .35), ('earth', (.45,.34,.24), 1, 0),
    ('grass', (.32,.42,.28), .95, 0), ('leaf', (.18,.3,.18), .9, 0),
    ('leaf-light', (.29,.4,.23), .95, 0), ('bark', (.3,.25,.18), .95, 0),
    ('paving', (.67,.67,.61), .95, 0), ('asphalt', (.18,.2,.2), .95, 0),
    ('paint', (.82,.81,.72), .8, 0), ('wood', (.33,.23,.15), .7, 0),
    ('yellow', (.68,.48,.15), .45, .1), ('car-white', (.81,.82,.77), .32, .25),
    ('car-silver', (.43,.48,.48), .28, .45), ('car-blue', (.13,.22,.3), .32, .25),
    ('green', (.22,.36,.3), .45, .1), ('tank', (.055,.075,.073), .8, 0),
  ]:
    material(name, col, rough, metal)


def mesh(name, vertices, faces, mat):
  data = bpy.data.meshes.new(name)
  data.from_pydata([(x,-y,z) for x,y,z in vertices], [], [tuple(reversed(f)) for f in faces])
  data.update()
  obj = bpy.data.objects.new(name, data)
  bpy.context.scene.collection.objects.link(obj)
  obj.data.materials.append(MATS[mat])
  return obj


def box(x,y,z,w,d,h,mat='ivory', bevel=.025):
  vertices=[(-w/2,-d/2,0),(w/2,-d/2,0),(w/2,d/2,0),(-w/2,d/2,0),
    (-w/2,-d/2,h),(w/2,-d/2,h),(w/2,d/2,h),(-w/2,d/2,h)]
  o=mesh(mat,vertices,[(0,3,2,1),(4,5,6,7),(0,1,5,4),(1,2,6,5),(2,3,7,6),(3,0,4,7)],mat)
  o.location=(x,-y,z)
  if bevel and min(w,d,h) > .05:
    m = o.modifiers.new('Small manufactured edge', 'BEVEL')
    m.width = min(bevel, min(w,d,h)/4)
    m.segments = 2
    o.modifiers.new('Weighted normals', 'WEIGHTED_NORMAL')
  return o


def cylinder(x,y,z,r,h,mat='concrete',vertices=16):
  verts=[(r*math.cos(i*math.tau/vertices),r*math.sin(i*math.tau/vertices),zz) for zz in [-h/2,h/2] for i in range(vertices)]
  faces=[tuple(reversed(range(vertices))),tuple(range(vertices,vertices*2))]
  faces.extend((i,(i+1)%vertices,(i+1)%vertices+vertices,i+vertices) for i in range(vertices))
  o=mesh(mat,verts,faces,mat);o.location=(x,-y,z+h/2)
  for face in o.data.polygons:
    face.use_smooth = True
  return o


def rod(a,b,r=.035,mat='frame'):
  p,q=Vector((a[0],-a[1],a[2])),Vector((b[0],-b[1],b[2]))
  o=cylinder(0,0,0,r,(q-p).length,mat,8)
  o.location=(p+q)/2
  o.rotation_euler=(q-p).to_track_quat('Z','Y').to_euler()
  return o


def roof(x,y,w,d,z,h=1.9,mat='roof'):
  w+=.85;d+=.85
  v=[(x-w/2,y-d/2,z),(x+w/2,y-d/2,z),(x+w/2,y+d/2,z),(x-w/2,y+d/2,z),
     (x-w/2+1.6,y,z+h),(x+w/2-1.6,y,z+h)]
  mesh('Hipped roof with fascia',v,[(0,1,5,4),(1,2,5),(2,3,4,5),(3,0,4)],mat)
  for a,b in [(0,1),(1,2),(2,3),(3,0),(4,5)]:rod(v[a],v[b],.045,mat)
  # Fine pressed-metal ribs, actual geometry in the source, baked once.
  for n in range(1,25):
    t=n/25;xx=x-w/2+w*t
    ridge_x=max(x-w/2+1.6,min(x+w/2-1.6,xx))
    rod((xx,y+d/2,z+.02),(ridge_x,y,z+h+.02),.012,'zinc')
  return z+h


def window(x,y,z,w=1.25,h=1.45,side=False):
  # Recesses, sill, frame and transom all have dimensional depth.
  if side:
    box(x,y,z,w=.12,d=w,h=h,mat='charcoal',bevel=0)
    box(x+.04,y,z+.09,.13,w-.16,h-.18,'glass',0)
    for dy in [-w/2,w/2]:box(x+.11,y+dy,z,.09,.055,h,'white',0)
    box(x+.1,y,z+h/2,.07,w,.04,'frame',0)
    box(x+.18,y,z-.07,.28,w+.2,.09,'concrete',0)
  else:
    box(x,y,z,w,.12,h,'charcoal',0)
    box(x,y+.04,z+.09,w-.16,.13,h-.18,'glass',0)
    for dx in [-w/2,w/2]:box(x+dx,y+.11,z,.055,.09,h,'white',0)
    box(x,y+.1,z+h/2,w,.07,.04,'frame',0)
    box(x,y+.1,z,.045,.08,h,'frame',0)
    box(x,y+.18,z-.07,w+.2,.28,.09,'concrete',0)


def entry(x,y,z=0,w=1.5):
  box(x,y,z,w+.25,.15,2.5,'charcoal')
  box(x,y+.06,z,w,.18,2.35,'wood')
  box(x+.45,y+.18,z+1,.035,.08,.2,'zinc',0)
  for n in range(3):box(x,y+.4+n*.25,.05+n*.09,w+.5,1-n*.22,.12,'paving')
  box(x,y+.65,z+2.65,w+1.1,1.6,.2,'concrete')


def tree(x,y,size=1,seed=0):
  rand=random.Random(seed)
  rod((x,y,0),(x,y,4.8*size),.13*size,'bark')
  for n in range(18):
    a=rand.random()*math.tau;r=rand.random()*1.6*size
    radius=(.65+rand.random()*.5)*size
    centre=(x+math.cos(a)*r,-y+math.sin(a)*r,(4.4+rand.random()*1.7)*size)
    vertices=[(radius*math.sin(j*math.pi/6)*math.cos(i*math.tau/10),
      radius*math.sin(j*math.pi/6)*math.sin(i*math.tau/10),radius*math.cos(j*math.pi/6)*.85)
      for j in range(7) for i in range(10)]
    faces=[(j*10+i,j*10+(i+1)%10,(j+1)*10+(i+1)%10,(j+1)*10+i) for j in range(6) for i in range(10)]
    o=mesh('Model vegetation crown',vertices,[tuple(reversed(f)) for f in faces],'leaf-light' if n%3==0 else 'leaf');o.location=centre
    for f in o.data.polygons:f.use_smooth=True


def plot(kind='residential'):
  # Zero-height ground with landscaped breaks, no raised square pedestal.
  box(0,0,-.035,20,20,.035,'earth' if kind=='residential' else 'paving',0)
  if kind=='residential':
    box(-6.5,5.5,0,4.3,6,.02,'grass',0)
    box(6.3,-5.8,0,5.2,6.5,.02,'grass',0)
    box(2.9,6.7,0,3,6.6,.045,'paving',0)
    tree(-6.8,6.4,.65,3)
  # Ground paving joints are shallow geometry, no photographic texture noise.
  for n in range(7):box(-8+n*2.4,8,0,.025,3.8,.035,'limestone',0)


def boundary():
  box(-9.3,0,0,.24,18.5,1.35,'ivory')
  box(9.3,0,0,.24,18.5,1.35,'ivory')
  box(0,-9.3,0,18.5,.24,1.35,'ivory')
  box(-3.8,9.3,0,10.7,.25,1.1,'ivory')
  box(7.3,9.3,0,4,.25,1.1,'ivory')
  box(2.9,9.3,0,3.1,.18,1.35,'frame')
  for x in [1.2,4.6]:box(x,9.3,0,.4,.42,1.65,'white')
  for n in range(12):box(1.5+n*.25,9.43,.15,.04,.07,1.1,'zinc',0)


def bungalow():
  plot();boundary()
  box(-1,-1.5,.15,10,8,3.25,'ivory')
  box(4,-2.4,.15,3.5,6.2,3.25,'white')
  roof(-1,-1.5,10,8,3.4);roof(4,-2.4,3.5,6.2,3.4,1.4)
  box(-2,3.6,.12,5,2.4,.15,'paving')
  box(-2,3.6,2.9,5.4,2.8,.2,'white')
  for x in [-4.4,.4]:box(x,4.6,.25,.23,.23,2.7,'white')
  for x in [-4,-1.8]:window(x,2.52,1.05)
  window(4, .72,1.05);window(5.76,-3,1.05,side=True)
  entry(1.15,2.58)


def duplex():
  plot();boundary()
  box(-1,-2,.15,10,8,6.4,'ivory')
  box(4.7,-.8,.15,4.5,6,6.4,'white')
  roof(-1,-2,10,8,6.6,1.8);roof(4.7,-.8,4.5,6,6.6,1.5)
  for f in range(2):
    for x in [-4,-1.5,1.1]:window(x,2.03,.95+f*3.2)
    for y in [-3.6,-.8,1.2]:window(6.96,y,.95+f*3.2,side=True)
  balcony(-1,2.2,3.35,6)
  for x in [-3.7,1.7]:box(x,4.6,.15,.25,.25,3.2,'white')
  entry(4.7,2.25)


def balcony(x,y,z,width=3):
  box(x,y+.65,z,width,1.4,.2,'white')
  rod((x-width/2,y+1.34,z+1.05),(x+width/2,y+1.34,z+1.05),.04)
  rod((x-width/2,y+1.34,z+.4),(x+width/2,y+1.34,z+.4),.027)
  for n in range(int(width/.32)+1):
    xx=x-width/2+n*.32
    rod((xx,y+1.34,z+.2),(xx,y+1.34,z+1.05),.023)
  for xx in [x-width/2,x+width/2]:rod((xx,y,z+1.05),(xx,y+1.34,z+1.05),.035)


def flats(floors=4,form='linear'):
  plot('apartment')
  # Three articulated masses: balcony wing, recessed core and stepped service wing.
  w=12;d=10;height=floors*3.2
  box(-1,-1,.15,w,d,height,'ivory')
  box(5.7,-2.5,.15,3,7,height+1.1,'white')
  box(-5.6,-1,.15,1.1,d,height+.65,'white')
  for f in range(floors):
    z=.95+f*3.2
    box(-1,4.05,f*3.2+.2,w,.18,.16,'concrete',0)
    for x in [-4.5,-1,2.5]:window(x,4.09,z,1.7,1.7)
    for y in [-4,-.7,2]:window(7.23,y,z,1.4,1.7,True)
    for x in [-4,2.1]:balcony(x,4.2,f*3.2+.25,2.55)
    box(-.6,4.2,f*3.2+.15,.35,.38,3.05,'white')
  box(-1,-1,height+.2,w+.3,d+.3,.25,'white')
  for x in [-7.12,5.12]:box(x,-1,height+.4,.2,d+.3,.65,'white')
  for y in [-6.12,4.12]:box(-1,y,height+.4,w+.3,.2,.65,'white')
  box(2,-1,height+.5,3.2,3,2.2,'limestone')
  for x in [-3.5,-1.4]:
    box(x,-3,height+.55,1.3,2,.7,'charcoal')
    for n in range(5):box(x-.55+n*.27,-3,height+1.27,.06,1.7,.035,'zinc',0)
  if floors>=8:
    # Setback penthouse, no uniformly extruded tower silhouette.
    box(-1,-1,height+.5,7.2,6,2.1,'white')
    for x in [-3,-.5,2]:window(x,2.06,height+1.1,1.5,1.1)
  box(-1,6.9,0,14,5,.06,'paving',0)
  entry(-.5,4.4,w=2.1)
  tree(-8.2,7.6,.65,19);tree(8,7.6,.55,12)
  for n in range(3):box(4+n*1.65,7.2,.07,.035,3.8,.015,'paint',0)
  car(4.7,7.3,'car',0,decor=True)


def courtyard():
  plot('apartment')
  # U-shaped perimeter building with a recessed shared garden, four storeys.
  for x,y,w,d in [(-6,0,4.2,14),(6,0,4.2,14),(0,-5,8,4)]:
    box(x,y,.1,w,d,12.8,'ivory')
    box(x,y,12.9,w+.2,d+.2,.35,'white')
  for f in range(4):
    for x in [-6,6]:
      for yy in [-4,0,4]:window(x+2.12,yy,.9+f*3.2,1.4,1.7,True)
      balcony(x,7.12,.2+f*3.2,3.2)
    for x in [-2,1]:window(x,-2.88,.9+f*3.2,1.4,1.7)
  box(0,2,0,6.5,9,.03,'grass',0)
  box(0,2,.02,1.3,11,.06,'paving',0)
  for xx in [-2.2,2.2]:tree(xx,3,.6,int(xx*10+60))
  entry(-6,7.2);entry(6,7.2)


def shop_row():
  plot('shop')
  box(0,-1,.1,17,8,3.6,'ivory')
  box(0,-1,3.7,17.3,8.3,.35,'white')
  for n, name in enumerate(['ADE STORES','UNITY MART','TOSIN TECH']):
    x=-5.6+n*5.6
    box(x,3.06,.3,4.7,.18,2.5,'glass')
    for dx in [-2.25,0,2.25]:box(x+dx,3.2,.3,.07,.18,2.6,'white',0)
    box(x,3.3,2.85,5, .15,.55,'charcoal')
    signage(name,x,3.42,3.02,.21)
    box(x,4.0,2.72,5.1,1.7,.16,'zinc')
    box(x,5.4,0,5,1.7,.07,'paving',0)
  for n in range(5):box(-8+n*3.6,7.8,0,.035,3,.025,'paint',0)
  car(-5.8,7.9,'car',0,decor=True)


def signage(label,x,y,z,size):
  data=bpy.data.curves.new('Fictional signage','FONT')
  data.body=label;data.align_x='CENTER';data.size=size;data.extrude=.003
  o=bpy.data.objects.new(label,data);bpy.context.scene.collection.objects.link(o)
  o.location=(x,-y,z);o.rotation_euler=(math.pi/2,0,0)
  data.materials.append(MATS['white'])


def office():
  plot('office')
  box(-1,-1,.1,14,11,15.2,'white')
  box(5.5,-1,0,3.3,11,17,'concrete')
  for f in range(4):
    for x in [-6,-3,0,3]:window(x,4.58,.5+f*3.8,2.3,2.6)
    box(-1,4.8,f*3.8+.05,14.6,.5,.35,'white')
    for y in [-4.5,-1.5,1.5]:window(7.18,y,.6+f*3.8,2.2,2.4,True)
  entry(-1,4.9,w=3)
  box(-1,6.4,3,9,2.5,.18,'zinc')
  signage('ALAFIA HOUSE',-1,4.91,14.4,.39)
  tree(-8,7,.65,22);tree(8,7,.65,29)


def warehouse():
  plot('warehouse')
  box(0,-2,.15,15,10,5.2,'concrete')
  roof(0,-2,15,10,5.4,1.3,'zinc')
  for n in range(3):
    x=-5+n*5
    box(x,3.1,.2,3.7,.12,4.2,'charcoal')
    for i in range(13):box(x,3.2,.3+i*.28,3.6,.06,.055,'zinc',0)
    box(x,4,.15,4.2,1.4,.23,'concrete')
  for n in range(5):box(-7+n*3.4,-2,.1,.15,10,5.3,'zinc')
  for n in range(4):box(6.7,6+n*.6,.08,1.5,.5,.7,'wood')
  box(-8.8,0,0,.12,19,1.8,'frame');box(8.8,0,0,.12,19,1.8,'frame')


def construction(stage):
  plot('residential')
  box(-1,-1,0,12,10,.4,'concrete')
  if stage:
    for f in range(2):
      z=f*3.2
      for x in [-6,-1,4]:
        for y in [-5,0,4]:
          box(x,y,z,.35,.35,3.1,'concrete')
          for dx in [-.08,.08]:rod((x+dx,y,z+3),(x+dx,y,z+3.8),.025,'frame')
      box(-1,-1,z+3.05,12,10,.2,'concrete')
      box(-3,4,z,5.5,.25,2.4,'limestone')
      for line in range(8):box(-3,4.14,z+line*.3,5.5,.025,.012,'concrete',0)
  else:
    for x in [-6,-1,4]:box(x,-1,.4,.3,10,.45,'limestone')
  for n in range(3):box(6.4,5+n*.7,0,2,.55,.65,'limestone')
  for n in range(6):rod((-6+n*.2,7,.15),(-3+n*.2,7,.15),.055,'frame')


def car(x=0,y=0,mode='car',heading=0,decor=False):
  before=set(bpy.context.scene.objects)
  lengths={'car':4.5,'danfo':5.3,'bus':10.5,'keke':2.6,'okada':2.1}
  length=lengths[mode];width=1.8 if mode not in ['bus','keke','okada'] else {'bus':2.4,'keke':1.4,'okada':.65}[mode]
  col='yellow' if mode in ['keke','danfo'] else 'green' if mode=='bus' else 'car-silver'
  if mode=='okada':
    box(0,0,.55,1.2,.35,.22,'charcoal')
    rod((-.65,0,.3),(.65,0,.45),.05,'zinc')
    cylinder(.3,0,1.0,.19,.2,'concrete')
    box(.2,0,.65,.35,.55,.4,'car-blue')
  else:
    box(0,0,.35,length,width,.55,col,.1)
    box(-.3,0,.9,length*.62,width*.9,.65,'glass',.12)
    box(-.3,0,1.5,length*.58,width*.89,.1,col,.08)
    box(length/2-.06,0,.56,.08,width*.8,.15,'white')
    box(-length/2+.06,0,.56,.08,width*.8,.16,'charcoal')
    if mode in ['bus','danfo']:
      for n in range(5):box(-length*.3+n*length*.13,0,.94,.05,width*.95,.62,col,0)
    if mode=='keke':box(length*.38,0,.35,length*.3,width*.65,.6,'yellow')
  wheel_positions=[(-length*.32,-width*.51),(length*.32,-width*.51),(-length*.32,width*.51),(length*.32,width*.51)]
  if mode=='keke':wheel_positions=[(-length*.3,-width*.5),(-length*.3,width*.5),(length*.4,0)]
  if mode=='okada':wheel_positions=[(-.78,0),(.78,0)]
  for u,v in wheel_positions:
    o=cylinder(u,v,.05,.31 if mode!='okada' else .28,.16,'charcoal',16)
    o.rotation_euler.x=math.pi/2
  angle=heading*math.pi/2
  for o in set(bpy.context.scene.objects)-before:
    ox,oy=o.location.x,-o.location.y
    o.location.x=x+ox*math.cos(angle)-oy*math.sin(angle)
    o.location.y=-(y+ox*math.sin(angle)+oy*math.cos(angle))
    o.rotation_euler.z-=angle


def prop(kind):
  if kind=='tank':
    for x in [-.65,.65]:
      for y in [-.65,.65]:rod((x,y,0),(x,y,1.8),.055)
    box(0,0,1.8,1.6,1.6,.12,'concrete')
    cylinder(0,0,1.92,.7,1.55,'tank',32)
    cylinder(0,0,3.47,.57,.08,'tank',32)
    for z in [2.15,2.5,2.85,3.2]:cylinder(0,0,z,.72,.035,'charcoal',32)
    rod((.6,.65,.1),(.6,.65,2.6),.04,'zinc')
  elif kind=='pump':
    box(0,0,0,1.5,1.1,.16,'concrete')
    cylinder(0,0,.16,.22,.6,'green')
    rod((0,0,.5),(.6,0,.5),.055,'zinc')
  else:
    box(0,0,0,1.8,1,.18,'concrete')
    box(0,0,.18,1.6,.8,1.1,'ivory' if kind=='generator-enclosed' else 'green')
    for n in range(7):box(-.52+n*.13,.42,.35,.055,.025,.55,'charcoal',0)
    rod((.6,-.2,1.1),(.6,-.2,1.55),.05,'charcoal')
    if kind=='generator-enclosed':
      for x in [-1,1]:rod((x,-.6,0),(x,-.6,1.8),.05)
      box(0,0,1.8,2.3,1.5,.12,'zinc')


def road(kind,mask):
  width={'dirt':6,'local':7,'avenue':11,'major':15}[kind]
  # One planar union, not overlapping independent strips. Chamfered junction corners.
  # Mesh grid subdivides the pavement footprint; internal edges are not rendered.
  directions=[(1,0),(-1,0),(0,1),(0,-1)]
  step=.5;half=width/2
  for layer,extra,z,mat in [(0,1.5,0,'paving'),(1,.25,.10,'concrete'),(2,0,.13,'earth' if kind=='dirt' else 'asphalt')]:
    h=half+extra;vertices=[];faces=[]
    for ix in range(40):
      for iy in range(40):
        x=-10+ix*step;y=-10+iy*step;cx=x+.25;cy=y+.25
        inside=abs(cx)<h and abs(cy)<h
        for bit,(dx,dy) in enumerate(directions):
          if mask&(1<<bit):inside|=(abs(cy)<h and cx*dx>0) if dx else (abs(cx)<h and cy*dy>0)
        if inside:
          i=len(vertices);vertices.extend([(x,y,z),(x+step,y,z),(x+step,y+step,z),(x,y+step,z)])
          faces.append((i,i+1,i+2,i+3))
    mesh(f'{kind} connected carriageway {layer}',vertices,faces,mat)
  if kind in ['avenue','major']:
    for bit,(dx,dy) in enumerate(directions):
      if not mask&(1<<bit):continue
      for n in [6.1,8.3]:
        box(n*dx,n*dy,.15,1.1 if dx else .12,.12 if dx else 1.1,.018,'paint',0)
      if kind=='major':
        for side in [-3.3,3.3]:
          for n in [6.4,8.8]:box(n*dx+(side if dy else 0),n*dy+(side if dx else 0),.15,1.15 if dx else .1,.1 if dx else 1.15,.02,'paint',0)
    if mask in [3,12]:
      box(0,0,.15,20 if mask==3 else .7,.7 if mask==3 else 20,.14,'concrete',0)
      box(0,0,.30,20 if mask==3 else .5,.5 if mask==3 else 20,.035,'grass',0)


def public_realm():
  box(0,0,-.025,20,20,.025,'paving',0)
  box(0,0,0,9,12,.02,'grass',0)
  box(0,0,.025,1.6,20,.035,'limestone',0)
  box(0,0,.025,20,1.6,.035,'limestone',0)
  for x,y in [(-3,-4),(3,4)]:tree(x,y,.9,int(x*10+40))
  for y in [-6,-1,4]:
    box(-7,y,0,3.2,.04,.03,'paint',0)
    car(-7,y+2.2,'car',0,True)
  box(5.8,-3,.12,.6,3.1,.4,'wood')


def terrain_land():
  mesh('Continuous landscape plane',[(-10,-10,0),(10,-10,0),(10,10,0),(-10,10,0)],[(0,1,2,3)],'grass')


def drain(kind,orientation):
  before=set(bpy.context.scene.objects)
  width={'open-drain':.65,'engineered-drain':1.1,'channel':2.1}[kind]
  box(0,7,0,20,width,.07,'charcoal',0)
  for yy in [7-width/2,7+width/2]:box(0,yy,0,20,.14,.32,'concrete',0)
  for x in [-5,5]:box(x,7,.34,2,width+.25,.13,'paving',0)
  if orientation:
    for o in set(bpy.context.scene.objects)-before:
      xx,yy=o.location.x,-o.location.y
      o.location=(yy,-xx,o.location.z);o.rotation_euler.z-=math.pi/2


def driveway_bridge(orientation):
  # Thin concrete culvert crossing; independent sprite, only placed beside real drainage.
  before=set(bpy.context.scene.objects)
  box(0,0,0,2.8,2.2,.18,'paving')
  for x in [-1.25,1.25]:box(x,0,.18,.1,2.2,.15,'concrete')
  for y in [-.9,.9]:box(0,y,0,2.8,.13,.23,'concrete')
  if orientation:
    for o in set(bpy.context.scene.objects)-before:o.rotation_euler.z-=math.pi/2


def render_asset(name,kind,level,build,save_source=False):
  setup();build()
  s=bpy.context.scene
  direction=Vector((1,-1,math.sqrt(2/3))).normalized()
  rotation=(-direction).to_track_quat('-Z','Y')
  right=rotation@Vector((1,0,0));up=rotation@Vector((0,1,0))
  coords=[]
  for o in s.objects:
    if o.type in ['MESH','FONT']:
      coords.extend(o.matrix_world@Vector(v) for v in o.bound_box)
  # Object matrices must be updated before inspecting transformed bounds.
  bpy.context.view_layer.update()
  coords=[o.matrix_world@Vector(v) for o in s.objects if o.type in ['MESH','FONT'] for v in o.bound_box]
  minx=min(v.dot(right) for v in coords)-.25;maxx=max(v.dot(right) for v in coords)+.25
  miny=min(v.dot(up) for v in coords)-.25;maxy=max(v.dot(up) for v in coords)+.25
  width=maxx-minx;height=maxy-miny
  cam=bpy.data.cameras.new('Model orthographic 45 azimuth 30 elevation')
  cam.type='ORTHO';cam.ortho_scale=height
  obj=bpy.data.objects.new('Model camera',cam);s.collection.objects.link(obj)
  obj.location=right*((minx+maxx)/2)+up*((miny+maxy)/2)+direction*200
  obj.rotation_euler=rotation.to_euler();s.camera=obj
  # Blender ortho_scale is the larger dimension, not necessarily image height.
  cam.ortho_scale=max(width,height)
  s.render.resolution_x=math.ceil(width*PPM);s.render.resolution_y=math.ceil(height*PPM)
  s.render.filepath=str(OUT/(name+'.png'))
  bpy.context.view_layer.update()
  origin=world_to_camera_view(s,obj,Vector((0,0,0)))
  # Projection tests compute exact sample/world from the render camera, never from trimmed alpha.
  sample_x=world_to_camera_view(s,obj,right)
  actual_ppm=(sample_x.x-origin.x)*s.render.resolution_x
  scale=actual_ppm/(48/(20*math.sqrt(2)))
  meta={'id':name,'type':kind,'level':level,'variant':0,'sourceScale':scale,
    'originPixels':[origin.x*s.render.resolution_x,(1-origin.y)*s.render.resolution_y],
    'tileTopOffset':12 if kind not in ['prop','vehicle','tree'] else 0,
    'metresPerTile':20,'floorHeightMetres':3.2,'floors':{1:1,2:2,3:4,4:8,5:14}.get(level,0),
    'footprint':name,'sockets':{'generator':{'x':-7,'y':18},'tank':{'x':9,'y':14},'pump':{'x':10,'y':17}},
    'windowMaterial':'glass','lighting':'northwest warm daylight / ambient sky',
    'camera':{'projection':'orthographic','azimuth':45,'elevation':30},'lod':[2,6,9,12]}
  CATALOG.append(meta)
  if save_source:bpy.ops.wm.save_as_mainfile(filepath=str(ROOT/'art/model/benchmark-source.blend'))
  print('RENDER_START',name,s.render.resolution_x,s.render.resolution_y,flush=True)
  bpy.ops.render.render(write_still=True)
  (OUT/(name+'.json')).write_text(json.dumps(meta,indent=2),encoding='utf8')
  print('RENDER_DONE',name,flush=True)


def hero():
  # Full physical block uses the same reusable source geometry, light and scale.
  def assembled():
    box(0,0,-.15,110,110,.15,'grass',0)
    for x,y,f in [(-23,-23,4),(23,-23,8),(-23,23,4),(23,23,8)]:
      before=set(bpy.context.scene.objects);flats(f)
      for o in set(bpy.context.scene.objects)-before:o.location.x+=x;o.location.y-=y
    public_realm()
    for x,y in [(-23,0),(23,0),(0,-23),(0,23)]:
      before=set(bpy.context.scene.objects);public_realm()
      for o in set(bpy.context.scene.objects)-before:o.location.x+=x;o.location.y-=y
    for y in [-46,46]:
      box(0,y,0,100,15,.12,'asphalt',0)
      for xx in range(-45,46,5):box(xx,y,.13,2,.14,.02,'paint',0)
      for side in [-9,9]:box(0,y+side,0,100,3,.1,'paving',0)
    for x in [-46,46]:
      box(x,0,0,15,100,.12,'asphalt',0)
      for yy in range(-38,39,5):box(x,yy,.13,.14,2,.02,'paint',0)
      for side in [-9,9]:box(x+side,0,0,3,100,.1,'paving',0)
    for n,(x,y) in enumerate([(-34,-47),(-10,46),(28,46),(46,22),(-46,8)]):car(x,y,'car',n%4,True)
    for x in [-38,38]:
      for y in [-34,-10,10,34]:tree(x,y,.85,int(x+y+120))
  global PPM
  PPM=18  # ~3K hero composition, not a gameplay texture.
  render_asset('dense-urban-block','demonstration',0,assembled,True)


if __name__=='__main__':
  args=sys.argv[sys.argv.index('--')+1:] if '--' in sys.argv else []
  if '--hero' in args:
    if '--terrain' in args:render_asset('terrain-land','terrain',0,terrain_land)
    hero()
  else:
    jobs=[('bungalow','residential',1,bungalow),('duplex','residential',2,duplex),
      ('apartment-4','residential',3,lambda:flats(4)),('apartment-8','residential',4,lambda:flats(8)),
      ('apartment-14','residential',5,lambda:flats(14)),('shop-row','commercial',1,shop_row),
      ('commercial-modern','commercial',3,office),('warehouse','industrial',1,warehouse),
      ('courtyard-apartment','residential',3,courtyard),('construction-foundation','construction',0,lambda:construction(0)),
      ('construction-shell','construction',0,lambda:construction(1)),('public-realm','landscape',0,public_realm)]
    for kind in ['generator-open','generator-enclosed','tank','pump']:
      jobs.append((kind,'prop',0,lambda k=kind:prop(k)))
    for v in range(3):jobs.append((f'tree-{v}','tree',0,lambda v=v:tree(0,0,.85+v*.12,v+27)))
    for mode in ['car','okada','keke','danfo','bus']:
      for h in range(4):jobs.append((f'vehicle-{mode}-{h}','vehicle',0,lambda m=mode,h=h:car(mode=m,heading=h)))
    for kind in ['local','avenue','major']:
      for mask in range(16):jobs.append((f'road-{kind}-{mask}','road',0,lambda k=kind,m=mask:road(k,m)))
    jobs.append(('terrain-land','terrain',0,terrain_land))
    for kind in ['open-drain','engineered-drain','channel']:
      for orientation in range(2):jobs.append((f'drain-{kind}-{orientation}','drain',0,lambda k=kind,o=orientation:drain(k,o)))
    for orientation in range(2):jobs.append((f'driveway-bridge-{orientation}','prop',0,lambda o=orientation:driveway_bridge(o)))
    only=args[args.index('--only')+1] if '--only' in args else None
    for name,kind,level,fn in jobs:
      if only and name not in only.split(','):continue
      if not only and '--force' not in args and (OUT/(name+'.png')).exists():continue
      render_asset(name,kind,level,fn)
