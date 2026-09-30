from PIL import Image
from pathlib import Path
import json,copy,hashlib
root=Path(__file__).resolve().parents[1];src=root/'assets/units/cast-human-sprite-v2';out=root/'assets/units/cast-human-sprite-v3';out.mkdir(exist_ok=True)
p=json.loads((src/'sprite-atlas-pack-v1.json').read_text())
# Turnaround cells were authored in screen order; runtime headings use world yaw.
heading={'east':'east','south-east':'south-east','south':'north-east','south-west':'north','west':'north-west','north-west':'west','north':'south-west','north-east':'south'}
for frame in p['assets'][0]['frames']:
 old=frame['id'][5:-2];frame['id']='idle-'+heading[old]+'-0'
for clip in p['assets'][0]['clips']:
 old=clip['directionId'];clip['directionId']=heading[old];clip['sequence'][0]['frameId']='idle-'+heading[old]+'-0'
base=Image.open(src/'cast-atlas-runtime.png').convert('RGBA');atlas=Image.new('RGBA',(2048,6656));atlas.alpha_composite(base)
walk=Image.open(root/'docs/art-direction/human-roster-v1/source/worker-walk-SE-v3.png').convert('RGBA')
for i in range(8):
 cell=walk.crop(((i%4)*384,(i//4)*512,(i%4+1)*384,(i//4+1)*512));cell=cell.resize((256,341),Image.Resampling.LANCZOS)
 tile=Image.new('RGBA',(256,256));tile.alpha_composite(cell,(0,-55))
 pix=tile.load()
 for yy in range(256):
  for xx in range(256):
   if pix[xx,yy][3]<9:pix[xx,yy]=(0,0,0,0)
 b=tile.getbbox()
 if not b or b[0]==0 or b[1]==0 or b[2]==256 or b[3]==256:raise ValueError((i,b))
 x=i%4*256;y=512+i//4*256;atlas.alpha_composite(tile,(x,y));f=copy.deepcopy(p['assets'][0]['frames'][0]);f['id']=f'walk-south-east-{i}';f['groundPivotPx']={'x':128,'y':244};f['alphaBoundsPx']={'x':b[0],'y':b[1],'width':b[2]-b[0],'height':b[3]-b[1]};rect={'x':x,'y':y,'width':256,'height':256};f['fallbackRectPx']['rectPx']=rect;f['frameRectsPx'][0]['rectPx']=rect;p['assets'][0]['frames'].append(f)
for c in p['assets'][0]['clips']:
 if c['stateId']=='walk' and c['directionId']=='south-east':c['sequence']=[{'frameId':f'walk-south-east-{i}','durationMs':100} for i in range(8)]
build_folder=root/'docs/art-direction/human-roster-v1/extracted/worker/build/south-east'
if build_folder.exists():
 meta=json.loads((build_folder/'extraction.json').read_text());factor=232/410
 for item in meta['frames']:
  i=item['frame'];box=item['sourceBounds'];cell=Image.open(build_folder/f'{i:02}.png').convert('RGBA');cell=cell.resize((round(cell.width*factor),round(cell.height*factor)),Image.Resampling.LANCZOS);tile=Image.new('RGBA',(512,512));ox=round(256+(box[0]-i%4*443.5-250)*factor);oy=round(480+(box[1]-i//4*443.5-[439,424.5][i//4])*factor);tile.alpha_composite(cell,(ox,oy));b=tile.getbbox()
  if not b or b[0]==0 or b[1]==0 or b[2]==512 or b[3]==512:raise ValueError(('build',i,b))
  x=i%4*512;y=1024+i//4*512;atlas.alpha_composite(tile,(x,y));f=copy.deepcopy(p['assets'][0]['frames'][0]);f['id']=f'build-south-east-{i}';f['canvasPx']={'width':512,'height':512};f['groundPivotPx']={'x':256,'y':480};f['alphaBoundsPx']={'x':b[0],'y':b[1],'width':b[2]-b[0],'height':b[3]-b[1]};rect={'x':x,'y':y,'width':512,'height':512};f['fallbackRectPx']['rectPx']=rect;f['frameRectsPx'][0]['rectPx']=rect;p['assets'][0]['frames'].append(f)
 clips=p['assets'][0]['clips'];clips[:]=[c for c in clips if not(c['stateId']=='build' and c['directionId']=='south-east')];clips.append({'stateId':'build','directionId':'south-east','loop':True,'sequence':[{'frameId':f'build-south-east-{i}','durationMs':[120,100,160,80,80,100,100,100][i]} for i in range(8)]})
 a=p['assets'][0];a['heightWorld']=1.2161865234375*max(f['alphaBoundsPx']['height'] for f in a['frames'])/232;a['artBoundsWorld']['max'][1]=a['heightWorld']+0.1;a['cullingBoundsWorld']['max'][1]=a['heightWorld']+0.2
wood_folder=root/'docs/art-direction/human-roster-v1/extracted/worker/gather-wood/south-east'
if wood_folder.exists():
 meta=json.loads((wood_folder/'extraction.json').read_text());factor=232/380
 for item in meta['frames']:
  i=item['frame'];box=item['sourceBounds'];cell=Image.open(wood_folder/f'{i:02}.png').convert('RGBA');cell=cell.resize((round(cell.width*factor),round(cell.height*factor)),Image.Resampling.LANCZOS);tile=Image.new('RGBA',(512,512));ox=round(256+(box[0]-i%4*443.5-250)*factor);oy=round(480+(box[1]-i//4*443.5-[447,416.5][i//4])*factor);tile.alpha_composite(cell,(ox,oy));b=tile.getbbox()
  if not b or b[0]==0 or b[1]==0 or b[2]==512 or b[3]==512:raise ValueError(('gather-wood',i,b))
  x=i%4*512;y=2048+i//4*512;atlas.alpha_composite(tile,(x,y));f=copy.deepcopy(p['assets'][0]['frames'][0]);f['id']=f'gather-wood-south-east-{i}';f['canvasPx']={'width':512,'height':512};f['groundPivotPx']={'x':256,'y':480};f['alphaBoundsPx']={'x':b[0],'y':b[1],'width':b[2]-b[0],'height':b[3]-b[1]};rect={'x':x,'y':y,'width':512,'height':512};f['fallbackRectPx']['rectPx']=rect;f['frameRectsPx'][0]['rectPx']=rect;p['assets'][0]['frames'].append(f)
 clips=p['assets'][0]['clips'];clips[:]=[c for c in clips if not(c['stateId']=='gather-wood' and c['directionId']=='south-east')];clips.append({'stateId':'gather-wood','directionId':'south-east','loop':True,'sequence':[{'frameId':f'gather-wood-south-east-{i}','durationMs':[120,100,160,80,80,100,100,100][i]} for i in range(8)]})
 a=p['assets'][0];a['heightWorld']=1.2161865234375*max(f['alphaBoundsPx']['height'] for f in a['frames'])/232;a['artBoundsWorld']['max'][1]=a['heightWorld']+0.1;a['cullingBoundsWorld']['max'][1]=a['heightWorld']+0.2
food_folder=root/'docs/art-direction/human-roster-v1/extracted/worker/gather-food/south-east'
if food_folder.exists():
 meta=json.loads((food_folder/'extraction.json').read_text());factor=232/405
 for item in meta['frames']:
  i=item['frame'];box=item['sourceBounds'];cell=Image.open(food_folder/f'{i:02}.png').convert('RGBA');cell=cell.resize((round(cell.width*factor),round(cell.height*factor)),Image.Resampling.LANCZOS);tile=Image.new('RGBA',(512,512));ox=round(256+(box[0]-i%4*443.5-250)*factor);oy=round(480+(box[1]-i//4*443.5-[430,405.5][i//4])*factor);tile.alpha_composite(cell,(ox,oy));b=tile.getbbox()
  if not b or b[0]==0 or b[1]==0 or b[2]==512 or b[3]==512:raise ValueError(('gather-food',i,b))
  x=i%4*512;y=3072+i//4*512;atlas.alpha_composite(tile,(x,y));f=copy.deepcopy(p['assets'][0]['frames'][0]);f['id']=f'gather-food-south-east-{i}';f['canvasPx']={'width':512,'height':512};f['groundPivotPx']={'x':256,'y':480};f['alphaBoundsPx']={'x':b[0],'y':b[1],'width':b[2]-b[0],'height':b[3]-b[1]};rect={'x':x,'y':y,'width':512,'height':512};f['fallbackRectPx']['rectPx']=rect;f['frameRectsPx'][0]['rectPx']=rect;p['assets'][0]['frames'].append(f)
 clips=p['assets'][0]['clips'];clips[:]=[c for c in clips if not(c['stateId']=='gather-food' and c['directionId']=='south-east')];clips.append({'stateId':'gather-food','directionId':'south-east','loop':True,'sequence':[{'frameId':f'gather-food-south-east-{i}','durationMs':[120,100,160,80,80,100,100,100][i]} for i in range(8)]})
 a=p['assets'][0];a['heightWorld']=1.2161865234375*max(f['alphaBoundsPx']['height'] for f in a['frames'])/232;a['artBoundsWorld']['max'][1]=a['heightWorld']+0.1;a['cullingBoundsWorld']['max'][1]=a['heightWorld']+0.2
repair_folder=root/'docs/art-direction/human-roster-v1/extracted/worker/repair/south-east'
if repair_folder.exists():
 meta=json.loads((repair_folder/'extraction.json').read_text());factor=232/410
 for item in meta['frames']:
  i=item['frame'];box=item['sourceBounds'];cell=Image.open(repair_folder/f'{i:02}.png').convert('RGBA');cell=cell.resize((round(cell.width*factor),round(cell.height*factor)),Image.Resampling.LANCZOS);tile=Image.new('RGBA',(256,256));ox=round(128+(box[0]-i%4*443.5-250)*factor);oy=round(244+(box[1]-i//4*443.5-[417,387.5][i//4])*factor);tile.alpha_composite(cell,(ox,oy));b=tile.getbbox()
  if not b or b[0]==0 or b[1]==0 or b[2]==256 or b[3]==256:raise ValueError(('repair',i,b))
  x=1024+i%4*256;y=i//4*256;atlas.alpha_composite(tile,(x,y));f=copy.deepcopy(p['assets'][0]['frames'][0]);f['id']=f'repair-south-east-{i}';f['canvasPx']={'width':256,'height':256};f['groundPivotPx']={'x':128,'y':244};f['alphaBoundsPx']={'x':b[0],'y':b[1],'width':b[2]-b[0],'height':b[3]-b[1]};rect={'x':x,'y':y,'width':256,'height':256};f['fallbackRectPx']['rectPx']=rect;f['frameRectsPx'][0]['rectPx']=rect;p['assets'][0]['frames'].append(f)
 clips=p['assets'][0]['clips'];clips[:]=[c for c in clips if not(c['stateId']=='repair' and c['directionId']=='south-east')];clips.append({'stateId':'repair','directionId':'south-east','loop':True,'sequence':[{'frameId':f'repair-south-east-{i}','durationMs':[120,100,160,80,80,100,100,100][i]} for i in range(8)]})
 a=p['assets'][0];a['heightWorld']=1.2161865234375*max(f['alphaBoundsPx']['height'] for f in a['frames'])/232;a['artBoundsWorld']['max'][1]=a['heightWorld']+0.1;a['cullingBoundsWorld']['max'][1]=a['heightWorld']+0.2
rear_walk_folder=root/'docs/art-direction/human-roster-v1/extracted/worker/walk/south-west'
if rear_walk_folder.exists():
 meta=json.loads((rear_walk_folder/'extraction.json').read_text());factor=232/390
 for item in meta['frames']:
  i=item['frame'];box=item['sourceBounds'];cell=Image.open(rear_walk_folder/f'{i:02}.png').convert('RGBA');cell=cell.resize((round(cell.width*factor),round(cell.height*factor)),Image.Resampling.LANCZOS);tile=Image.new('RGBA',(256,256));ox=round(128+(box[0]-i%4*384-192)*factor);oy=round(244+(box[1]-i//4*512-[464,426][i//4])*factor);tile.alpha_composite(cell,(ox,oy));b=tile.getbbox()
  if not b or b[0]==0 or b[1]==0 or b[2]==256 or b[3]==256:raise ValueError(('walk-south-west',i,b))
  x=1024+i%4*256;y=512+i//4*256;atlas.alpha_composite(tile,(x,y));f=copy.deepcopy(p['assets'][0]['frames'][0]);f['id']=f'walk-south-west-{i}';f['canvasPx']={'width':256,'height':256};f['groundPivotPx']={'x':128,'y':244};f['alphaBoundsPx']={'x':b[0],'y':b[1],'width':b[2]-b[0],'height':b[3]-b[1]};rect={'x':x,'y':y,'width':256,'height':256};f['fallbackRectPx']['rectPx']=rect;f['frameRectsPx'][0]['rectPx']=rect;p['assets'][0]['frames'].append(f)
 clips=p['assets'][0]['clips'];clips[:]=[c for c in clips if not(c['stateId']=='walk' and c['directionId']=='south-west')];clips.append({'stateId':'walk','directionId':'south-west','loop':True,'sequence':[{'frameId':f'walk-south-west-{i}','durationMs':100} for i in range(8)]})
 a=p['assets'][0];a['heightWorld']=1.2161865234375*max(f['alphaBoundsPx']['height'] for f in a['frames'])/232;a['artBoundsWorld']['max'][1]=a['heightWorld']+0.1;a['cullingBoundsWorld']['max'][1]=a['heightWorld']+0.2
attack_folder=root/'docs/art-direction/human-roster-v1/extracted/worker/attack/south-east'
if attack_folder.exists():
 meta=json.loads((attack_folder/'extraction.json').read_text());factor=232/385
 for item in meta['frames']:
  i=item['frame'];box=item['sourceBounds'];cell=Image.open(attack_folder/f'{i:02}.png').convert('RGBA');cell=cell.resize((round(cell.width*factor),round(cell.height*factor)),Image.Resampling.LANCZOS);tile=Image.new('RGBA',(512,512));ox=round(256+(box[0]-i%4*443.5-250)*factor);oy=round(480+(box[1]-i//4*443.5-[430,407.5][i//4])*factor);tile.alpha_composite(cell,(ox,oy));b=tile.getbbox()
  if not b or b[0]==0 or b[1]==0 or b[2]==512 or b[3]==512:raise ValueError(('attack',i,b))
  x=i%4*512;y=4096+i//4*512;atlas.alpha_composite(tile,(x,y));f=copy.deepcopy(p['assets'][0]['frames'][0]);f['id']=f'attack-south-east-{i}';f['canvasPx']={'width':512,'height':512};f['groundPivotPx']={'x':256,'y':480};f['alphaBoundsPx']={'x':b[0],'y':b[1],'width':b[2]-b[0],'height':b[3]-b[1]};rect={'x':x,'y':y,'width':512,'height':512};f['fallbackRectPx']['rectPx']=rect;f['frameRectsPx'][0]['rectPx']=rect;p['assets'][0]['frames'].append(f)
 clips=p['assets'][0]['clips'];clips[:]=[c for c in clips if not(c['stateId']=='attack' and c['directionId']=='south-east')];clips.append({'stateId':'attack','directionId':'south-east','loop':False,'sequence':[{'frameId':f'attack-south-east-{i}','durationMs':[120,100,160,80,80,100,100,100][i]} for i in range(8)]})
 a=p['assets'][0];a['heightWorld']=1.2161865234375*max(f['alphaBoundsPx']['height'] for f in a['frames'])/232;a['artBoundsWorld']['max'][1]=a['heightWorld']+0.1;a['cullingBoundsWorld']['max'][1]=a['heightWorld']+0.2
defeat_folder=root/'docs/art-direction/human-roster-v1/extracted/worker/defeat/south-east'
if defeat_folder.exists():
 meta=json.loads((defeat_folder/'extraction.json').read_text());factor=232/410
 for item in meta['frames']:
  i=item['frame'];box=item['sourceBounds'];cell=Image.open(defeat_folder/f'{i:02}.png').convert('RGBA');cell=cell.resize((round(cell.width*factor),round(cell.height*factor)),Image.Resampling.LANCZOS);tile=Image.new('RGBA',(512,512));ox=round(256+(box[0]-i%4*443.5-250)*factor);oy=round(480+(box[1]-i//4*443.5-[454,396.5][i//4])*factor);tile.alpha_composite(cell,(ox,oy));b=tile.getbbox()
  if not b or b[0]==0 or b[1]==0 or b[2]==512 or b[3]==512:raise ValueError(('defeat',i,b))
  x=i%4*512;y=5120+i//4*512;atlas.alpha_composite(tile,(x,y));f=copy.deepcopy(p['assets'][0]['frames'][0]);f['id']=f'defeat-south-east-{i}';f['canvasPx']={'width':512,'height':512};f['groundPivotPx']={'x':256,'y':480};f['alphaBoundsPx']={'x':b[0],'y':b[1],'width':b[2]-b[0],'height':b[3]-b[1]};rect={'x':x,'y':y,'width':512,'height':512};f['fallbackRectPx']['rectPx']=rect;f['frameRectsPx'][0]['rectPx']=rect;p['assets'][0]['frames'].append(f)
 clips=p['assets'][0]['clips'];clips[:]=[c for c in clips if not(c['stateId']=='defeat' and c['directionId']=='south-east')];clips.append({'stateId':'defeat','directionId':'south-east','loop':False,'sequence':[{'frameId':f'defeat-south-east-{i}','durationMs':[120,100,160,80,80,100,100,100][i]} for i in range(8)]})
 a=p['assets'][0];a['heightWorld']=1.2161865234375*max(f['alphaBoundsPx']['height'] for f in a['frames'])/232;a['artBoundsWorld']['max'][1]=a['heightWorld']+0.1;a['cullingBoundsWorld']['max'][1]=a['heightWorld']+0.2
front_folder=root/'docs/art-direction/human-roster-v1/extracted/worker/walk/north-east'
if front_folder.exists():
 for i in range(8):
  cell=Image.open(front_folder/f'{i:02}.png').convert('RGBA');factor=232/cell.height;cell=cell.resize((round(cell.width*factor),232),Image.Resampling.LANCZOS);tile=Image.new('RGBA',(256,256));tile.alpha_composite(cell,((256-cell.width)//2,12));b=tile.getbbox()
  if not b or b[0]==0 or b[2]==256:raise ValueError(('front-walk',i,b))
  x=i%4*256;y=6144+i//4*256;atlas.alpha_composite(tile,(x,y));f=copy.deepcopy(p['assets'][0]['frames'][0]);f['id']=f'walk-north-east-{i}';f['canvasPx']={'width':256,'height':256};f['groundPivotPx']={'x':128,'y':244};f['alphaBoundsPx']={'x':b[0],'y':b[1],'width':b[2]-b[0],'height':b[3]-b[1]};rect={'x':x,'y':y,'width':256,'height':256};f['fallbackRectPx']['rectPx']=rect;f['frameRectsPx'][0]['rectPx']=rect;p['assets'][0]['frames'].append(f)
 for c in p['assets'][0]['clips']:
  if c['stateId']=='walk' and c['directionId']=='north-east':c['sequence']=[{'frameId':f'walk-north-east-{i}','durationMs':100} for i in range(8)]
p['provenance']['source']='Vaelora Human roster role and action sheets';p['provenance']['notes']='Incomplete runtime preview: authored action candidates are packed; unproduced action/direction clips hold idle. Zero team mask remains pending. See docs/art-direction/human-roster-v1/review.json and coverage.json for limitations.';p['packVersion']='0.13.0';p['pages'][0]['dimensionsPx']={'width':2048,'height':6656}
a=atlas.load()
for y in range(atlas.height):
 for x in range(atlas.width):
  if a[x,y][3]==0:a[x,y]=(0,0,0,0)
atlas.save(out/'cast-atlas-runtime.png');atlas.save(out/'cast-atlas-source.png');Image.new('L',atlas.size,0).save(out/'team-accent-mask.png')
for f in p['files']:f['dimensionsPx']={'width':2048,'height':6656};f['sha256']=hashlib.sha256((out/f['path']).read_bytes()).hexdigest()
(out/'sprite-atlas-pack-v1.json').write_text(json.dumps(p,indent=2)+'\n');(out/'README.md').write_text('# Human motion preview\n\nOpt in with `?humanVaeloraPreview=1&humanAnimationPreview=1`. Eight idle facings plus eight south-east, eight south-west and eight north-east walk keys and eight construction, wood-gathering and food-gathering repair, attack and defeat keys. Other directions/actions hold idle, team sash mask pending. Not complete animation coverage. Source worker-walk-SE-v3.png; transparent RGB sanitized for runtime packaging.\n')

# Runtime supports trimmed rectangles through their canvas offsets.
import subprocess,sys
subprocess.run([sys.executable,str(root/'scripts/compact-human-atlas.py'),str(out)],check=True)
