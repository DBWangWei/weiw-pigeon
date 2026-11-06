/* Deterministic, relationship-aware placement with disjoint card/cluster bounds. */
(() => {
  const cardWidth = 200, cardHeight = 96, stepX = 232, stepY = 132;

  function wrapLabel(label, limit = 27, maxLines = 5) {
    const lines = [];
    let line = "", width = 0;
    // Count wide glyphs as two units, and break long words/CJK as well as spaces.
    for (const word of String(label).trim().split(/\s+/u)) {
      const sizeOf = c => /[^\u0000-\u024f]/u.test(c) ? 2 : /[WMwm]/.test(c) ? 1.8 : /[A-Z]/.test(c) ? 1.2 : 1;
      const units = [...word].reduce((sum, c) => sum + sizeOf(c), 0);
      if (line && width + 1 + units <= limit) {
        line += " " + word; width += 1 + units; continue;
      }
      if (line) { lines.push(line); line = ""; width = 0; }
      for (const c of word) {
        const size = sizeOf(c);
        if (width + size > limit) { lines.push(line); line = ""; width = 0; }
        line += c; width += size;
      }
    }
    if (line) lines.push(line);
    if (lines.length > maxLines) {
      lines.length = maxLines;
      lines[maxLines - 1] = lines[maxLines - 1].replace(/.{1,2}$/u, "") + "…";
    }
    return lines;
  }

  function layout(concepts, relationships, sections = []) {
    const clusters = new Map(), adjacency = new Map(concepts.map(n => [n.id, new Map()]));
    for (const edge of relationships) {
      if (edge.source === edge.target || !adjacency.has(edge.source) || !adjacency.has(edge.target)) continue;
      const weight = /contains|mentions|addresses/.test(edge.predicate) ? 1 : 3;
      for (const [a, b] of [[edge.source, edge.target], [edge.target, edge.source]])
        adjacency.get(a).set(b, (adjacency.get(a).get(b) || 0) + weight);
    }
    for (const original of concepts) {
      const counts = new Map();
      for (const id of original.slides || original.mentions?.map(m => m.slideId) || []) {
        const label = sections.find(section => section.slides.includes(id))?.label || "Across the talk";
        counts.set(label, (counts.get(label) || 0) + 1);
      }
      const cluster = String(original.cluster || [...counts].sort((a, b) => b[1] - a[1])[0]?.[0] || "Across the talk");
      if (!clusters.has(cluster)) clusters.set(cluster, []);
      clusters.get(cluster).push({...original, cluster, width: cardWidth, height: cardHeight});
    }
    const groups = [...clusters].map(([label, nodes]) => {
      // Traverse strong neighborhoods first, then improve their grid assignment
      // by deterministic swaps. Cell allocation is independent of the forces:
      // no amount of graph density can make two cards overlap.
      const ids = new Set(nodes.map(n => n.id)), byId = new Map(nodes.map(n => [n.id, n]));
      const degree = id => [...adjacency.get(id)].reduce((sum, [other, w]) => sum + (ids.has(other) ? w : 0), 0);
      const rank = (a, b) => degree(b) - degree(a) || (byId.get(b).importance || 0) - (byId.get(a).importance || 0) || a.localeCompare(b);
      const remaining = new Set([...ids].sort(rank)), order = [];
      while (remaining.size) {
        const queue = [remaining.values().next().value];
        remaining.delete(queue[0]);
        for (let i = 0; i < queue.length; i++) {
          const id = queue[i]; order.push(byId.get(id));
          for (const other of [...adjacency.get(id).keys()].filter(x => remaining.has(x)).sort(rank)) {
            remaining.delete(other); queue.push(other);
          }
        }
      }
      const columns = Math.min(5, Math.max(1, Math.ceil(Math.sqrt(nodes.length * stepY * 1.4 / stepX))));
      const rows = Math.ceil(nodes.length / columns);
      const slots = order.map((_, i) => ({x: (Math.floor(i / columns) % 2 ? columns - 1 - i % columns : i % columns) * stepX,
        y: Math.floor(i / columns) * stepY}));
      const positions = new Map(order.map((n, i) => [n.id, i]));
      const cost = (id, slot) => [...adjacency.get(id)].reduce((sum, [other, weight]) => {
        if (!positions.has(other) || other === id) return sum;
        const point = slots[positions.get(other)];
        return sum + weight * (Math.abs(slot.x - point.x) + Math.abs(slot.y - point.y));
      }, 0);
      // Bound the optimization work on unusually large model-generated graphs.
      if (nodes.length <= 160) for (let pass = 0; pass < 3; pass++) {
        for (let i = 0; i < order.length; i++) for (let j = i + 1; j < order.length; j++) {
          const a = order[i].id, b = order[j].id, before = cost(a, slots[i]) + cost(b, slots[j]);
          positions.set(a, j); positions.set(b, i);
          if (cost(a, slots[j]) + cost(b, slots[i]) < before) [order[i], order[j]] = [order[j], order[i]];
          else { positions.set(a, i); positions.set(b, j); }
        }
      }
      return {label, nodes: order, slots, width: columns * stepX + 16, height: rows * stepY + 48};
    });
    const area = groups.reduce((sum, group) => sum + (group.width + 32) * (group.height + 32), 0);
    const shelfWidth = Math.max(800, ...groups.map(g => g.width), Math.sqrt(area * 1.45));
    let x = 24, y = 24, rowHeight = 0;
    const output = [];
    for (const group of groups) {
      if (x > 24 && x + group.width > shelfWidth) { x = 24; y += rowHeight + 32; rowHeight = 0; }
      const clusterBounds = {x, y, width: group.width, height: group.height,
        label: sections.find(section => section.id === group.label)?.label || group.label};
      group.nodes.forEach((node, i) => output.push({...node, x: x + 24 + cardWidth / 2 + group.slots[i].x,
        y: y + 48 + cardHeight / 2 + group.slots[i].y, clusterBounds}));
      x += group.width + 32; rowHeight = Math.max(rowHeight, group.height);
    }
    return output;
  }

  function bounds(nodes) {
    return {width: Math.max(400, ...nodes.map(n => n.clusterBounds.x + n.clusterBounds.width + 24)),
      height: Math.max(280, ...nodes.map(n => n.clusterBounds.y + n.clusterBounds.height + 24))};
  }
  function edgePath(source, target) {
    const dx = target.x - source.x, dy = target.y - source.y;
    const boundary = node => Math.min(Math.abs(dx) ? node.width / 2 / Math.abs(dx) : Infinity,
      Math.abs(dy) ? node.height / 2 / Math.abs(dy) : Infinity);
    if (!dx && !dy) return {x1: source.x, y1: source.y, x2: target.x, y2: target.y};
    const start = boundary(source), end = boundary(target), extra = 4 / Math.hypot(dx, dy);
    return {x1: source.x + dx * start, y1: source.y + dy * start,
      x2: target.x - dx * (end + extra), y2: target.y - dy * (end + extra)};
  }
  window.PigeonGraphLayout = {layout, bounds, wrapLabel, edgePath};
})();
