/* SVG adaptations of the React Bits title-effect designs. No React or remote
 * scripts are required. See THIRD_PARTY_NOTICES.txt for upstream references.
 * Original Typst glyph outlines, positions and paints are retained.
 */
(() => {
  const NS = 'http://www.w3.org/2000/svg';
  let serial = 0;
  const names = ['none', 'split-text', 'blur-text', 'shiny-text', 'gradient-text', 'text-type'];
  function create(text, width, height) {
    const doc = new DOMParser().parseFromString(text, 'image/svg+xml');
    if (doc.querySelector('parsererror')) throw new Error('Invalid title SVG');
    const svg = document.importNode(doc.documentElement, true);
    // Each inline SVG gets its own definition namespace (glyphs, clips, paint).
    const prefix = `pigeon-title-${++serial}-`;
    const ids = new Map([...svg.querySelectorAll('[id]')].map(el => [el.id, prefix + el.id]));
    for (const el of [svg, ...svg.querySelectorAll('*')]) {
      for (const attribute of [...el.attributes]) {
        let value = attribute.value;
        if (attribute.name === 'id') value = ids.get(value) || value;
        else if (['href', 'xlink:href'].includes(attribute.name) && value.startsWith('#')) value = '#' + (ids.get(value.slice(1)) || value.slice(1));
        else value = value.replace(/url\(#([^)]*)\)/g, (_, id) => `url(#${ids.get(id) || id})`);
        if (attribute.namespaceURI) el.setAttributeNS(attribute.namespaceURI, attribute.name, value);
        else el.setAttribute(attribute.name, value);
      }
    }
    svg.classList.add('title-artwork');
    svg.setAttribute('width', width); svg.setAttribute('height', height);
    svg.setAttribute('aria-hidden', 'true');
    return svg;
  }
  function play(svg, name, rect) {
    const glyphs = [...svg.querySelectorAll('.pigeon-title-glyph')];
    const animations = [];
    function animate(el, keyframes, options) {
      if (el.animate) animations.push(el.animate(keyframes, options));
    }
    const stagger = Math.min(35, 900 / Math.max(1, glyphs.length));
    if (name === 'split-text' || name === 'blur-text' || name === 'text-type') {
      glyphs.forEach((glyph, index) => {
        glyph.style.transformBox = 'fill-box';
        glyph.style.transformOrigin = 'center';
        if (name === 'split-text') {
          animate(glyph, [{opacity:0,transform:'translateY(40px)'}, {opacity:1,transform:'translateY(0)'}],
            {duration:700,delay:index*stagger,easing:'cubic-bezier(.22,1,.36,1)',fill:'both'});
        } else if (name === 'blur-text') {
          animate(glyph, [{opacity:0,filter:'blur(10px)',transform:'translateY(-35px)'},
            {opacity:.5,filter:'blur(5px)',transform:'translateY(4px)',offset:.5},
            {opacity:1,filter:'blur(0)',transform:'translateY(0)'}],
            {duration:700,delay:index*stagger,easing:'ease-out',fill:'both'});
        } else {
          animate(glyph, [{opacity:0},{opacity:1}], {duration:1,delay:index*stagger,fill:'both'});
        }
      });
    } else if (name === 'shiny-text' || name === 'gradient-text') {
      const defs = document.createElementNS(NS, 'defs');
      const mask = document.createElementNS(NS, 'mask');
      const id = `pigeon-title-paint-${++serial}`;
      mask.id = id;
      mask.setAttribute('maskUnits', 'userSpaceOnUse');
      mask.setAttribute('x',rect.x-5);mask.setAttribute('y',rect.y-5);
      mask.setAttribute('width',rect.width+10);mask.setAttribute('height',rect.height+10);
      // A white silhouette gives a mask independent of the title's source color.
      for (const glyph of glyphs) {
        const clone = glyph.cloneNode(true);
        for (const el of [clone,...clone.querySelectorAll('*')]) {
          el.setAttribute('fill','white'); el.removeAttribute('stroke');
        }
        mask.append(clone);
      }
      defs.append(mask);svg.prepend(defs);
      // Keep the paint entirely in SVG: foreignObject masks have inconsistent
      // rendering in Safari. Move a wide gradient behind a stationary mask.
      const gradient = document.createElementNS(NS,'linearGradient');
      gradient.id = id + '-gradient';
      const stops = name === 'shiny-text'
        ? [[0,'white',0],[.4,'white',0],[.5,'white',.95],[.6,'white',0],[1,'white',0]]
        : [[0,'#2563eb',1],[.125,'#a855f7',1],[.25,'#e11d48',1],[.375,'#f59e0b',1],
           [.5,'#2563eb',1],[.625,'#a855f7',1],[.75,'#e11d48',1],[.875,'#f59e0b',1],[1,'#2563eb',1]];
      for (const [offset,color,opacity] of stops) {
        const stop = document.createElementNS(NS,'stop');
        stop.setAttribute('offset',offset);stop.setAttribute('stop-color',color);
        stop.setAttribute('stop-opacity',opacity);gradient.append(stop);
      }
      defs.append(gradient);
      const paint = document.createElementNS(NS,'g');
      paint.setAttribute('mask',`url(#${id})`);
      const color = document.createElementNS(NS,'rect');
      const distance = rect.width + 6;
      color.setAttribute('x',rect.x-3-distance*2);color.setAttribute('y',rect.y-3);
      color.setAttribute('width',distance*4);color.setAttribute('height',rect.height+6);
      color.setAttribute('fill',`url(#${gradient.id})`);
      paint.append(color);svg.append(paint);
      if (name === 'gradient-text') glyphs.forEach(g => {g.style.opacity='0';});
      animate(color,[{transform:`translateX(${-distance}px)`},{transform:`translateX(${distance}px)`}],
        {duration:name==='shiny-text'?2200:4000,iterations:Infinity,easing:'linear'});
    }
    return () => { animations.forEach(animation => animation.cancel()); svg.remove(); };
  }
  window.PigeonTitleEffects = {names,create,play};
})();
