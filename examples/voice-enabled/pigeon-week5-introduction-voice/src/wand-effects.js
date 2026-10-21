/* Focus-mode text keeps the source glyph geometry, including equations. Only
 * confidently uniform paper is removed; uncertain crops keep the original SVG.
 * No OCR, browser fonts, remote assets or changes to the deck are involved.
 */
(() => {
  function textMask({data, width, height}) {
    if (!data || width < 8 || height < 8) return null;
    const pixels = width * height, step = Math.max(1, Math.floor(pixels / 100000));
    const buckets = new Map();
    let samples = 0;
    for (let p = 0; p < pixels; p += step) {
      const i = p * 4;
      if (data[i + 3] !== 255) return null;
      const key = (data[i] >> 4) * 256 + (data[i + 1] >> 4) * 16 + (data[i + 2] >> 4);
      const bin = buckets.get(key) || [0, 0, 0, 0];
      bin[0]++; bin[1] += data[i]; bin[2] += data[i + 1]; bin[3] += data[i + 2];
      buckets.set(key, bin); samples++;
    }
    const dominant = [...buckets.values()].sort((a, b) => b[0] - a[0])[0];
    if (!dominant || dominant[0] / samples < .55) return null;
    const paper = dominant.slice(1).map(sum => Math.round(sum / dominant[0]));
    const distance = i => Math.max(Math.abs(data[i] - paper[0]),
      Math.abs(data[i + 1] - paper[1]), Math.abs(data[i + 2] - paper[2]));
    const margin = Math.max(1, Math.floor(Math.min(width, height) * .025));
    const contrasts = new Uint32Array(256);
    let foreground = 0, border = 0, paperBorder = 0;
    for (let p = 0; p < pixels; p++) {
      const delta = distance(p * 4), x = p % width, y = Math.floor(p / width);
      if (delta > 12) { foreground++; contrasts[delta]++; }
      if (x < margin || x >= width - margin || y < margin || y >= height - margin) {
        border++; if (delta <= 12) paperBorder++;
      }
    }
    // Mixed or graphic-heavy crops and faint text are deliberately left intact.
    if (paperBorder / border < .985 || foreground / pixels < .002 || foreground / pixels > .30) return null;
    let contrast = 0, count = 0;
    for (; contrast < 255; contrast++) {
      count += contrasts[contrast];
      if (count >= foreground * .9) break;
    }
    if (contrast < 48) return null;
    const mask = new Uint8ClampedArray(data.length);
    for (let p = 0; p < pixels; p++) {
      const i = p * 4, delta = distance(i);
      mask[i] = 244; mask[i + 1] = 247; mask[i + 2] = 251;
      mask[i + 3] = delta <= 3 ? 0 : Math.min(255, Math.round(delta / contrast * 255));
    }
    return mask;
  }

  async function textArtwork(url, crop, slide, displayScale = 1) {
    try {
      const source = new Image();
      source.src = url;
      await source.decode();
      const scale = Math.min(Math.max(2, displayScale * 2), 3072 / crop.width, 2048 / crop.height);
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.ceil(crop.width * scale));
      canvas.height = Math.max(1, Math.ceil(crop.height * scale));
      const ctx = canvas.getContext("2d", {willReadFrequently: true});
      ctx.fillStyle = "white";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(source, -crop.x * scale, -crop.y * scale, slide.width * scale, slide.height * scale);
      const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const mask = textMask(pixels);
      if (!mask) return null;
      pixels.data.set(mask);
      ctx.putImageData(pixels, 0, 0);
      return canvas.toDataURL("image/png");
    } catch (_) {
      // Decode failures, unavailable canvas or file-origin restrictions all keep
      // the opaque, original-artwork fallback already displayed in the panel.
      return null;
    }
  }
  window.PigeonWandEffects = {textArtwork, textMask};
})();
