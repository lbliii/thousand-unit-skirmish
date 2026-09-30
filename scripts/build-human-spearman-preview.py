#!/usr/bin/env python3
"""Human Spearman candidate pack; incomplete clips remain explicit idle holds."""
from pathlib import Path
from PIL import Image
import json,copy,hashlib
root=Path(__file__).resolve().parents[1];source=root/'docs/art-direction/human-roster-v1';out=root/'assets/units/spearman-sprite-v1';out.mkdir(exist_ok=True)
p=json.loads((root/'assets/units/cast-human-sprite-v2/sprite-atlas-pack-v1.json').read_text());p=json.loads(json.dumps(p).replace('cast-human','spearman').replace('cast-atlas','spearman-atlas'));a=p['assets'][0];a['id']='spearman';a['layers'][0]['batchKey']='unit.spearman';template=copy.deepcopy(a['frames'][0]);frames=[];atlas=Image.new('RGBA',(2048,4096));headings=['east','south-east','north-east','north','north-west','west','south-west','south']
def add_action(action,folder,body_height,source_cell,source_pivot,row_offset):
 meta=json.loads((folder/'extraction.json').read_text());factor=232/body_height
 for item in meta['frames']:
  i=item['frame'];box=item['sourceBounds'];c=Image.open(folder/f'{i:02}.png').convert('RGBA');c=c.resize((round(c.width*factor),round(c.height*factor)),Image.Resampling.LANCZOS);t=Image.new('RGBA',(512,512));ox=round(256+(box[0]-(i%4)*source_cell[0]-source_pivot[0])*factor);oy=round(480+(box[1]-(i//4)*source_cell[1]-(source_pivot[1][i//4] if isinstance(source_pivot[1],list) else source_pivot[1]))*factor);t.alpha_composite(c,(ox,oy));b=t.getbbox()
  if not b or b[0]==0 or b[1]==0 or b[2]==512 or b[3]==512:raise ValueError((action,i,b))
  x=i%4*512;y=row_offset+i//4*512;atlas.alpha_composite(t,(x,y));f=copy.deepcopy(template);f['id']=f'idle-{headings[i]}-0' if action=='idle' else f'{action}-south-east-{i}';f['canvasPx']={'width':512,'height':512};f['groundPivotPx']={'x':256,'y':480};f['alphaBoundsPx']={'x':b[0],'y':b[1],'width':b[2]-b[0],'height':b[3]-b[1]};r={'x':x,'y':y,'width':512,'height':512};f['fallbackRectPx']['rectPx']=r;f['frameRectsPx'][0]['rectPx']=r;frames.append(f)
add_action('idle',source/'extracted/spearman/idle',360,(443.5,443.5),(221,436),0)
walk_folder=source/'extracted/spearman/walk/south-east'
if walk_folder.exists():add_action('walk',walk_folder,310,(384,512),(192,448),1024)
attack_folder=source/'extracted/spearman/attack/south-east'
if attack_folder.exists():add_action('attack',attack_folder,320,(443.5,443.5),(221,[436,400]),2048)
defeat_folder=source/'extracted/spearman/defeat/south-east'
if defeat_folder.exists():add_action('defeat',defeat_folder,390,(443.5,443.5),(221,[503,362.5]),3072)
a['frames']=frames;a['clips']=[{'stateId':s,'directionId':d,'loop':s!='defeat','sequence':[{'frameId':'idle-'+d+'-0','durationMs':1000}]} for s in ['idle','walk','attack','defeat'] for d in headings]
if walk_folder.exists():
 for clip in a['clips']:
  if clip['stateId']=='walk' and clip['directionId']=='south-east':clip['sequence']=[{'frameId':f'walk-south-east-{i}','durationMs':100} for i in range(8)]
if attack_folder.exists():
 for clip in a['clips']:
  if clip['stateId']=='attack' and clip['directionId']=='south-east':clip['sequence']=[{'frameId':f'attack-south-east-{i}','durationMs':[120,120,120,120,80,80,120,120][i]} for i in range(8)]
if defeat_folder.exists():
 for clip in a['clips']:
  if clip['stateId']=='defeat' and clip['directionId']=='south-east':clip['sequence']=[{'frameId':f'defeat-south-east-{i}','durationMs':[120,120,120,120,120,120,120,240][i]} for i in range(8)]
a['heightWorld']=1.2161865234375*max(f['alphaBoundsPx']['height'] for f in frames)/232;a['artBoundsWorld']['max'][1]=a['heightWorld']+0.1;a['cullingBoundsWorld']['max'][1]=a['heightWorld']+0.2;p['provenance']['source']='Vaelora Human roster role and action sheets';p['provenance']['notes']='Incomplete runtime preview: authored action candidates are packed; unproduced action/direction clips hold idle. Zero team mask remains pending. See docs/art-direction/human-roster-v1/review.json and coverage.json for limitations.';p['packVersion']='0.3.0';p['pages'][0]['dimensionsPx']={'width':2048,'height':4096};pixels=atlas.load()
for y in range(atlas.height):
 for x in range(atlas.width):
  if pixels[x,y][3]==0:pixels[x,y]=(0,0,0,0)
atlas.save(out/'spearman-atlas-source.png');atlas.save(out/'spearman-atlas-runtime.png');Image.new('L',atlas.size,0).save(out/'team-accent-mask.png')
for f in p['files']:f['dimensionsPx']={'width':2048,'height':4096};f['sha256']=hashlib.sha256((out/f['path']).read_bytes()).hexdigest()
(out/'sprite-atlas-pack-v1.json').write_text(json.dumps(p,indent=2)+'\n');(out/'README.md').write_text('# Human Spearman preview\n\nEight idle facings plus SE walk, attack and defeat candidates. Other action headings and team mask incomplete. Walk hand correction remains pending. Long weapon uses larger canvases without resizing by weapon extent. Body/root calibration remains provisional until game review.\n')

# Preserve full canvas pivots while removing atlas-only transparent margins.
import subprocess,sys
subprocess.run([sys.executable,str(root/'scripts/compact-human-atlas.py'),str(out)],check=True)
