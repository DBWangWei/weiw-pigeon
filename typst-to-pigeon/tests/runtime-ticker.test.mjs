import test from 'node:test';
import assert from 'node:assert/strict';
import {setup} from './runtime-harness.mjs';

test('active slides render the authored ticker lower third', async t => {
  const {d, a} = await setup(t, {
    mutateBundle(bundle) {
      const manifest = bundle.json['public/deck/manifest.json'];
      const slide = manifest.slides[1];
      manifest.ticker = {
        schema: 'pigeon-ticker/1',
        version: 1,
        enabled: true,
        ticks: [{
          v: 1, key: 't1', id: 'question-1', kind: 'now', resolves: null,
          page: slide.page, slide: slide.id, plain: 'Current question', shown: [slide.page], art: null,
        }, {
          v: 1, key: 't2', id: null, kind: 'next', resolves: null,
          page: slide.page, slide: slide.id, plain: 'Next question', shown: [slide.page], art: null,
        }],
        pages: [{
          page: slide.page, slide: slide.id, section: slide.section,
          band: {
            x: 0, y: slide.height - 28, w: slide.width, h: 28, fill: '#ffffff', enabled: true,
            left: {x: 12, y: slide.height - 27, w: slide.width - 24, h: 12},
            right: {x: 12, y: slide.height - 14, w: slide.width - 24, h: 12},
          },
          left: {tick: 't1', x: 12, y: slide.height - 27, w: slide.width - 24, h: 12},
          right: {tick: 't2', x: 12, y: slide.height - 14, w: slide.width - 24, h: 12},
        }],
        openAtEnd: ['question-1'], warnings: [],
      };
    },
  });
  a.navigateTo('portrait');
  const layer = d.querySelector('.slide-frame.current .ticker-layer');
  assert(layer);
  assert.equal(layer.hidden, false);
  assert.equal(layer.querySelector('.ticker-current').textContent, '● NOW Current question');
  assert.equal(layer.querySelector('.ticker-next').textContent, '→ NEXT Next question');
  assert.equal(layer.querySelector('.ticker-current .ticker-marker').className, 'ticker-marker ticker-marker-now');
  assert.equal(layer.querySelector('.ticker-next .ticker-marker').className, 'ticker-marker ticker-marker-next');
  assert.equal(layer.querySelector('.ticker-current').style.left, '12px');
  assert.equal(layer.querySelector('.ticker-next').style.left, '12px');
  assert.equal(layer.querySelector('.ticker-current').style.top, '1px');
  assert.equal(layer.querySelector('.ticker-next').style.top, '14px');
});

test('a cover slide can opt out of its authored ticker', async t => {
  const {d} = await setup(t, {
    mutateBundle(bundle) {
      const manifest = bundle.json['public/deck/manifest.json'];
      const slide = manifest.slides[0];
      slide.ticker = false;
      manifest.ticker = {
        schema: 'pigeon-ticker/1', version: 1, enabled: true,
        ticks: [{v: 1, key: 't1', kind: 'now', page: slide.page, slide: slide.id, plain: 'Cover'}],
        pages: [{page: slide.page, slide: slide.id, band: {x: 0, y: slide.height - 28, w: slide.width, h: 28, enabled: true}, left: {tick: 't1'}}],
      };
    },
  });
  const layer = d.querySelector('.slide-frame.current .ticker-layer');
  assert.equal(layer.hidden, true);
});
