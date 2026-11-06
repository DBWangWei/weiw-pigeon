/* Dependency-free particle transport adapted from the slide-effects prototype.
 * Pigeon samples the rendered SVG artwork at runtime, so generated decks need
 * no extra raster assets. The final frame always returns to the exact SVG. */
(() => {
  "use strict";
  const clamp = (value, low = 0, high = 1) => Math.min(high, Math.max(low, value));
  const smooth = value => { value = clamp(value); return value * value * (3 - 2 * value); };
  function hash(value) {
    value = Math.imul(value ^ (value >>> 16), 0x45d9f3b);
    value = Math.imul(value ^ (value >>> 16), 0x45d9f3b);
    return ((value ^ (value >>> 16)) >>> 0) / 4294967295;
  }
  function morton(x, y) {
    const spread = value => {
      value &= 0xffff;
      value = (value | (value << 8)) & 0x00ff00ff;
      value = (value | (value << 4)) & 0x0f0f0f0f;
      value = (value | (value << 2)) & 0x33333333;
      return (value | (value << 1)) & 0x55555555;
    };
    return (spread(x) | (spread(y) << 1)) >>> 0;
  }
  function sampleGrid(imageData, cell = 10) {
    const {data, width, height} = imageData;
    const corner = [0, 1, 2].map(channel => {
      let total = 0, count = 0;
      for (const [x, y] of [[0, 0], [Math.max(0, width - 1), 0], [0, Math.max(0, height - 1)], [Math.max(0, width - 1), Math.max(0, height - 1)]]) {
        total += data[(y * width + x) * 4 + channel]; count++;
      }
      return total / count;
    });
    const points = [];
    for (let y = 0; y < height; y += cell) for (let x = 0; x < width; x += cell) {
      const w = Math.min(cell, width - x), h = Math.min(cell, height - y);
      let foreground = 0, peak = 0, red = 0, green = 0, blue = 0;
      for (let py = y; py < y + h; py++) for (let px = x; px < x + w; px++) {
        const offset = (py * width + px) * 4;
        const alpha = data[offset + 3] / 255;
        const difference = Math.abs(data[offset] - corner[0]) + Math.abs(data[offset + 1] - corner[1]) + Math.abs(data[offset + 2] - corner[2]);
        if (alpha > .04 && difference > 24) foreground += alpha;
        peak = Math.max(peak, alpha); red += data[offset]; green += data[offset + 1]; blue += data[offset + 2];
      }
      if (foreground / (w * h) > .08 || (peak > .9 && Math.abs(red - green) + Math.abs(green - blue) > 48)) {
        points.push({x: x + w / 2, y: y + h / 2, sx: x, sy: y, w, h, opacity: 1,
          coverage: foreground / (w * h), key: morton(Math.floor(x / cell), Math.floor(y / cell))});
      }
    }
    return points;
  }
  function pairParticles(source, destination) {
    const from = [...source].sort((a, b) => a.key - b.key);
    const to = [...destination].sort((a, b) => a.key - b.key);
    const count = Math.max(from.length, to.length);
    if (!count) return [];
    const slots = values => {
      const result = Array(count).fill(null);
      values.forEach((point, index) => { result[Math.floor(index * count / values.length)] = point; });
      return result;
    };
    const left = slots(from), right = slots(to);
    return left.map((sourcePoint, index) => {
      let targetPoint = right[index];
      if (!sourcePoint) sourcePoint = {...(from[Math.floor(index * from.length / count)] || targetPoint), opacity: 0};
      if (!targetPoint) targetPoint = {...(to[Math.floor(index * to.length / count)] || sourcePoint), opacity: 0};
      const seed = hash(index + 1);
      return {from: sourcePoint, to: targetPoint, bend: (seed - .5) * 150,
        depth: 25 + hash(index + 921) * 95, delay: hash(index + 531) * .14, seed};
    });
  }
  function position(particle, progress, centerX = 480, centerY = 270) {
    if (progress <= 0) return {x: particle.from.x, y: particle.from.y, scale: 1, mix: 0, opacity: particle.from.opacity};
    if (progress >= 1) return {x: particle.to.x, y: particle.to.y, scale: 1, mix: 1, opacity: particle.to.opacity};
    const t = smooth(clamp((progress - particle.delay) / (1 - particle.delay)));
    const wave = Math.sin(Math.PI * t), {from, to, bend, depth} = particle;
    const dx = to.x - from.x, dy = to.y - from.y, length = Math.hypot(dx, dy) || 1;
    const z = wave * depth, perspective = 1100 / (1100 - z);
    let x = from.x + dx * t - dy / length * bend * wave;
    let y = from.y + dy * t + dx / length * bend * wave - z * .2;
    x = centerX + (x - centerX) * perspective; y = centerY + (y - centerY) * perspective;
    return {x, y, scale: perspective * (1 + wave * .18), mix: smooth(clamp((t - .12) / .76)),
      opacity: from.opacity + (to.opacity - from.opacity) * t};
  }
  window.PigeonParticleEffects = {clamp, smooth, hash, morton, sampleGrid, pairParticles, position};
})();
