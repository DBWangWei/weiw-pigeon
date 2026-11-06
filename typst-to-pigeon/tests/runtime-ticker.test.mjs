import test from 'node:test';
import assert from 'node:assert/strict';
import {setup} from './runtime-harness.mjs';

test('active slides render the authored ticker lower third', async t => {
  const {d, a} = await setup(t, {
    mutateBundle(bundle) {
      const manifest = bundle.json['public/deck/manifest.json'];
      const slide = manifest.slides[0];
      manifest.ticker = {
        schema: 'pigeon-ticker/1',
        version: 1,
        enabled: true,
        ticks: [{
          v: 1, key: 't1', id: 'question-1', kind: 'now', resolves: null,
          page: slide.page, slide: slide.id, plain: 'Current question', shown: [slide.page], art: null,
        }],
        pages: [{
          page: slide.page, slide: slide.id, section: slide.section,
          band: {x: 0, y: slide.height - 28, w: slide.width, h: 28, fill: '#ffffff', enabled: true},
          left: {tick: 't1'}, right: null,
        }],
        openAtEnd: ['question-1'], warnings: [],
      };
    },
  });
  const layer = d.querySelector('.slide-frame.current .ticker-layer');
  assert(layer);
  assert.equal(layer.hidden, false);
  assert.equal(layer.querySelector('.ticker-current').textContent, 'Current question');
});
