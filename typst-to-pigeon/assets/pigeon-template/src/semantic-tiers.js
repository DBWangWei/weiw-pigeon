/* Pure semantic presentation navigation. Works as a classic script and in Node. */
(function (root) {
  'use strict';
  const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, Number.isFinite(n) ? Math.trunc(n) : lo));
  const slides = m => m.slides || [];
  const modeOf = mode => mode === 'step' ? 'step' : 'slide';
  const flat = slide => ({ k: 0, name: 'full', tier: { name: 'full', show: '*' }, visible: [], emph: [], dim: [], pin: [], fx: null, background: null, asset: slide.asset, key: 'full' });
  function signature(c) {
    if (c.key != null) return String(c.key);
    return JSON.stringify(['visible', 'emph', 'dim', 'pin'].map(k => [...(c[k] || [])].sort()).concat([c.fx || null, c.background || null]));
  }
  function states(m, index) {
    const slide = slides(m)[index] || {}, sem = slide.semanticTiers;
    if (!sem || !sem.candidates || !sem.candidates.length) return [flat(slide)];
    const roles = sem.roles || [];
    const reveals = roles.filter(r => r.hide !== false);
    if (!reveals.length && !sem.candidates.some(c => c.background != null)) return [flat(slide)];
    const result = [];
    for (const c of sem.candidates) {
      const visible = c.visible || [];
      if (c.skip || (c.tier && c.tier.enter) || (c.background == null && reveals.length && !reveals.some(r => visible.includes(r.uid)))) continue;
      if (c.fx === 'extract' && !roles.some(r => r.role === 'takeaway' && visible.includes(r.uid))) continue;
      if (!result.length || signature(result[result.length - 1]) !== signature(c)) result.push(c);
    }
    return result.length ? result : [flat(slide)];
  }
  function defaultIndex(m, index) {
    const slide = slides(m)[index] || {}, sem = slide.semanticTiers;
    const list = states(m, index);
    if (!sem || !sem.candidates || !sem.candidates.length) return 0;
    const recipes = (m.tiers && m.tiers.presets && m.tiers.presets[sem.preset || m.tiers.defaultPreset]) || [];
    let selected = sem.defaultTier;
    if (selected == null) { selected = recipes.findIndex(r => r.default === true); if (selected < 0) selected = null; }
    if (selected == null) return list.length - 1;
    let original;
    if (typeof selected === 'number') original = selected;
    else {
      const candidate = sem.candidates.find(c => c.name === selected || (c.tier && c.tier.name === selected));
      original = candidate ? candidate.k : recipes.findIndex(r => r.name === selected);
    }
    const candidate = sem.candidates.find(c => c.k === original);
    // A duplicate aliases the immediately preceding surviving state only.
    let preceding = 0;
    for (let i = 0; i < list.length; i++) { if (list[i].k <= original) preceding = i; }
    if (candidate && !candidate.skip) {
      for (let i = preceding; i >= 0; i--) {
        if (list[i].k > original) continue;
        if (signature(list[i]) === signature(candidate)) return i;
        break;
      }
    }
    return preceding;
  }
  function entry(m, index, mode, dir) {
    return modeOf(mode) === 'step' ? (dir === 'prev' || dir === -1 ? states(m, index).length - 1 : 0) : defaultIndex(m, index);
  }
  function step(m, input, action) {
    const count = slides(m).length;
    const state = { ...input, mode: modeOf(input.mode), page: clamp(input.page, 0, Math.max(0, count - 1)), trail: (input.trail || []).map(x => ({ ...x })) };
    state.tier = clamp(input.tier, 0, states(m, state.page).length - 1);
    state.boundary = false;
    const name = typeof action === 'string' ? action : action.type || action.action;
    const movePage = (delta, shifted) => {
      const page = state.page + delta;
      if (page < 0 || page >= count) { state.boundary = true; return; }
      state.page = page;
      state.tier = shifted && state.mode === 'step' ? 0 : entry(m, page, state.mode, delta < 0 ? 'prev' : 'next');
    };
    const moveTier = delta => {
      const tier = clamp(state.tier + delta, 0, states(m, state.page).length - 1);
      state.boundary = tier === state.tier; state.tier = tier;
    };
    if (name === 'toggleMode') state.mode = state.mode === 'step' ? 'slide' : 'step';
    else if (name === 'tierNext' || name === 'tierPrev') moveTier(name === 'tierNext' ? 1 : -1);
    else if (name === 'home' || name === 'end') { state.page = name === 'home' ? 0 : Math.max(0, count - 1); state.tier = entry(m, state.page, state.mode); }
    else if (name === 'back') {
      const saved = state.trail.pop();
      if (saved) Object.assign(state, saved, { trail: state.trail, boundary: false });
      else state.boundary = true;
    } else if (name === 'deeper') {
      const links = ((slides(m)[state.page] || {}).semanticTiers || {}).deep || [];
      const target = typeof action === 'object' ? action.target || links[action.index || 0] : links[0];
      const page = target && slides(m).findIndex(s => (target.slideId != null && s.id === target.slideId) || (target.targetPage != null && s.page === target.targetPage));
      if (page == null || page < 0) state.boundary = true;
      else { state.trail.push({ mode: state.mode, page: state.page, tier: state.tier }); state.page = page; state.tier = entry(m, page, state.mode); }
    } else if (['next', 'prev', 'shiftNext', 'shiftPrev'].includes(name)) {
      const delta = name === 'next' || name === 'shiftNext' ? 1 : -1;
      const shifted = name.startsWith('shift');
      if (shifted) { if (state.mode === 'slide') moveTier(delta); else movePage(delta, true); }
      else if (state.mode === 'slide') movePage(delta, false);
      else if (state.tier + delta >= 0 && state.tier + delta < states(m, state.page).length) moveTier(delta);
      else movePage(delta, false);
    }
    return state;
  }
  function parseURL(value, m) {
    // Support parseURL(manifest, url) as well as the conventional url-first call.
    if (typeof value === 'object' && value && value.slides) { const temp = m; m = value; value = temp; }
    const url = new URL(String(value || ''), 'https://pigeon.invalid/');
    const result = {};
    if (['step', 'slide'].includes(url.searchParams.get('mode'))) result.mode = url.searchParams.get('mode');
    const match = /^#(\d+)(?:\.(\d+))?$/.exec(url.hash);
    if (match) {
      const physical = Math.max(1, Number(match[1]));
      if (m) {
        const found = slides(m).findIndex(s => s.page === physical);
        result.page = found >= 0 ? found : clamp(physical - 1, 0, Math.max(0, slides(m).length - 1));
      } else result.page = physical - 1;
      if (match[2] != null) result.tier = m ? clamp(Number(match[2]) - 1, 0, states(m, result.page).length - 1) : Math.max(0, Number(match[2]) - 1);
    }
    return result;
  }
  function formatURL(m, state) {
    if (!m.slides) { const temp = m; m = state; state = temp; }
    const slide = slides(m)[state.page] || {};
    return '?mode=' + modeOf(state.mode) + '#' + (slide.page || state.page + 1) + '.' + (clamp(state.tier, 0, states(m, state.page).length - 1) + 1);
  }
  const api = { states, defaultIndex, entry, step, parseURL, formatURL };
  root.PigeonTiers = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
