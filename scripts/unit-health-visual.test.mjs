import { unitPresentation } from '../src/gameplay-presentation.mjs';
import { UNIT_DEFINITIONS } from '../src/gameplay-definitions.mjs';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const source = readFileSync(new URL('../src/main.js', import.meta.url), 'utf8');
const start = source.indexOf('function updateUnitHealthVisual(');
assert.ok(start >= 0, 'the actual client must expose damaged-unit health');
const functionSource = source.slice(start, source.indexOf('\nfunction updateUnitTransform(', start));
function fixture() {
  const matrices = [new Map(), new Map()];
  const colors = new Map();
  const mesh = (index) => ({
    setMatrixAt(slot, matrix) { matrices[index].set(slot, structuredClone(matrix)); },
    setColorAt(slot, color) { colors.set(slot, color.hex); },
    instanceMatrix: {}, instanceColor: {},
  });
  const dummy = {
    position: { set(x, y, z) { Object.assign(this, { x, y, z }); } },
    scale: { set(x, y, z) { Object.assign(this, { x, y, z }); } },
    quaternion: { copy() {} },
    translateX(x) { this.position.x += x; },
    updateMatrix() { this.matrix = { x: this.position.x, y: this.position.y,
      z: this.position.z, scaleX: this.scale.x, scaleY: this.scale.y }; },
  };
  const context = vm.createContext({ UNIT_DEFINITIONS, unitPresentation, dummy, camera: { quaternion: {} },
    color: { setHex(hex) { this.hex = hex; } },
    unitHealthBackground: mesh(0), unitHealthFill: mesh(1),
  });
  vm.runInContext(functionSource, context);
  return { update: context.updateUnitHealthVisual, matrices, colors };
}
for (const team of [0, 1]) {
  for (const kind of Object.keys(UNIT_DEFINITIONS)) {
    test(`${team} ${kind}: health follows damage, fog, defeat and reused slots`, () => {
      const f = fixture();
      const maxHp = UNIT_DEFINITIONS[kind].combat.maxHp;
      const unit = { team, kind, hp: maxHp, visible: true, scale: 1,
        renderX: 10, renderZ: 12, focusSlot: 4 };
      f.update(unit);
      assert.equal(f.matrices[0].get(4).scaleX, 0, 'healthy units hide bars');
      unit.hp = maxHp * .35; f.update(unit);
      assert.equal(f.matrices[1].get(4).scaleX, .35);
      assert.equal(f.matrices[1].get(4).y, unitPresentation(kind).role === 'mounted' ? 2.1 : 1.55);
      assert.equal(f.colors.get(4), 0xe3c46f);
      const leftEdge = f.matrices[1].get(4).x - 1.1 * .35 / 2;
      assert.equal(leftEdge, 10 - 1.1 / 2);
      unit.visible = false; f.update(unit);
      assert.equal(f.matrices[0].get(4).scaleX, 0, 'hidden enemies expose no health');
      unit.visible = true; unit.hp = maxHp * .2; unit.renderX = 15; f.update(unit);
      assert.equal(f.colors.get(4), 0xe27461);
      assert.equal(f.matrices[0].get(4).x, 15);
      unit.hp = 0; f.update(unit);
      assert.equal(f.matrices[1].get(4).scaleX, 0, 'defeated units hide bars');
      f.update({ ...unit, hp: maxHp });
      assert.equal(f.matrices[0].get(4).scaleX, 0, 'healthy replacement keeps slot hidden');
    });
  }
}
test('all render paths update health before sprite and strategic-zoom returns', () => {
  const transform = source.slice(source.indexOf('function updateUnitTransform('), source.indexOf('function setArmySize('));
  assert.ok(transform.indexOf('updateUnitHealthVisual(unit)') < transform.indexOf('if (unitSpritePreviewActive'));
  assert.match(source, /unitHealthBackground\.count = unitHealthFill\.count = 0/);
  assert.match(source, /unitHealthBackground\.count = unitHealthFill\.count = nextAttackFocusSlot/);
});
