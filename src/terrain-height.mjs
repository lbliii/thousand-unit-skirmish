import { buildElevationGrid } from './map-utils.mjs';
export const GROUND_LEVEL_HEIGHT = 0.8;
const fields = new WeakMap();
let activeField = null;

export function terrainHeightField(definition) {
  if (fields.has(definition)) return fields.get(definition);
  const {width,height}=definition;
  const levels=buildElevationGrid(width,height,definition.elevationPatches);
  const raised=levels.some(level=>level>0);
  function calculateCorners(column,row) {
    const own=levels[row*width+column];
    return [[0,0],[1,0],[0,1],[1,1]].map(([dx,dz])=> {
      let total=0,count=0;
      for(let y=row+dz-1;y<=row+dz;y++) for(let x=column+dx-1;x<=column+dx;x++) {
        if(x<0||y<0||x>=width||y>=height) continue;
        const value=levels[y*width+x];
        // A two-level edge stays a discontinuity: its wall remains visible.
        if(Math.abs(value-own)>1) continue;
        total+=value;count++;
      }
      return total/count*GROUND_LEVEL_HEIGHT;
    });
  }
  const cornerHeights=new Float32Array(width*height*4);
  if(raised) for(let row=0;row<height;row++) for(let col=0;col<width;col++) cornerHeights.set(calculateCorners(col,row),(row*width+col)*4);
  function corners(column,row) { const i=(row*width+column)*4;return Array.from(cornerHeights.subarray(i,i+4)); }
  function sample(x,z) {
    if(!raised) return 0;
    const gx=Math.max(0,Math.min(width-1e-6,x+width/2));
    const gz=Math.max(0,Math.min(height-1e-6,z+height/2));
    const column=Math.floor(gx),row=Math.floor(gz),u=gx-column,v=gz-row;
    const i=(row*width+column)*4;
    const nw=cornerHeights[i],ne=cornerHeights[i+1],sw=cornerHeights[i+2],se=cornerHeights[i+3];
    // Same diagonal and interpolation as the two triangles in the ground mesh.
    return u>=v ? nw+(ne-nw)*u+(se-ne)*v : nw+(se-sw)*u+(sw-nw)*v;
  }
  const field={width,height,levels,raised,corners,sample};
  fields.set(definition,field);return field;
}
export function setActiveTerrain(definition) { activeField=terrainHeightField(definition);return activeField; }
export function groundHeight(x,z) { return activeField?.sample(x,z)||0; }
