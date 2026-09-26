import assert from 'node:assert/strict';
import test from 'node:test';

// Model reflected attributes like the browser: assigning the same value still
// queues a mutation. Drain in bounded batches so a regression fails, not hangs.
function createDom() {
  const observers = [];
  class Element {
    constructor(parent = null) {
      this.parent = parent;
      this.attributes = new Map();
      this.dataset = {};
      this.classList = { toggle() {} };
    }
    setAttribute(name, value) {
      this.attributes.set(name, String(value));
      for (const observer of observers) {
        if (!observer.options.attributeFilter.includes(name)) continue;
        for (let node = this; node; node = node.parent) {
          if (node === observer.target) { observer.pending = true; break; }
          if (!observer.options.subtree) break;
        }
      }
    }
    get hidden() { return this.attributes.has('hidden'); }
    set hidden(value) { this.setBoolean('hidden', value); }
    get disabled() { return this.attributes.has('disabled'); }
    set disabled(value) { this.setBoolean('disabled', value); }
    setBoolean(name, value) {
      if (value) this.setAttribute(name, '');
      else if (this.attributes.has(name)) {
        this.setAttribute(name, '');
        this.attributes.delete(name);
      }
    }
    append(...children) { for (const child of children) child.parent = this; }
    insertBefore(child) { child.parent = this; }
    querySelector() { return null; }
    addEventListener() {}
  }
  const actions = new Element();
  const army = new Element();
  const create = new Element(actions);
  const join = new Element(actions);
  const buttons = [new Element(army), new Element(army)];
  const nodes = new Map([
    ['.room-actions', actions], ['.map-label', new Element()],
    ['.army-section', army], ['#room-create', create], ['#room-join', join],
  ]);
  const document = {
    readyState: 'complete', head: new Element(),
    createElement: () => new Element(),
    querySelector: (selector) => nodes.get(selector) ?? null,
    querySelectorAll: (selector) => selector === '.size-options button' ? buttons : [],
  };
  class MutationObserver {
    constructor(callback) { this.callback = callback; observers.push(this); }
    observe(target, options) { this.target = target; this.options = options; }
  }
  function drain() {
    for (let batch = 0; batch < 10; batch++) {
      const pending = observers.filter((observer) => observer.pending);
      if (!pending.length) return;
      for (const observer of pending) observer.pending = false;
      for (const observer of pending) observer.callback();
    }
    assert.fail('PvE attribute observers never settle; browser rendering would freeze');
  }
  return { document, MutationObserver, buttons, create, join, drain };
}

test('PvE entry settles after room status and host UI updates', async () => {
  const dom = createDom();
  const original = { window: globalThis.window, MutationObserver: globalThis.MutationObserver, fetch: globalThis.fetch };
  const pending = new Map();
  try {
    globalThis.window = {
      document: dom.document,
      location: { href: 'https://example.test/?room=MvoKZsCl2NbYDljdz914uMtfH8b373XE&mode=pve&mapSeed=1189641871&policySeed=2978533755' },
    };
    globalThis.MutationObserver = dom.MutationObserver;
    globalThis.fetch = (url) => new Promise((resolve) => pending.set(url, resolve));
    await import('../src/pve-entry.mjs');
    assert.ok(dom.buttons.every((button) => button.disabled));
    assert.ok(dom.create.hidden && dom.join.hidden);

    // Both asynchronous responses reapply the PvE state after observers mount.
    for (const [url, resolve] of pending) {
      resolve({ ok: true, json: async () => url.endsWith('/status')
        ? { enabled: true }
        : { mode: 'pve', mapSeed: 1189641871, policySeed: 2978533755 } });
      await new Promise((done) => setImmediate(done));
      dom.drain();
    }

    // Ordinary host/connection UI writes must be corrected, then settle.
    dom.buttons[0].disabled = false;
    dom.create.hidden = false;
    dom.join.hidden = false;
    dom.drain();
    assert.ok(dom.buttons.every((button) => button.disabled));
    assert.ok(dom.create.hidden && dom.join.hidden);

    // Repeated writes from another UI owner also must not create a loop.
    dom.buttons[1].disabled = true;
    dom.create.hidden = true;
    dom.drain();
  } finally {
    for (const [key, value] of Object.entries(original)) {
      if (value === undefined) delete globalThis[key];
      else globalThis[key] = value;
    }
  }
});
