#!/usr/bin/env python3
"""Pack generated 2x2 idle/walk/attack/defeat cutouts as approximate role sprites."""
from pathlib import Path
from PIL import Image
import json,copy,hashlib,sys,subprocess
root=Path(__file__).resolve().parents[1]
role=sys.argv[1];src=root/f'docs/art-direction/human-mounted-v1/source/{role}-actions-v1.png'
out=root/f'assets/units/{role}-sprite-v1';out.mkdir(parents=True,exist_ok=True)
p=json.loads((root/'assets/units/spearman-sprite-v1/sprite-atlas-pack-v1.json').read_text())
p=json.loads(json.dumps(p).replace('spearman',role));p['packVersion']='0.1.0'
folder=root/f'docs/art-direction/human-mounted-v1/extracted/{role}'
if role == 'siege-engine':
 folder.mkdir(parents=True,exist_ok=True);source=Image.open(src).convert('RGBA');w,h=source.size
 # Source-specific gutters preserve the detached wreck and projecting bolt.
 boxes=[(0,0,w//2,h//2),(w//2,0,w,h//2),(0,h//2,round(w*.55),h),(round(w*.55),h//2,w,h)]
 for i,box in enumerate(boxes):source.crop(box).save(folder/f'{i:02}.png')
 (folder/'extraction.json').write_text(json.dumps({'source':str(src.relative_to(root)),'cellBounds':boxes,'notes':'Full alpha cells retain disconnected wreck pieces.'},indent=2)+'\n')
else:
 subprocess.run([sys.executable,str(root/'scripts/extract-human-source-components.py'),str(src),str(folder),'4'],check=True)
atlas=Image.new('RGBA',(2048,2048));frames=[];a=p['assets'][0];template=copy.deepcopy(a['frames'][0])
for i,state in enumerate(['idle','walk','attack','defeat']):
 tile=Image.open(folder/f'{i:02}.png').convert('RGBA');cw,ch=tile.size
 # Match mounted rider body to the 232px Human baseline; preserve scale through defeat.
 factor=0.70
 tile=tile.resize((round(cw*factor),round(ch*factor)),Image.Resampling.LANCZOS)
 if tile.width>768 or tile.height>768:
  raise ValueError('Source cell exceeds atlas cell; set an explicit role calibration')
 canvas=Image.new('RGBA',(768,768));canvas.alpha_composite(tile,((768-tile.width)//2,768-tile.height))
 # Suppress alpha below the runtime alpha-test threshold and zero invisible RGB.
 data=[(r,g,b,al) if al>=9 else (0,0,0,0) for r,g,b,al in canvas.getdata()];canvas.putdata(data)
 b=canvas.getbbox()
 if not b:raise ValueError('Empty pose')
 x=i%2*768;y=i//2*768;atlas.alpha_composite(canvas,(x,y))
 f=copy.deepcopy(template);f['id']=f'{state}-south-east-0';f['canvasPx']={'width':768,'height':768};f['groundPivotPx']={'x':384,'y':b[3]-1};f['alphaBoundsPx']={'x':b[0],'y':b[1],'width':b[2]-b[0],'height':b[3]-b[1]}
 rect={'x':x,'y':y,'width':768,'height':768};f['fallbackRectPx']['rectPx']=rect;f['frameRectsPx'][0]['rectPx']=rect;f['frameRectsPx'][0]['offsetPx']={'x':0,'y':0};frames.append(f)
a['frames']=frames;a['clips']=[{'stateId':s,'directionId':d,'loop':s!='defeat','sequence':[{'frameId':f'{s}-south-east-0','durationMs':1000}]} for s in ['idle','walk','attack','defeat'] for d in ['north','north-east','east','south-east','south','south-west','west','north-west']]
a['heightWorld']=1.2161865234375*max(f['alphaBoundsPx']['height'] for f in frames)/232
for key in ['artBoundsWorld','cullingBoundsWorld']:a[key]={'min':[-0.9,0,-0.9],'max':[0.9,a['heightWorld']+0.2,0.9]}
p['provenance']['source']=str(src.relative_to(root));p['provenance']['notes']='Built-in ImageGen, Vaelora Human source reference. Four approximate static action poses reused for all headings. No animation or directional fidelity claim. Neutral team mask pending.'
p['pages'][0]['dimensionsPx']={'width':2048,'height':2048}
for usage in ['source','runtime']:atlas.save(out/f'{role}-atlas-{usage}.png')
Image.new('L',atlas.size,0).save(out/'team-accent-mask.png')
for file in p['files']:file['dimensionsPx']={'width':2048,'height':2048};file['sha256']=hashlib.sha256((out/file['path']).read_bytes()).hexdigest()
(out/'sprite-atlas-pack-v1.json').write_text(json.dumps(p,indent=2)+'\n')
(out/'README.md').write_text(f'# Human {role} initial pass\n\nFour static action poses, reused for all headings. Animation, directions, root calibration and team accents remain polish. Source and prompt evidence: docs/art-direction/human-mounted-v1.\n')

subprocess.run([sys.executable,str(root/'scripts/compact-human-atlas.py'),str(out)],check=True)
