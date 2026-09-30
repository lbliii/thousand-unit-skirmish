#!/usr/bin/env python3
"""Extract eight connected sprite silhouettes without nominal-cell weapon clipping."""
from PIL import Image
from pathlib import Path
import sys,json
source=Path(sys.argv[1]);dest=Path(sys.argv[2]);dest.mkdir(parents=True,exist_ok=True)
im=Image.open(source).convert('RGBA');w,h=im.size;alpha=im.getchannel('A').tobytes();seen=bytearray(w*h);components=[]
for seed,v in enumerate(alpha):
 if v<9 or seen[seed]:continue
 queue=[seed];seen[seed]=1;pixels=[]
 while queue:
  p=queue.pop();pixels.append(p);x=p%w
  neighbors=[]
  if x:neighbors.append(p-1)
  if x+1<w:neighbors.append(p+1)
  if p>=w:neighbors.append(p-w)
  if p+w<w*h:neighbors.append(p+w)
  for q in neighbors:
   if not seen[q] and alpha[q]>=9:seen[q]=1;queue.append(q)
 if len(pixels)>500:components.append(pixels)
components=sorted(components,key=len,reverse=True)[:8]
if len(components)!=8:raise ValueError(f'Expected eight silhouettes, found {len(components)}')
items=[]
for pixels in components:
 xs=[p%w for p in pixels];ys=[p//w for p in pixels];bbox=(min(xs),min(ys),max(xs)+1,max(ys)+1);items.append((bbox,pixels))
items.sort(key=lambda item:(round((item[0][1]+item[0][3])/2/h),item[0][0]))
review=[]
for i,(box,pixels) in enumerate(items):
 if box[0]==0 or box[1]==0 or box[2]==w or box[3]==h:raise ValueError(f'Frame {i} touches whole sheet edge: {box}')
for i,(box,pixels) in enumerate(items):
 mask=bytearray(w*h)
 for p in pixels:mask[p]=alpha[p]
 layer=im.copy();layer.putalpha(Image.frombytes('L',(w,h),bytes(mask)));layer=layer.crop(box)
 lp=layer.load()
 for yy in range(layer.height):
  for xx in range(layer.width):
   if lp[xx,yy][3]==0:lp[xx,yy]=(0,0,0,0)
 layer.save(dest/f'{i:02}.png');review.append({'frame':i,'sourceBounds':box,'opaquePixels':len(pixels),'note':'alpha<9 discarded consistent with game alpha test; isolated connected silhouette, no invented pixels'})
(dest/'extraction.json').write_text(json.dumps({'source':str(source),'frames':review},indent=2)+'\n');print(f'Extracted {len(items)} complete silhouettes')
