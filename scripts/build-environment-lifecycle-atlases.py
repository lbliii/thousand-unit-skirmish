from PIL import Image
from pathlib import Path
import json,hashlib
root=Path('assets/environment/frontier-v1')
for region,family in [('bellweather','bellweather-field-maple'),('sereward','sereward-palm'),('pale-meridian','pale-meridian-conifer'),('siltmouths','siltmouths-tidal-tree'),('vesperra','vesperra-mistbark')]:
 old=json.loads((root/(region+'-lifecycle-manifest.json')).read_text()); assets=old['assets'];w,h=Image.open(root/assets[0]['runtimeFile']).size
 g=64;pw=(w+2*g)*2;ph=(h+2*g)*2;page=Image.new('RGBA',(pw,ph));frames=[];clips=[]
 for i,a in enumerate(assets):
  im=Image.open(root/a['runtimeFile']).convert('RGBA');assert im.size==(w,h);x=g+i%2*(w+2*g);y=g+i//2*(h+2*g);page.paste(im,(x,y))
  # Padding copies edge RGB but contributes no visible alpha.
  for box,size,pos in [((0,0,1,h),(g,h),(x-g,y)),((w-1,0,w,h),(g,h),(x+w,y)),((0,0,w,1),(w,g),(x,y-g)),((0,h-1,w,h),(w,g),(x,y+h)),((0,0,1,1),(g,g),(x-g,y-g)),((w-1,0,w,1),(g,g),(x+w,y-g)),((0,h-1,1,h),(g,g),(x-g,y+h)),((w-1,h-1,w,h),(g,g),(x+w,y+h))]:
   pad=im.crop(box).resize(size,Image.Resampling.NEAREST);pad.putalpha(0);page.paste(pad,pos)
  bbox=im.getchannel('A').point(lambda v:255 if v>=96 else 0).getbbox();rect={'x':x,'y':y,'width':w,'height':h}
  frames.append({'id':a['stage'],'canvasPx':{'width':w,'height':h},'groundPivotPx':{'x':w/2,'y':h},'groundPivotStatus':'reviewed','alphaBoundsPx':{'x':bbox[0],'y':bbox[1],'width':bbox[2]-bbox[0],'height':bbox[3]-bbox[1]},'fallbackRectPx':{'pageId':'color','rectPx':rect}})
  clips.append({'stateId':a['stage'],'directionId':'fixed-oblique','loop':True,'sequence':[{'frameId':a['stage'],'durationMs':1000}]})
 name=region+'-lifecycle-atlas';page.save(root/(name+'.png'));page.save(root/(name+'.webp'),'WEBP',quality=86,method=6)
 decoded=Image.open(root/(name+'.webp')).convert('RGBA');assert decoded.getchannel('A').tobytes()==page.getchannel('A').tobytes()
 files=[]
 for ext,usage in [('png','source'),('webp','runtime')]:
  f=root/(name+'.'+ext);files.append({'id':usage,'path':f.name,'usage':usage,'format':ext,'sha256':hashlib.sha256(f.read_bytes()).hexdigest(),'dimensionsPx':{'width':pw,'height':ph}})
 ww=assets[0]['worldSize']['width'];wh=assets[0]['worldSize']['height']
 m={'schemaVersion':1,'packId':'environment.vaelora-'+region+'-lifecycle-atlas','packVersion':'1.0.0','maturity':'runtime-candidate','provenance':{'license':'project-owned','source':region+'-lifecycle-manifest.json','authoringTool':'Pillow deterministic page packing','notes':'Exact decoded approved runtime pixels, no repaint or rescaling. Runtime WebP quality86; PNG page preserves exact decoded approved pixels. Fixed camera; state clips reserve direction IDs. 64px transparent RGB edge-extension gutter, mip cap6, half-texel inset. Original generated masters retained.'},'files':files,'pages':[{'id':'color','sourceFileId':'source','runtimeFileId':'runtime','dimensionsPx':{'width':pw,'height':ph},'colorSpace':'srgb','pixelFormat':'rgba8','alphaMode':'straight','edgeRule':'bleed-rgb-under-transparent','gutterPx':g,'gutterRule':'edge-extended','wrapMode':'clamp','sampling':{'generateMipmaps':True,'minFilter':'linear-mipmap-linear','magFilter':'linear','uvInsetPx':0.5,'maxMipLevel':6}}],'assets':[{'id':family,'kind':'environment','artBoundsWorld':{'min':[-ww/2,0,0],'max':[ww/2,wh,0]},'heightWorld':wh,'sortAnchorWorld':[0,0,0],'frames':frames,'clips':clips}]}
 (root/(name+'.json')).write_text(json.dumps(m,indent=2)+'\n');print(name,page.size,(root/(name+'.webp')).stat().st_size)
