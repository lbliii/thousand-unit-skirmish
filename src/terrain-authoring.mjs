import { townCenterFootprintCells } from './town-center-spawn.mjs';
// Before-match generation preserves both seats' build pads and all authored markers.
export function generateRollingGround(definition, seed = definition.terrainSeed || 0) {
  if(!Number.isInteger(seed)||seed<0||seed>0xffffffff) throw new Error('Terrain seed must be an unsigned 32-bit integer.');
  const {width,height}=definition,levels=new Uint8Array(width*height),protectedCells=new Uint8Array(levels.length);
  function protect(column,row,radius) {
    for(let y=Math.max(0,row-radius);y<=Math.min(height-1,row+radius);y++) for(let x=Math.max(0,column-radius);x<=Math.min(width-1,column+radius);x++) protectedCells[y*width+x]=1;
  }
  for(const spawn of definition.spawnPoints) protect(Math.floor(spawn.x+width/2),Math.floor(spawn.z+height/2),8);
  for(let team=0;team<2;team++) for(const cell of townCenterFootprintCells(definition.spawnPoints,team,width,height)) protect(cell%width,Math.floor(cell/width),2);
  for(const node of definition.resourceNodes||[]) protect(Math.floor(node.x+width/2),Math.floor(node.z+height/2),3);
  for(const t of definition.triggers||[]) for(let y=t.zone.row;y<t.zone.row+t.zone.height;y++) for(let x=t.zone.column;x<t.zone.column+t.zone.width;x++) protect(x,y,2);
  for(const o of definition.obstacles||[]) if(o.material==='water') for(let y=o.row;y<o.row+o.height;y++) for(let x=o.column;x<o.column+o.width;x++) protect(x,y,1);
  let state=seed>>>0;
  const random=()=>{state=(Math.imul(state,1664525)+1013904223)>>>0;return state/4294967296;};
  for(let hill=0;hill<Math.max(4,Math.floor(width*height/1200));hill++) {
    const cx=3+Math.floor(random()*(width/2-6)),cy=3+Math.floor(random()*(height-6)),radius=6+Math.floor(random()*7);
    for(let y=Math.max(0,cy-radius);y<=Math.min(height-1,cy+radius);y++) for(let x=0;x<width;x++) {
      const mirror=Math.min(x,width-1-x);
      if((mirror-cx)**2+(y-cy)**2<=radius**2 && !protectedCells[y*width+x]) levels[y*width+x]=1;
    }
  }
  // Protected cells are mirrored too so generation cannot favor a seat.
  for(let y=0;y<height;y++) for(let x=0;x<width/2;x++) if(protectedCells[y*width+x]||protectedCells[y*width+width-1-x]) levels[y*width+x]=levels[y*width+width-1-x]=0;
  return levels;
}
export function smoothGround(levels,width,height,cells) {
  const next=levels.slice();
  for(const cell of cells) {
    const x=cell%width,y=Math.floor(cell/width);let sum=levels[cell],count=1;
    for(const [nx,ny] of [[x-1,y],[x+1,y],[x,y-1],[x,y+1]]) if(nx>=0&&ny>=0&&nx<width&&ny<height) {sum+=levels[ny*width+nx];count++;}
    next[cell]=Math.round(sum/count);
  }
  return next;
}
export function compressGroundLevels(levels,width,height) {
  const visited=new Uint8Array(levels.length),patches=[];
  for(let row=0;row<height;row++) for(let column=0;column<width;column++) {
    const cell=row*width+column,level=levels[cell];if(!level||visited[cell]) continue;
    let w=1,h=1;
    while(column+w<width&&levels[cell+w]===level&&!visited[cell+w]) w++;
    while(row+h<height) {
      let same=true;for(let x=column;x<column+w;x++) if(levels[(row+h)*width+x]!==level||visited[(row+h)*width+x]) {same=false;break;}
      if(!same) break;h++;
    }
    for(let y=row;y<row+h;y++) visited.fill(1,y*width+column,y*width+column+w);
    patches.push({column,row,width:w,height:h,level});
  }
  return patches;
}
