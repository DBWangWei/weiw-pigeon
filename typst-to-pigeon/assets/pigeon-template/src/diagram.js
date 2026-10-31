/* Pigeon diagram editor: a small offline editor with Excalidraw-compatible tools.
 * Independent implementation; no Excalidraw runtime or file-format compatibility.
 */
(() => {
  const kinds = [
    "rectangle",
    "triangle",
    "ellipse",
    "diamond",
    "parallelogram",
    "text",
    "arrow",
    "line",
  ];
  const isConnector = (o) => o.kind === "arrow" || o.kind === "line";
  const shape = (o) => o.type === "diagram" && !isConnector(o);
  const clamp = (n, a, b) => Math.max(a, Math.min(b, n));
  const copy = (value) => structuredClone(value);
  const uid = () =>
    `dg-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  const colors = [
    "#1E293B",
    "#DC2626",
    "#2563EB",
    "#166534",
    "#FACC15",
    "#FFFFFF",
  ];
  const center = (o) => ({ x: o.x + o.w / 2, y: o.y + o.h / 2 });
  const cross = (a, b) => a.x * b.y - a.y * b.x;
  function vertices(o) {
    const { x, y, w, h } = o;
    if (o.kind === "triangle")
      return [
        { x: x + w / 2, y },
        { x: x + w, y: y + h },
        { x, y: y + h },
      ];
    if (o.kind === "diamond")
      return [
        { x: x + w / 2, y },
        { x: x + w, y: y + h / 2 },
        { x: x + w / 2, y: y + h },
        { x, y: y + h / 2 },
      ];
    if (o.kind === "parallelogram")
      return [
        { x: x + w * 0.22, y },
        { x: x + w, y },
        { x: x + w * 0.78, y: y + h },
        { x, y: y + h },
      ];
    return [
      { x, y },
      { x: x + w, y },
      { x: x + w, y: y + h },
      { x, y: y + h },
    ];
  }
  function boundary(o, toward) {
    const c = center(o),
      d = { x: toward.x - c.x, y: toward.y - c.y };
    if (Math.hypot(d.x, d.y) < 0.01) d.x = 1;
    if (o.kind === "ellipse") {
      const t = 1 / Math.sqrt((d.x / (o.w / 2)) ** 2 + (d.y / (o.h / 2)) ** 2);
      return { x: c.x + d.x * t, y: c.y + d.y * t };
    }
    const points = vertices(o);
    let best = Infinity;
    points.forEach((p, i) => {
      const q = points[(i + 1) % points.length],
        edge = { x: q.x - p.x, y: q.y - p.y },
        v = { x: p.x - c.x, y: p.y - c.y },
        den = cross(d, edge);
      if (Math.abs(den) < 1e-8) return;
      const t = cross(v, edge) / den,
        u = cross(v, d) / den;
      if (t >= 0 && u >= 0 && u <= 1) best = Math.min(best, t);
    });
    return {
      x: c.x + d.x * (Number.isFinite(best) ? best : 0),
      y: c.y + d.y * (Number.isFinite(best) ? best : 0),
    };
  }
  function endpoints(o, ops) {
    const start = ops.find((s) => shape(s) && s.id === o.startBinding),
      end = ops.find((s) => shape(s) && s.id === o.endBinding);
    const a = start ? center(start) : o.start,
      b = end ? center(end) : o.end;
    return [
      start ? boundary(start, b) : copy(a),
      end ? boundary(end, a) : copy(b),
    ];
  }
  function path(o, ops) {
    const [a, b] = endpoints(o, ops);
    if (!o.elbow) return [a, b];
    // Use the dominant direction to leave and enter shapes on sensible sides.
    if (Math.abs(b.x - a.x) >= Math.abs(b.y - a.y)) {
      const x = (a.x + b.x) / 2;
      return [a, { x, y: a.y }, { x, y: b.y }, b];
    }
    const y = (a.y + b.y) / 2;
    return [a, { x: a.x, y }, { x: b.x, y }, b];
  }
  function bounds(o, ops) {
    if (!isConnector(o)) return { x: o.x, y: o.y, w: o.w, h: o.h };
    const [a, b] = endpoints(o, ops);
    return {
      x: Math.min(a.x, b.x),
      y: Math.min(a.y, b.y),
      w: Math.abs(b.x - a.x),
      h: Math.abs(b.y - a.y),
    };
  }
  function distance(p, a, b) {
    const x = b.x - a.x,
      y = b.y - a.y,
      t = clamp(
        ((p.x - a.x) * x + (p.y - a.y) * y) / (x * x + y * y || 1),
        0,
        1,
      );
    return Math.hypot(p.x - a.x - t * x, p.y - a.y - t * y);
  }
  function contains(o, p, ops, tolerance = 6) {
    if (isConnector(o)) {
      const ps = path(o, ops);
      return ps.some((a, i) => i && distance(p, ps[i - 1], a) < tolerance);
    }
    if (o.kind === "ellipse")
      return (
        ((p.x - o.x - o.w / 2) / (o.w / 2 + tolerance)) ** 2 +
          ((p.y - o.y - o.h / 2) / (o.h / 2 + tolerance)) ** 2 <=
        1
      );
    const b = bounds(o, ops);
    return (
      p.x >= b.x - tolerance &&
      p.x <= b.x + b.w + tolerance &&
      p.y >= b.y - tolerance &&
      p.y <= b.y + b.h + tolerance
    );
  }
  function wrap(ctx, text, width) {
    const result = [];
    for (const paragraph of text.split("\n")) {
      let row = "";
      for (const ch of paragraph) {
        if (row && ctx.measureText(row + ch).width > width) {
          result.push(row);
          row = "";
        }
        row += ch;
      }
      result.push(row);
    }
    return result;
  }
  const textAlignment = (o) => o.textAlign || (o.kind === "text" ? "left" : "center");
  const verticalAlignment = (o) => o.verticalAlign || (o.kind === "text" ? "top" : "middle");
  function textLayout(ctx, o, ops) {
    const b = bounds(o, ops), free = o.kind === "text",
      align = textAlignment(o), vertical = verticalAlignment(o),
      width = Math.max(1, free ? b.w - 20 : b.w * (["diamond", "triangle"].includes(o.kind) ? 0.6 : 0.88)),
      padding = free ? 10 : 6,
      lineHeight = o.fontSize * 1.25;
    ctx.font = `${o.fontStyle || "normal"} ${o.fontSize}px ${o.fontFamily || "system-ui, sans-serif"}`;
    const metrics = ctx.measureText("Mg"),
      ascent = metrics.fontBoundingBoxAscent ?? o.fontSize * 0.8,
      descent = metrics.fontBoundingBoxDescent ?? o.fontSize * 0.2,
      baselineOffset = vertical === "top" ? ascent : vertical === "bottom" ? -descent : (ascent - descent) / 2,
      lines = wrap(ctx, o.text, width),
      scale = Math.min(1, Math.max(1, b.h - padding * 2) / (lines.length * lineHeight)),
      x = align === "center" ? b.x + b.w / 2 : b.x + (b.w - width) / 2 + (align === "right" ? width : 0),
      y = vertical === "middle" ? b.y + b.h / 2 : b.y + (vertical === "bottom" ? b.h - padding : padding),
      offset = vertical === "middle" ? (lines.length - 1) / 2 : vertical === "bottom" ? lines.length - 1 : 0;
    return { x, y, scale, align, vertical, lines, lineHeight, offset, baselineOffset };
  }
  function renderLabels(frame, ctx, ops, size, editingId) {
    let layer = frame.querySelector(".diagram-label-layer");
    if (!layer) {
      layer = document.createElementNS("http://www.w3.org/2000/svg", "svg");
      layer.setAttribute("xmlns", "http://www.w3.org/2000/svg");
      layer.classList.add("diagram-label-layer");
      layer.setAttribute("aria-hidden", "true");
      frame.append(layer);
    }
    layer.setAttribute("viewBox", `0 0 ${size.width} ${size.height}`);
    layer.replaceChildren();
    for (const o of ops.filter(o => o.type === "diagram" && o.text)) {
      ctx.save();
      const layout = textLayout(ctx, o, ops);
      ctx.restore();
      const group = document.createElementNS(layer.namespaceURI, "g");
      group.dataset.diagramId = o.id;
      group.dataset.verticalAlign = layout.vertical;
      group.setAttribute("transform", `translate(${layout.x} ${layout.y}) scale(${layout.scale})`);
      if (o.id === editingId) group.setAttribute("visibility", "hidden");
      layout.lines.forEach((line, i) => {
        const text = document.createElementNS(layer.namespaceURI, "text");
        text.setAttribute("x", "0");
        text.setAttribute("y", String((i - layout.offset) * layout.lineHeight + layout.baselineOffset));
        text.setAttribute("fill", o.color);
        text.setAttribute("font-family", o.fontFamily || "system-ui, sans-serif");
        text.setAttribute("font-style", o.fontStyle || "normal");
        text.setAttribute("font-size", String(o.fontSize));
        text.setAttribute("text-anchor", { left: "start", center: "middle", right: "end" }[layout.align]);
        text.setAttribute("dominant-baseline", "alphabetic");
        text.style.whiteSpace = "pre";
        text.textContent = line;
        group.append(text);
      });
      layer.append(group);
    }
  }
  function draw(ctx, o, ops, { text = true } = {}) {
    ctx.save();
    ctx.strokeStyle = o.color;
    ctx.fillStyle = o.fill === "transparent" ? "transparent" : o.fill;
    ctx.lineWidth = 2.4;
    ctx.lineJoin = "round";
    ctx.lineCap = "round";
    if (isConnector(o)) {
      const ps = path(o, ops);
      ctx.beginPath();
      ps.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
      ctx.stroke();
      if (o.kind === "arrow") {
        const b = ps.at(-1),
          a =
            ps
              .slice(0, -1)
              .reverse()
              .find((p) => Math.hypot(b.x - p.x, b.y - p.y) > 0.1) || ps[0],
          angle = Math.atan2(b.y - a.y, b.x - a.x);
        ctx.beginPath();
        ctx.moveTo(
          b.x - 13 * Math.cos(angle - 0.45),
          b.y - 13 * Math.sin(angle - 0.45),
        );
        ctx.lineTo(b.x, b.y);
        ctx.lineTo(
          b.x - 13 * Math.cos(angle + 0.45),
          b.y - 13 * Math.sin(angle + 0.45),
        );
        ctx.stroke();
      }
    } else if (o.kind !== "text") {
      ctx.beginPath();
      if (o.kind === "ellipse")
        ctx.ellipse(
          o.x + o.w / 2,
          o.y + o.h / 2,
          o.w / 2,
          o.h / 2,
          0,
          0,
          Math.PI * 2,
        );
      else {
        vertices(o).forEach((p, i) =>
          i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y),
        );
        ctx.closePath();
      }
      if (o.fill !== "transparent") ctx.fill();
      ctx.stroke();
    }
    if (text && o.text) {
      const layout = textLayout(ctx, o, ops);
      ctx.textAlign = layout.align;
      ctx.textBaseline = "alphabetic";
      ctx.fillStyle = o.color;
      ctx.translate(layout.x, layout.y);
      ctx.scale(layout.scale, layout.scale);
      layout.lines.forEach((line, i) =>
        ctx.fillText(line, 0, (i - layout.offset) * layout.lineHeight + layout.baselineOffset),
      );
    }
    ctx.restore();
  }
  function validate(o, size) {
    const number = (n, min, max) =>
      typeof n === "number" && Number.isFinite(n) && n >= min && n <= max;
    const color = (c) => typeof c === "string" && /^#[\da-f]{6}$/i.test(c);
    const point = (p) =>
      p && number(p.x, 0, size.width) && number(p.y, 0, size.height);
    const id = (s) => typeof s === "string" && /^[\w-]{1,100}$/.test(s);
    if (
      !o ||
      !kinds.includes(o.kind) ||
      !id(o.id) ||
      !color(o.color) ||
      !(o.fill === "transparent" || color(o.fill)) ||
      typeof o.text !== "string" ||
      o.text.length > 10000 ||
      (o.textAlign !== undefined && !["left", "center", "right"].includes(o.textAlign)) ||
      (o.verticalAlign !== undefined && !["top", "middle", "bottom"].includes(o.verticalAlign)) ||
      (o.fontFamily !== undefined && !["Arial", "system-ui, sans-serif"].includes(o.fontFamily)) ||
      (o.fontStyle !== undefined && !["normal", "italic"].includes(o.fontStyle)) ||
      !number(o.fontSize, 8, 120)
    )
      throw Error("Malformed diagram style");
    const result = {
      type: "diagram",
      id: o.id,
      kind: o.kind,
      color: o.color,
      fill: o.fill,
      text: o.text,
      fontSize: o.fontSize,
      ...(o.fontFamily !== undefined ? { fontFamily: o.fontFamily } : {}),
      ...(o.fontStyle !== undefined ? { fontStyle: o.fontStyle } : {}),
      textAlign: textAlignment(o),
      verticalAlign: verticalAlignment(o),
    };
    if (isConnector(o)) {
      if (
        !point(o.start) ||
        !point(o.end) ||
        typeof o.elbow !== "boolean" ||
        [o.startBinding, o.endBinding].some((s) => s !== null && !id(s))
      )
        throw Error("Malformed connector");
      return {
        ...result,
        start: { x: o.start.x, y: o.start.y },
        end: { x: o.end.x, y: o.end.y },
        startBinding: o.startBinding,
        endBinding: o.endBinding,
        elbow: o.elbow,
      };
    }
    if (
      !number(o.x, 0, size.width) ||
      !number(o.y, 0, size.height) ||
      !number(o.w, 1, size.width) ||
      !number(o.h, 1, size.height) ||
      o.x + o.w > size.width + 0.01 ||
      o.y + o.h > size.height + 0.01
    )
      throw Error("Malformed diagram bounds");
    return { ...result, x: o.x, y: o.y, w: o.w, h: o.h };
  }
  function create(host) {
    let tool = "select",
      stroke = colors[2],
      fill = colors[4],
      elbow = true,
      selected = new Set(),
      gesture = null,
      clipboard = [],
      editor = null,
      palette = null,
      lastSurface = null;
    const alignment = {
      text: { textAlign: "left", verticalAlign: "top" },
      shape: { textAlign: "center", verticalAlign: "middle" },
    };
    const toolbar = document.getElementById("diagramToolbar"),
      indicator = document.getElementById("diagramIndicator");
    const ops = () => host.getOps(),
      items = () => ops().filter((o) => o.type === "diagram");
    const active = () => host.active();
    const textTool = () => host.textTool();
    const frame = () => host.frame();
    const redraw = () => {
      host.draw();
      renderSelection();
    };
    function sync() {
      toolbar.hidden = indicator.hidden = !active() || textTool();
      if (lastSurface !== host.surface()) {
        finish();
        closeEditor();
        selected.clear();
        lastSurface = host.surface();
      }
      if (!active()) {
        finish();
        closeEditor();
        selected.clear();
        closePalette();
      }
      toolbar.querySelectorAll("[data-diagram-tool]").forEach((b) => {
        b.classList.toggle("active", b.dataset.diagramTool === tool);
        b.setAttribute("aria-pressed", String(b.dataset.diagramTool === tool));
      });
      document.getElementById("diagramStroke").style.borderColor = stroke;
      document.getElementById("diagramFill").style.background =
        fill === "transparent" ? "white" : fill;
      selected = new Set(
        [...selected].filter((id) => items().some((o) => o.id === id)),
      );
      const targets = items().filter(o => selected.has(o.id)),
        defaults = alignment[tool === "text" ? "text" : "shape"];
      for (const [id, property, get] of [
        ["diagramTextAlign", "textAlign", textAlignment],
        ["diagramVerticalAlign", "verticalAlign", verticalAlignment],
      ]) {
        const values = new Set(targets.map(get));
        document.getElementById(id).value = targets.length ? (values.size === 1 ? [...values][0] : "") : defaults[property];
      }
      renderSelection();
    }
    function renderSelection() {
      document
        .querySelectorAll(".diagram-selection,.diagram-marquee")
        .forEach((n) => n.remove());
      if (!active() || textTool() || !frame() || editor) return;
      const canvas = frame().querySelector("canvas"),
        rect = canvas.getBoundingClientRect(),
        size = host.size();
      const knob = Math.min(
        24,
        Math.max(3, (9 * size.width) / Math.max(1, rect.width)),
      );
      for (const o of items().filter((o) => selected.has(o.id))) {
        const b = bounds(o, ops()),
          box = document.createElement("div");
        box.className = "diagram-selection";
        Object.assign(box.style, {
          left: `${b.x}px`,
          top: `${b.y}px`,
          width: `${b.w}px`,
          height: `${b.h}px`,
        });
        if (selected.size === 1) {
          const points = isConnector(o)
            ? endpoints(o, ops()).map((p, i) => [
                i ? "end" : "start",
                p.x - b.x,
                p.y - b.y,
              ])
            : [
                ["nw", 0, 0],
                ["n", b.w / 2, 0],
                ["ne", b.w, 0],
                ["e", b.w, b.h / 2],
                ["se", b.w, b.h],
                ["s", b.w / 2, b.h],
                ["sw", 0, b.h],
                ["w", 0, b.h / 2],
              ];
          for (const [handle, x, y] of points) {
            const dot = document.createElement("span");
            dot.className = "diagram-knob";
            dot.dataset.handle = handle;
            Object.assign(dot.style, {
              left: `${x}px`,
              top: `${y}px`,
              width: `${knob}px`,
              height: `${knob}px`,
            });
            box.append(dot);
          }
        }
        frame().append(box);
      }
      if (gesture?.type === "marquee" && gesture.box) {
        const b = gesture.box,
          box = document.createElement("div");
        box.className = "diagram-marquee";
        Object.assign(box.style, {
          left: `${b.x}px`,
          top: `${b.y}px`,
          width: `${b.w}px`,
          height: `${b.h}px`,
        });
        frame().append(box);
      }
    }
    function change(action) {
      finish();
      host.checkpoint();
      action();
      redraw();
      host.persist();
    }
    function choose(name) {
      finish();
      closeEditor();
      tool = name;
      sync();
      host.focus();
    }
    function closePalette() {
      if (palette) {
        palette.remove();
        palette = null;
      }
    }
    function openPalette(property) {
      closePalette();
      palette = document.createElement("div");
      palette.className = "diagram-palette";
      palette.setAttribute("role", "dialog");
      palette.setAttribute(
        "aria-label",
        property === "color" ? "Stroke color" : "Fill color",
      );
      const choices = property === "fill" ? ["transparent", ...colors] : colors;
      choices.forEach((c, i) => {
        const b = document.createElement("button");
        b.type = "button";
        b.textContent =
          c === "transparent"
            ? "No fill"
            : ["Black", "Red", "Blue", "Green", "Yellow", "White"][
                colors.indexOf(c)
              ];
        b.style.borderBottom = `5px solid ${c === "transparent" ? "#ddd" : c}`;
        b.addEventListener("click", () => {
          if (property === "fill") fill = c;
          else stroke = c;
          if (selected.size)
            change(() =>
              items()
                .filter((o) => selected.has(o.id))
                .forEach((o) => (o[property] = c)),
            );
          closePalette();
          sync();
          host.focus();
        });
        palette.append(b);
      });
      toolbar.append(palette);
      palette.querySelector("button").focus();
    }
    function hit(p) {
      return items()
        .slice()
        .reverse()
        .find((o) =>
          (!textTool() || o.kind === "text") && contains(
            o,
            p,
            ops(),
            (8 * host.size().width) / frame().getBoundingClientRect().width,
          ),
        );
    }
    function bind(p, exclude = null) {
      return items()
        .slice()
        .reverse()
        .find((o) => shape(o) && o.id !== exclude && contains(o, p, ops(), 14));
    }
    function fresh(kind, p) {
      const o = {
        type: "diagram",
        id: uid(),
        kind,
        color: stroke,
        fill,
        text: "",
        fontSize: 24,
        ...alignment[kind === "text" ? "text" : "shape"],
      };
      return isConnector(o)
        ? {
            ...o,
            start: copy(p),
            end: copy(p),
            startBinding: null,
            endBinding: null,
            elbow,
          }
        : {
            ...o,
            x: Math.min(p.x, host.size().width - 1),
            y: Math.min(p.y, host.size().height - 1),
            w: 1,
            h: 1,
          };
    }
    function insertDefault() {
      const size = host.size(),
        p = { x: size.width * 0.35, y: size.height * 0.35 };
      change(() => {
        const o = fresh(tool, p);
        if (isConnector(o))
          o.end = { x: p.x + size.width * 0.25, y: p.y + size.height * 0.15 };
        else {
          o.w = Math.min(180, size.width * 0.3);
          o.h = Math.min(100, size.height * 0.25);
        }
        ops().push(o);
        selected = new Set([o.id]);
      });
      if (tool === "text") edit(items().find((o) => selected.has(o.id)));
      else sync();
    }
    function finish() {
      if (!gesture) return;
      const previous = gesture;
      gesture = null;
      if (previous.type === "create") {
        const o = items().find((o) => o.id === previous.id);
        if (o) {
          const b = bounds(o, ops());
          if (b.w < 3 && b.h < 3) {
            if (isConnector(o)) {
              o.end.x = clamp(o.start.x + 120, 0, host.size().width);
              o.end.y = clamp(o.start.y + 50, 0, host.size().height);
            } else {
              o.w = Math.min(160, host.size().width - o.x);
              o.h = Math.min(90, host.size().height - o.y);
            }
          }
        }
      }
      redraw();
      sync();
      host.persist();
    }
    function cancelGesture() {
      if (!gesture) return;
      host.setOps(gesture.before);
      gesture = null;
      redraw();
      host.persist();
    }
    function moveSelected(dx, dy, source = ops()) {
      const size = host.size(),
        boxes = source
          .filter((o) => o.type === "diagram" && selected.has(o.id))
          .map((o) => bounds(o, source));
      if (!boxes.length) return;
      dx = clamp(
        dx,
        -Math.min(...boxes.map((b) => b.x)),
        size.width - Math.max(...boxes.map((b) => b.x + b.w)),
      );
      dy = clamp(
        dy,
        -Math.min(...boxes.map((b) => b.y)),
        size.height - Math.max(...boxes.map((b) => b.y + b.h)),
      );
      items()
        .filter((o) => selected.has(o.id))
        .forEach((o) => {
          const old = source.find((v) => v.id === o.id);
          if (!old) return;
          if (isConnector(o)) {
            const [a, b] = endpoints(old, source);
            for (const [end, p] of [
              ["start", a],
              ["end", b],
            ]) {
              o[end] = { x: p.x + dx, y: p.y + dy };
              if (o[end + "Binding"] && !selected.has(o[end + "Binding"]))
                o[end + "Binding"] = null;
            }
          } else {
            o.x = old.x + dx;
            o.y = old.y + dy;
          }
        });
    }
    function resize(o, old, handle, dx, dy) {
      const size = host.size();
      let x = old.x,
        y = old.y,
        right = old.x + old.w,
        bottom = old.y + old.h;
      if (handle.includes("w")) x = clamp(x + dx, 0, Math.max(0, right - 12));
      if (handle.includes("e"))
        right = clamp(right + dx, Math.min(size.width, x + 12), size.width);
      if (handle.includes("n")) y = clamp(y + dy, 0, Math.max(0, bottom - 12));
      if (handle.includes("s"))
        bottom = clamp(bottom + dy, Math.min(size.height, y + 12), size.height);
      Object.assign(o, { x, y, w: right - x, h: bottom - y });
    }
    function handleAt(p, o) {
      const b = bounds(o, ops()),
        tol = (9 * host.size().width) / frame().getBoundingClientRect().width;
      const list = isConnector(o)
        ? endpoints(o, ops()).map((q, i) => [i ? "end" : "start", q.x, q.y])
        : [
            ["nw", b.x, b.y],
            ["n", b.x + b.w / 2, b.y],
            ["ne", b.x + b.w, b.y],
            ["e", b.x + b.w, b.y + b.h / 2],
            ["se", b.x + b.w, b.y + b.h],
            ["s", b.x + b.w / 2, b.y + b.h],
            ["sw", b.x, b.y + b.h],
            ["w", b.x, b.y + b.h / 2],
          ];
      return list.find(([, x, y]) => Math.hypot(x - p.x, y - p.y) < tol)?.[0];
    }
    function down(event, canvas) {
      if (
        !active() ||
        !host.canDraw(canvas) ||
        event.button !== 0 ||
        (!textTool() && tool === "hand")
      )
        return false;
      closeEditor();
      closePalette();
      host.stopMotion();
      const p = host.point(event, canvas);
      let target = hit(p);
      event.preventDefault();
      canvas.setPointerCapture(event.pointerId);
      if (textTool() || tool === "text") {
        if (target && !isConnector(target)) edit(target);
        else if (textTool()) {
          target = {
            ...fresh("text", p),
            color: host.textColor(),
            fill: "transparent",
            fontSize: 20,
            fontFamily: "Arial",
            fontStyle: "italic",
            textAlign: "left",
            verticalAlign: "top",
          };
          target.w = Math.min(220, host.size().width - target.x);
          target.h = Math.min(70, host.size().height - target.y);
          edit(target, true);
        } else {
          change(() => {
            target = fresh("text", p);
            target.w = Math.min(220, host.size().width - target.x);
            target.h = Math.min(70, host.size().height - target.y);
            ops().push(target);
            selected = new Set([target.id]);
          });
          edit(target);
        }
        return true;
      }
      const before = copy(ops());
      if (target && tool !== "select" && !["line", "arrow"].includes(tool)) {
        selected = new Set([target.id]);
        gesture = { type: "pending-create", p, before, pointer: event.pointerId };
        redraw();
        return true;
      }
      if (tool === "select") {
        const current =
            selected.size === 1
              ? items().find((o) => selected.has(o.id))
              : null,
          handle = current && handleAt(p, current);
        if (handle) {
          host.checkpoint();
          gesture = {
            type: "resize",
            id: current.id,
            handle,
            p,
            before,
            pointer: event.pointerId,
          };
          return true;
        }
        if (target) {
          if (event.shiftKey) {
            selected.has(target.id)
              ? selected.delete(target.id)
              : selected.add(target.id);
            redraw();
            return true;
          }
          if (!selected.has(target.id)) selected = new Set([target.id]);
          if (event.altKey) {
            duplicate();
            target = items().find((o) => selected.has(o.id));
          }
          host.checkpoint();
          gesture = {
            type: "move",
            p,
            before: copy(ops()),
            pointer: event.pointerId,
          };
        } else {
          if (!event.shiftKey) selected.clear();
          gesture = { type: "marquee", p, before, pointer: event.pointerId };
        }
      } else {
        host.checkpoint();
        const o = fresh(tool, p);
        if (isConnector(o) && !(event.ctrlKey || event.metaKey))
          o.startBinding = bind(p)?.id || null;
        ops().push(o);
        selected = new Set([o.id]);
        gesture = {
          type: "create",
          id: o.id,
          p: isConnector(o) ? p : { x: o.x, y: o.y },
          before,
          pointer: event.pointerId,
        };
      }
      redraw();
      return true;
    }
    function move(event, canvas) {
      if (!gesture || event.pointerId !== gesture.pointer) return false;
      const p = host.point(event, canvas);
      if (gesture.type === "pending-create") {
        if (Math.hypot(p.x - gesture.p.x, p.y - gesture.p.y) < 3) return true;
        host.checkpoint();
        const o = fresh(tool, gesture.p);
        ops().push(o);
        selected = new Set([o.id]);
        gesture = { ...gesture, type: "create", id: o.id };
      }
      const
        dx = p.x - gesture.p.x,
        dy = p.y - gesture.p.y,
        o = items().find((o) => o.id === gesture.id);
      if (gesture.type === "move") moveSelected(dx, dy, gesture.before);
      if (gesture.type === "create") {
        if (isConnector(o)) {
          o.end = copy(p);
          o.endBinding =
            event.ctrlKey || event.metaKey
              ? null
              : bind(p, o.startBinding)?.id || null;
        } else {
          let w = Math.abs(dx),
            h = Math.abs(dy);
          if (event.shiftKey) w = h = Math.min(w, h);
          o.x = dx < 0 ? gesture.p.x - w : gesture.p.x;
          o.y = dy < 0 ? gesture.p.y - h : gesture.p.y;
          o.w = Math.max(1, w);
          o.h = Math.max(1, h);
        }
      }
      if (gesture.type === "resize") {
        if (isConnector(o)) {
          o[gesture.handle] = copy(p);
          o[gesture.handle + "Binding"] =
            event.ctrlKey || event.metaKey ? null : bind(p)?.id || null;
        } else
          resize(
            o,
            gesture.before.find((v) => v.id === o.id),
            gesture.handle,
            dx,
            dy,
          );
      }
      if (gesture.type === "marquee") {
        const b = {
          x: Math.min(p.x, gesture.p.x),
          y: Math.min(p.y, gesture.p.y),
          w: Math.abs(dx),
          h: Math.abs(dy),
        };
        gesture.box = b;
        selected = new Set(
          items()
            .filter((o) => {
              const r = bounds(o, ops());
              return (
                r.x >= b.x &&
                r.y >= b.y &&
                r.x + r.w <= b.x + b.w &&
                r.y + r.h <= b.y + b.h
              );
            })
            .map((o) => o.id),
        );
      }
      redraw();
      return true;
    }
    function edit(o, draft = false) {
      finish();
      closeEditor();
      if (!o) return;
      selected = new Set([o.id]);
      const b = bounds(o, ops()),
        input = document.createElement("textarea");
      input.className = "diagram-text-editor";
      input.value = o.text;
      input.placeholder = "Type text";
      input.setAttribute(
        "aria-label",
        textTool() ? "Text label" : o.kind === "text" ? "Diagram text" : "Shape label",
      );
      const width = Math.min(Math.max(130, b.w), host.size().width - b.x),
        height = Math.min(Math.max(60, b.h), host.size().height - b.y);
      Object.assign(input.style, {
        left: `${b.x}px`,
        top: `${b.y}px`,
        width: `${width}px`,
        height: `${height}px`,
        fontSize: `${o.fontSize}px`,
        fontFamily: o.fontFamily || "system-ui, sans-serif",
        fontStyle: o.fontStyle || "normal",
        textAlign: textAlignment(o),
        color: o.color,
      });
      editor = { input, id: o.id, draft: draft ? o : null };
      frame().append(input);
      const positionText = () => {
        const ctx = frame().querySelector("canvas").getContext("2d");
        ctx.save();
        const layout = textLayout(ctx, { ...o, text: input.value }, ops());
        ctx.restore();
        const contentHeight = Math.min(height - 20, layout.lines.length * layout.lineHeight),
          vertical = verticalAlignment(o);
        input.style.paddingTop = `${vertical === "middle" ? Math.max(8, (height - contentHeight) / 2 - 2) : vertical === "bottom" ? Math.max(8, height - contentHeight - 10) : 8}px`;
      };
      positionText();
      input.addEventListener("input", positionText);
      redraw();
      sync();
      input.focus();
      input.select();
      input.addEventListener("blur", closeEditor);
    }
    function closeEditor() {
      if (!editor) return;
      const { input, id, draft } = editor;
      editor = null;
      const o = items().find((o) => o.id === id),
        text = input.value.slice(0, 10000);
      input.remove();
      if (draft && text.trim()) {
        host.checkpoint();
        ops().push({ ...draft, text });
        host.persist();
      } else if (o && o.text !== text) {
        host.checkpoint();
        o.text = text;
        host.persist();
      }
      redraw();
    }
    function copySelection() {
      clipboard = copy(items().filter((o) => selected.has(o.id)));
      for (const o of clipboard)
        if (isConnector(o)) {
          const [a, b] = endpoints(o, ops());
          o.start = a;
          o.end = b;
        }
    }
    function paste() {
      if (!clipboard.length) return;
      change(() => {
        const map = new Map(clipboard.map((o) => [o.id, uid()])),
          incoming = copy(clipboard),
          size = host.size();
        const boxes = incoming.map((o) => bounds(o, incoming));
        const dx = Math.min(
            24,
            size.width - Math.max(...boxes.map((b) => b.x + b.w)),
          ),
          dy = Math.min(
            24,
            size.height - Math.max(...boxes.map((b) => b.y + b.h)),
          );
        const minx = Math.min(...boxes.map((b) => b.x)),
          miny = Math.min(...boxes.map((b) => b.y));
        // Scale a copied group only if it cannot fit a smaller destination page.
        const scale = Math.min(
          1,
          size.width /
            Math.max(1, Math.max(...boxes.map((b) => b.x + b.w)) - minx + 24),
          size.height /
            Math.max(1, Math.max(...boxes.map((b) => b.y + b.h)) - miny + 24),
        );
        for (const o of incoming) {
          o.id = map.get(o.id);
          const transform = (p) =>
            scale < 1
              ? { x: (p.x - minx + 12) * scale, y: (p.y - miny + 12) * scale }
              : { x: p.x + dx, y: p.y + dy };
          if (isConnector(o)) {
            o.start = transform(o.start);
            o.end = transform(o.end);
            o.startBinding = map.get(o.startBinding) || null;
            o.endBinding = map.get(o.endBinding) || null;
          } else {
            const p = transform(o);
            o.x = p.x;
            o.y = p.y;
            o.w *= scale;
            o.h *= scale;
          }
        }
        ops().push(...incoming);
        selected = new Set(incoming.map((o) => o.id));
        tool = "select";
      });
      sync();
    }
    function duplicate() {
      copySelection();
      paste();
    }
    function remove() {
      if (!selected.size) return;
      change(() => {
        for (const o of items().filter(isConnector)) {
          const [a, b] = endpoints(o, ops());
          if (selected.has(o.startBinding)) {
            o.start = a;
            o.startBinding = null;
          }
          if (selected.has(o.endBinding)) {
            o.end = b;
            o.endBinding = null;
          }
        }
        host.setOps(
          ops().filter((o) => !(o.type === "diagram" && selected.has(o.id))),
        );
        selected.clear();
      });
    }
    function key(event) {
      if (!active()) return false;
      const k = event.key,
        lower = k.toLowerCase(),
        mod = event.ctrlKey || event.metaKey;
      if (editor) {
        if (k === "Escape" || (mod && k === "Enter")) {
          event.preventDefault();
          closeEditor();
          sync();
          host.focus();
        }
        return true;
      }
      if (textTool()) return false;
      if (palette) {
        if (k === "Escape") {
          event.preventDefault();
          closePalette();
          host.focus();
        } else if (
          ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(k)
        ) {
          event.preventDefault();
          const bs = [...palette.querySelectorAll("button")],
            i = bs.indexOf(document.activeElement);
          bs[
            (i + (["ArrowLeft", "ArrowUp"].includes(k) ? -1 : 1) + bs.length) %
              bs.length
          ].focus();
        } else if (k === "Enter" || k === " ") {
          event.preventDefault();
          document.activeElement.click();
        }
        return true;
      }
      if (
        event.target.matches?.("input,textarea,select") ||
        event.target.isContentEditable
      )
        return false;
      if (
        event.target.closest?.("#diagramToolbar") &&
        ["Tab", "Enter", " "].includes(k)
      )
        return false;
      if (k === "Escape") {
        event.preventDefault();
        if (gesture) cancelGesture();
        else if (selected.size) {
          selected.clear();
          choose("select");
        } else if (tool !== "select") choose("select");
        else host.exit();
        return true;
      }
      if (
        k === "?" ||
        k === "PageDown" ||
        k === "PageUp" ||
        k === " " ||
        (lower === "f" && !event.shiftKey) ||
        k === "+" ||
        k === "=" ||
        k === "-"
      )
        return false;
      event.preventDefault();
      if (mod) {
        if (lower === "d") duplicate();
        else if (lower === "c") copySelection();
        else if (lower === "x") {
          copySelection();
          remove();
        } else if (lower === "v") paste();
        else if (lower === "a") {
          selected = new Set(items().map((o) => o.id));
          redraw();
        } else if (lower === "z") {
          finish();
          event.shiftKey ? host.redo() : host.undo();
          sync();
        } else if (lower === "y") {
          host.redo();
          sync();
        } else if (event.altKey && k.startsWith("Arrow")) {
          const amount = event.shiftKey ? 10 : 1;
          change(() =>
            items()
              .filter((o) => selected.has(o.id) && !isConnector(o))
              .forEach((o) =>
                resize(
                  o,
                  copy(o),
                  "se",
                  k === "ArrowLeft" ? -amount : k === "ArrowRight" ? amount : 0,
                  k === "ArrowUp" ? -amount : k === "ArrowDown" ? amount : 0,
                ),
              ),
          );
        }
        return true;
      }
      if (k.startsWith("Arrow")) {
        const n = event.shiftKey ? 10 : 1;
        change(() =>
          moveSelected(
            k === "ArrowLeft" ? -n : k === "ArrowRight" ? n : 0,
            k === "ArrowUp" ? -n : k === "ArrowDown" ? n : 0,
            copy(ops()),
          ),
        );
        return true;
      }
      if (k === "Delete" || k === "Backspace") {
        remove();
        return true;
      }
      if (k === "Tab") {
        const list = items();
        if (list.length) {
          const i = list.findIndex((o) => selected.has(o.id)),
            next = (i + (event.shiftKey ? -1 : 1) + list.length) % list.length;
          selected = new Set([list[next].id]);
          tool = "select";
          sync();
        }
        return true;
      }
      if (k === "Enter") {
        if (selected.size === 1)
          edit(items().find((o) => selected.has(o.id)));
        else if (tool !== "select" && tool !== "hand") insertDefault();
        return true;
      }
      if (lower === "s" && !event.shiftKey) {
        openPalette("color");
        return true;
      }
      if (lower === "g" && !event.shiftKey) {
        openPalette("fill");
        return true;
      }
      if (lower === "l" && event.shiftKey) {
        const select = document.getElementById("diagramConnector");
        select.value = elbow ? "straight" : "elbow";
        select.dispatchEvent(new Event("change"));
        return true;
      }
      const map = {
        v: "select",
        1: "select",
        r: "rectangle",
        2: "rectangle",
        d: "diamond",
        3: "diamond",
        o: "ellipse",
        4: "ellipse",
        a: "arrow",
        5: "arrow",
        l: "line",
        6: "line",
        t: "text",
        8: "text",
        h: "hand",
      };
      if (lower === "t" && event.shiftKey) choose("triangle");
      else if (lower === "p" && event.shiftKey) choose("parallelogram");
      else if (map[lower]) choose(map[lower]);
      return true; // Reserved diagram keys never leak into presentation tools.
    }
    toolbar
      .querySelectorAll("[data-diagram-tool]")
      .forEach((b) =>
        b.addEventListener("click", () => choose(b.dataset.diagramTool)),
      );
    document
      .getElementById("diagramStroke")
      .addEventListener("click", () => openPalette("color"));
    document
      .getElementById("diagramFill")
      .addEventListener("click", () => openPalette("fill"));
    for (const [id, property] of [["diagramTextAlign", "textAlign"], ["diagramVerticalAlign", "verticalAlign"]]) {
      document.getElementById(id).addEventListener("change", event => {
        closeEditor();
        const value = event.target.value,
          targets = items().filter(o => selected.has(o.id));
        if (targets.length) {
          change(() => targets.forEach(o => {
            o[property] = value;
            alignment[o.kind === "text" ? "text" : "shape"][property] = value;
          }));
        } else alignment[tool === "text" ? "text" : "shape"][property] = value;
        sync();
      });
    }
    document
      .getElementById("diagramDuplicate")
      .addEventListener("click", duplicate);
    document.getElementById("diagramDelete").addEventListener("click", remove);
    document
      .getElementById("diagramExit")
      .addEventListener("click", () => host.exit());
    document
      .getElementById("diagramConnector")
      .addEventListener("change", (e) => {
        elbow = e.target.value === "elbow";
        if (selected.size)
          change(() =>
            items()
              .filter((o) => selected.has(o.id) && isConnector(o))
              .forEach((o) => (o.elbow = elbow)),
          );
      });
    return {
      sync,
      key,
      down,
      move,
      finish,
      cancel: cancelGesture,
      closeEditor,
      renderSelection,
      doubleClick(event, canvas) {
        if (active() && !textTool() && host.canDraw(canvas)) {
          const o = hit(host.point(event, canvas));
          if (o) {
            event.preventDefault();
            edit(o);
          }
        }
      },
      isHand: () => active() && !textTool() && tool === "hand",
      isEditing: () => !!editor,
      get editingId() { return editor?.id; },
      isDragging: () => !!gesture,
      reset() {
        finish();
        closeEditor();
        selected.clear();
        closePalette();
      },
      get selected() {
        return [...selected];
      },
      get tool() {
        return tool;
      },
    };
  }
  window.PigeonDiagram = { create, draw, renderLabels, validate, endpoints, bounds, kinds };
})();
