#!/usr/bin/env python3
"""Pack first-pass Boughward action silhouettes for the existing unit roles."""
from pathlib import Path
from PIL import Image

import json,copy,hashlib,sys,subprocess
root=Path(__file__).resolve().parents[1];role=sys.argv[1]
if role not in ['worker','infantry','spearman','archer','scout','rider','siege-engine']:raise ValueError(role)
key=f'boughward-{role}';source=root/'docs/art-direction/boughward-roster-v1';src=source/f'source/{role}-actions-v1.png';folder=source/f'extracted/{role}'
out=root/f'assets/units/{key}-sprite-v1';out.mkdir(parents=True,exist_ok=True)
states=['idle','walk','gather-wood','gather-food','build','repair','attack','defeat'] if role=='worker' else ['idle','walk','attack','defeat']
if role in ['siege-engine','archer']:
 im=Image.open(src).convert('RGBA');w,h=im.size;folder.mkdir(parents=True,exist_ok=True)
 boxes=[(0,0,w//2,h//2),(w//2,0,w,h//2),(0,h//2,w//2,h),(w//2,h//2,w,h)]
 for i,box in enumerate(boxes):
  tile=im.crop(box)
  if role=='archer':
   pixels=tile.load();seen=set()
   for yy in range(tile.height):
    for xx in range(tile.width):
     if (xx,yy) in seen or pixels[xx,yy][3]<=8:continue
     pending=[(xx,yy)];seen.add((xx,yy));component=[]
     while pending:
      x,y=pending.pop();component.append((x,y))
      for nx,ny in [(x-1,y),(x+1,y),(x,y-1),(x,y+1)]:
       if 0<=nx<tile.width and 0<=ny<tile.height and (nx,ny) not in seen and pixels[nx,ny][3]>8:seen.add((nx,ny));pending.append((nx,ny))
     if len(component)<1000:
      for x,y in component:pixels[x,y]=(0,0,0,0)
  tile.save(folder/f'{i:02}.png')
 (folder/'extraction.json').write_text(json.dumps({'source':str(src.relative_to(root)),'cellBounds':boxes},indent=2)+'\n')
else:subprocess.run([sys.executable,str(root/'scripts/extract-human-source-components.py'),str(src),str(folder),str(len(states))],check=True)
p=json.loads((root/'assets/units/spearman-sprite-v1/sprite-atlas-pack-v1.json').read_text());p=json.loads(json.dumps(p).replace('spearman',key));p['packVersion']='0.1.0';a=p['assets'][0];template=copy.deepcopy(a['frames'][0]);atlas=Image.new('RGBA',(2048,2048));frames=[]
idle=Image.open(folder/'00.png').convert('RGBA');body_height=idle.getchannel('A').getbbox()[3]-idle.getchannel('A').getbbox()[1]
factor=0.65 if role in ['scout','rider','siege-engine'] else (194 if role=='archer' else 232)/body_height
for i,state in enumerate(states):
 tile=Image.open(folder/f'{i:02}.png').convert('RGBA');tile=tile.resize((round(tile.width*factor),round(tile.height*factor)),Image.Resampling.LANCZOS)
 if tile.width>512 or tile.height>512:raise ValueError(f'{role}/{state} exceeds 512 canvas: {tile.size}')
 canvas=Image.new('RGBA',(512,512));canvas.alpha_composite(tile,((512-tile.width)//2,512-tile.height));canvas.putdata([(r,g,b,al) if al>=9 else (0,0,0,0) for r,g,b,al in canvas.getdata()]);b=canvas.getbbox()
 if not b:raise ValueError('Empty action')
 x=i%4*512;y=i//4*512;atlas.alpha_composite(canvas,(x,y));f=copy.deepcopy(template);f['id']=f'{state}-south-east-0';f['canvasPx']={'width':512,'height':512};f['groundPivotPx']={'x':256,'y':b[3]-1};f['alphaBoundsPx']={'x':b[0],'y':b[1],'width':b[2]-b[0],'height':b[3]-b[1]};rect={'x':x,'y':y,'width':512,'height':512};f['fallbackRectPx']['rectPx']=rect;f['frameRectsPx'][0]['rectPx']=rect;f['frameRectsPx'][0]['offsetPx']={'x':0,'y':0};frames.append(f)
a['frames']=frames;a['clips']=[{'stateId':s,'directionId':d,'loop':s!='defeat','sequence':[{'frameId':f'{s}-south-east-0','durationMs':1000}]} for s in states for d in ['north','north-east','east','south-east','south','south-west','west','north-west']]
if role=='worker':a['clips'] += [{**c,'stateId':'gather'} for c in a['clips'] if c['stateId']=='gather-wood']
a['heightWorld']=1.2161865234375*max(f['alphaBoundsPx']['height'] for f in frames)/232
for k in ['artBoundsWorld','cullingBoundsWorld']:a[k]={'min':[-0.9,0,-0.9],'max':[0.9,a['heightWorld']+0.2,0.9]}
p['provenance']['source']=str(src.relative_to(root));p['provenance']['notes']='Built-in ImageGen derived from Boughward exploration. Static approximate action poses reused across headings; neutral team mask and root calibration pending live review.';p['pages'][0]['dimensionsPx']={'width':2048,'height':2048}
for usage in ['source','runtime']:atlas.save(out/f'{key}-atlas-{usage}.png')
Image.new('L',atlas.size,0).save(out/'team-accent-mask.png')
for f in p['files']:f['dimensionsPx']={'width':2048,'height':2048};f['sha256']=hashlib.sha256((out/f['path']).read_bytes()).hexdigest()
(out/'sprite-atlas-pack-v1.json').write_text(json.dumps(p,indent=2)+'\n');(out/'README.md').write_text(f'# Boughward {role}\n\nInitial static action poses reused across all headings. Sources, prompts and limits in docs/art-direction/boughward-roster-v1.\n')
subprocess.run([sys.executable,str(root/'scripts/compact-human-atlas.py'),str(out)],check=True)
