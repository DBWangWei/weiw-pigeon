/* Ticker state and validation shared by the offline player and Node tests. */
(function (root) {
  'use strict';

  const kinds = new Set(['now', 'next', 'done']);
  const text = value => {
    if (value == null) return '';
    if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return String(value);
    if (Array.isArray(value)) return value.map(text).join('');
    if (typeof value === 'object') {
      if (value.func === 'space') return ' ';
      if (typeof value.text === 'string') return value.text + text(value.children);
      return text(value.children || value.body || value.value || '');
    }
    return '';
  };

  function recordPage(record) {
    return Number(record?.page ?? record?.pageNumber ?? 0);
  }

  function sectionAt(data, page) {
    const pages = data.pages || [];
    const direct = pages.find(item => Number(item.page) === page);
    if (direct && direct.section != null) return direct.section;
    let section = null;
    for (const item of pages) {
      if (Number(item.page) > page) break;
      if (item.section != null) section = item.section;
    }
    return section;
  }

  function closedAt(ticks, page) {
    const closed = new Set();
    for (const tick of ticks) {
      if (tick.kind === 'done' && tick.resolves && Number(tick.page) <= page) closed.add(tick.resolves);
    }
    return closed;
  }

  /** Return the final band state for a document page. */
  function stateForPage(data, page) {
    if (!data || !Array.isArray(data.ticks)) return { left: null, right: null, section: null };
    const ticks = data.ticks;
    const mine = ticks.filter(tick => Number(tick.page) === Number(page));
    const lefts = mine.filter(tick => tick.kind !== 'next');
    let left = lefts.length ? lefts[lefts.length - 1] : null;
    if (!left) {
      const section = sectionAt(data, Number(page));
      const closed = closedAt(ticks, Number(page));
      const candidates = ticks.filter(tick => tick.kind === 'now' && Number(tick.page) < Number(page)
        && sectionAt(data, Number(tick.page)) === section && (!tick.id || !closed.has(tick.id)));
      left = candidates.length ? candidates[candidates.length - 1] : null;
    }
    if (!left) {
      const section = sectionAt(data, Number(page));
      const recaps = ticks.filter(tick => tick.kind === 'done' && Number(tick.page) < Number(page)
        && sectionAt(data, Number(tick.page)) === section);
      left = recaps.length ? recaps[recaps.length - 1] : null;
    }
    return {
      left,
      right: mine.filter(tick => tick.kind === 'next').at(-1) || null,
      section: sectionAt(data, Number(page)),
    };
  }

  function pageFor(data, page) {
    return (data?.pages || []).find(item => Number(item.page) === Number(page)) || null;
  }

  function validate(data) {
    const warnings = [];
    const ticks = data?.ticks || [];
    const byId = new Map();
    for (const tick of ticks) {
      if (tick.id) {
        if (byId.has(tick.id)) warnings.push({ code: 'tick.duplicate-id', id: tick.id, page: tick.page });
        byId.set(tick.id, tick);
      }
      if (!kinds.has(tick.kind)) warnings.push({ code: 'tick.invalid-kind', page: tick.page, kind: tick.kind });
      if (tick.resolves && !byId.has(tick.resolves) && !ticks.some(other => other.id === tick.resolves)) {
        warnings.push({ code: 'tick.unknown-resolves', page: tick.page, resolves: tick.resolves });
      }
      if (!(data?.pages || []).some(page => Number(page.page) === Number(tick.page))) {
        warnings.push({ code: 'tick.off-slide', page: tick.page, key: tick.key });
      }
    }
    for (const tick of ticks.filter(item => item.kind === 'done' && item.resolves)) {
      const opened = ticks.find(item => item.id === tick.resolves && item.kind === 'now');
      if (opened && Number(tick.page) < Number(opened.page)) {
        warnings.push({ code: 'tick.resolves-before-open', page: tick.page, resolves: tick.resolves });
      }
    }
    const shown = new Set((data?.pages || []).flatMap(page => [page.left?.tick, page.right?.tick].filter(Boolean)));
    for (const tick of ticks) {
      if (tick.id && tick.kind === 'now' && !ticks.some(done => done.kind === 'done' && done.resolves === tick.id)) {
        warnings.push({ code: 'tick.unresolved', severity: 'info', id: tick.id, page: tick.page });
      }
      if (!shown.has(tick.key)) warnings.push({ code: 'tick.never-shown', severity: 'info', key: tick.key, page: tick.page });
    }
    for (const page of data?.pages || []) {
      if (page.band?.overflow) warnings.push({ code: 'band.overflow', page: page.page, slide: page.slide });
      if (page.band && !page.band.fill) warnings.push({ code: 'band.no-fill', page: page.page, slide: page.slide });
    }
    return warnings;
  }

  /** Normalize a bundled deck's ticker while remaining tolerant of older builds. */
  function normalize(raw, slides = []) {
    if (!raw || !Array.isArray(raw.ticks) || !raw.ticks.length) return null;
    const pages = Array.isArray(raw.pages) ? raw.pages.map(page => ({ ...page })) : [];
    const byPage = new Map(pages.map(page => [Number(page.page), page]));
    for (const slide of slides) {
      const page = Number(slide.page);
      if (!byPage.has(page)) {
        const item = { page, slide: slide.id, section: slide.section ?? null, band: null, left: null, right: null };
        pages.push(item); byPage.set(page, item);
      }
    }
    pages.sort((a, b) => Number(a.page) - Number(b.page));
    for (const page of pages) {
      const slide = slides.find(item => Number(item.page) === Number(page.page));
      if (slide) {
        page.slide ??= slide.id;
        page.section ??= slide.section ?? null;
      }
    }
    const data = {
      schema: raw.schema || 'pigeon-ticker/1',
      enabled: raw.enabled !== false,
      hideOn: Array.isArray(raw.hideOn) ? [...raw.hideOn] : [],
      ticks: raw.ticks.map((tick, index) => ({
        v: 1, key: tick.key || `t${index + 1}`,
        kind: kinds.has(tick.kind) ? tick.kind : 'now',
        id: tick.id ?? null, resolves: tick.resolves ?? null,
        page: Number(tick.page), slide: tick.slide ?? slides.find(item => Number(item.page) === Number(tick.page))?.id ?? null,
        at: tick.at || null, plain: tick.plain != null ? text(tick.plain) : text(tick.body),
        shown: Array.isArray(tick.shown) ? [...tick.shown] : [], art: tick.art || null,
      })), pages, openAtEnd: Array.isArray(raw.openAtEnd) ? [...raw.openAtEnd] : [],
    };
    for (const page of data.pages) {
      const state = stateForPage(data, Number(page.page));
      if (page.band && page.band.enabled !== false) {
        page.left ||= state.left ? { tick: state.left.key } : null;
        page.right ||= state.right ? { tick: state.right.key } : null;
      }
    }
    return data;
  }

  const api = { text, stateForPage, pageFor, validate, normalize };
  root.Ticker = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
