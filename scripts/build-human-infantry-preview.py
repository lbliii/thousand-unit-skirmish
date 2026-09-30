#!/usr/bin/env python3
"""Pack Human Infantry appearance + available SE motion candidates, not coverage acceptance."""
from PIL import Image
from pathlib import Path
import json,copy,hashlib
root=Path(__file__).resolve().parents[1];out=root/'assets/units/infantry-sprite-v3';out.mkdir(exist_ok=True)
p=json.loads((root/'assets/units/cast-human-sprite-v2/sprite-atlas-pack-v1.json').read_text())
p=json.loads(json.dumps(p).replace('cast-human','infantry').replace('cast-atlas','infantry-atlas'))
a=p['assets'][0];a['id']='infantry';a['layers'][0]['batchKey']='unit.infantry';template=copy.deepcopy(a['frames'][0]);a['frames']=[]
sources=root/'docs/art-direction/human-roster-v1/source';idle=Image.open(sources/'infantry-idle-facings.png').convert('RGBA')
atlas=Image.new('RGBA',(1024,5120));headings=['east','south-east','north-east','north','north-west','west','south-west','south'];frames=[]
def add(tile,id,x,y):
 pix=tile.load()
 for yy in range(256):
  for xx in range(256):
   if pix[xx,yy][3]<9:pix[xx,yy]=(0,0,0,0)
 b=tile.getbbox()
 if not b or b[0]==0 or b[1]==0 or b[2]==256 or b[3]==256:raise ValueError((id,b))
 atlas.alpha_composite(tile,(x,y));f=copy.deepcopy(template);f['id']=id;f['groundPivotPx']={'x':128,'y':244};f['canvasPx']={'width':256,'height':256};f['alphaBoundsPx']={'x':b[0],'y':b[1],'width':b[2]-b[0],'height':b[3]-b[1]};r={'x':x,'y':y,'width':256,'height':256};f['fallbackRectPx']['rectPx']=r;f['frameRectsPx'][0]['rectPx']=r;frames.append(f)
for i,d in enumerate(headings):
 x=i%4;y=i//4;c=idle.crop((round(x*idle.width/4),round(y*idle.height/2),round((x+1)*idle.width/4),round((y+1)*idle.height/2)));c=c.crop(c.getbbox());c.thumbnail((220,232),Image.Resampling.LANCZOS);t=Image.new('RGBA',(256,256));t.alpha_composite(c,((256-c.width)//2,244-c.height));add(t,'idle-'+d+'-0',x*256,y*256)
a['clips']=[{'stateId':s,'directionId':d,'loop':s!='defeat','sequence':[{'frameId':'idle-'+d+'-0','durationMs':1000}]} for s in ['idle','walk','attack','defeat'] for d in headings]
walk=Image.open(sources/'infantry-walk-south-east-v1.png').convert('RGBA')
for i in range(8):
 x=i%4;y=i//4;c=walk.crop((x*384,y*512,(x+1)*384,(y+1)*512)).resize((241,321),Image.Resampling.LANCZOS);t=Image.new('RGBA',(256,256));t.alpha_composite(c,(7,-34));add(t,f'walk-south-east-{i}',x*256,512+y*256)
for clip in a['clips']:
 if clip['stateId']=='walk' and clip['directionId']=='south-east':clip['sequence']=[{'frameId':f'walk-south-east-{i}','durationMs':100} for i in range(8)]
# Attack uses larger canvases at the SAME pixel/world scale so thrusts fit.
attack_dir=sources.parent/'extracted/infantry/attack/south-east'
meta=json.loads((attack_dir/'extraction.json').read_text())
for item in meta['frames']:
 i=item['frame'];box=item['sourceBounds'];c=Image.open(attack_dir/f'{i:02}.png').convert('RGBA');factor=232/390;c=c.resize((round(c.width*factor),round(c.height*factor)),Image.Resampling.LANCZOS)
 tile=Image.new('RGBA',(512,512));ox=round(256+(box[0]-(i%4)*443.5-225)*factor);oy=round(480+(box[1]-(i//4)*443.5-430)*factor);tile.alpha_composite(c,(ox,oy));b=tile.getbbox()
 if not b or b[0]==0 or b[1]==0 or b[2]==512 or b[3]==512:raise ValueError(('attack',i,b))
 x=i%2*512;y=1024+i//2*512;atlas.alpha_composite(tile,(x,y));f=copy.deepcopy(template);f['id']=f'attack-south-east-{i}';f['canvasPx']={'width':512,'height':512};f['groundPivotPx']={'x':256,'y':480};f['alphaBoundsPx']={'x':b[0],'y':b[1],'width':b[2]-b[0],'height':b[3]-b[1]};rect={'x':x,'y':y,'width':512,'height':512};f['fallbackRectPx']['rectPx']=rect;f['frameRectsPx'][0]['rectPx']=rect;frames.append(f)
for clip in a['clips']:
 if clip['stateId']=='attack' and clip['directionId']=='south-east':clip['sequence']=[{'frameId':f'attack-south-east-{i}','durationMs':[100,100,100,100,110,110,115,115][i]} for i in range(8)]
defeat_dir=sources.parent/'extracted/infantry/defeat/south-east'
meta=json.loads((defeat_dir/'extraction.json').read_text())
for item in meta['frames']:
 i=item['frame'];box=item['sourceBounds'];c=Image.open(defeat_dir/f'{i:02}.png').convert('RGBA');factor=232/390;c=c.resize((round(c.width*factor),round(c.height*factor)),Image.Resampling.LANCZOS)
 tile=Image.new('RGBA',(512,512));ox=round(256+(box[0]-(i%4)*443.5-225)*factor);oy=round(480+(box[1]-(i//4)*443.5-[472,382][i//4])*factor);tile.alpha_composite(c,(ox,oy));b=tile.getbbox()
 if not b or b[0]==0 or b[1]==0 or b[2]==512 or b[3]==512:raise ValueError(('defeat',i,b))
 x=i%2*512;y=3072+i//2*512;atlas.alpha_composite(tile,(x,y));f=copy.deepcopy(template);f['id']=f'defeat-south-east-{i}';f['canvasPx']={'width':512,'height':512};f['groundPivotPx']={'x':256,'y':480};f['alphaBoundsPx']={'x':b[0],'y':b[1],'width':b[2]-b[0],'height':b[3]-b[1]};rect={'x':x,'y':y,'width':512,'height':512};f['fallbackRectPx']['rectPx']=rect;f['frameRectsPx'][0]['rectPx']=rect;frames.append(f)
for clip in a['clips']:
 if clip['stateId']=='defeat' and clip['directionId']=='south-east':clip['sequence']=[{'frameId':f'defeat-south-east-{i}','durationMs':[100,100,100,100,110,110,115,115][i]} for i in range(8)]
a['frames']=frames
# Scale derives from body baseline, not weapon or canvas extent.
a['heightWorld']=1.2161865234375*max(f['alphaBoundsPx']['height'] for f in frames)/232
a['artBoundsWorld']['max'][1]=max(a['artBoundsWorld']['max'][1],a['heightWorld']+0.1)
a['cullingBoundsWorld']['max'][1]=max(a['cullingBoundsWorld']['max'][1],a['heightWorld']+0.2)
p['provenance']['source']='Vaelora Human roster role and action sheets';p['provenance']['notes']='Incomplete runtime preview: authored action candidates are packed; unproduced action/direction clips hold idle. Zero team mask remains pending. See docs/art-direction/human-roster-v1/review.json and coverage.json for limitations.';p['packVersion']='0.5.0';p['pages'][0]['dimensionsPx']={'width':1024,'height':5120}
pix=atlas.load()
for y in range(atlas.height):
 for x in range(atlas.width):
  if pix[x,y][3]==0:pix[x,y]=(0,0,0,0)
atlas.save(out/'infantry-atlas-source.png');atlas.save(out/'infantry-atlas-runtime.png');Image.new('L',atlas.size,0).save(out/'team-accent-mask.png')
for f in p['files']:f['dimensionsPx']={'width':1024,'height':5120};f['sha256']=hashlib.sha256((out/f['path']).read_bytes()).hexdigest()
(out/'sprite-atlas-pack-v1.json').write_text(json.dumps(p,indent=2)+'\n')
(out/'README.md').write_text('# Human Infantry preview\n\nEight idle views, SE walk, attack and defeat candidates; other actions/directions hold idle. Team mask pending. Human roster completion is not claimed. Body-height baseline preserved; game motion review pending.\n')

# Preserve full canvas pivots while removing atlas-only transparent margins.
import subprocess,sys
subprocess.run([sys.executable,str(root/'scripts/compact-human-atlas.py'),str(out)],check=True)
