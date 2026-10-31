/* Native SVG tier artwork; decorations never enter annotations or exports. */
window.PigeonTierRenderer = (() => {
  const NS = 'http://www.w3.org/2000/svg';
  let serial = 0;
  const jobs = new WeakMap();
  const baseAsset = (slide, candidate) => candidate?.backingAsset || candidate?.asset || slide.asset;
  function clear(frame) {
    if (!frame) return;
    jobs.set(frame, (jobs.get(frame) || 0) + 1);
    frame.querySelectorAll('.tier-decoration').forEach(el => el.remove());
    frame.querySelector(':scope > img')?.style.removeProperty('opacity');
    delete frame.dataset.tier;
  }
  function render(frame, slide, candidate, {assetUrl, debug = false, reducedMotion = false, onError = () => {}}) {
    if (!frame || !candidate) return;
    clear(frame);
    frame.dataset.tier = String(candidate.k);
    const roles = slide.semanticTiers?.roles || [], visible = new Set(candidate.visible || []);
    const selected = roles.filter(r => visible.has(r.uid));
    const image = frame.querySelector(':scope > img');
    const asset = assetUrl(candidate.asset || slide.asset);
    if (image) image.src = assetUrl(baseAsset(slide, candidate));
    const decoration = document.createElement('div');
    decoration.className = 'tier-decoration tier-artwork';
    decoration.setAttribute('aria-hidden', 'true');
    const rectStyle = (node, r) => Object.assign(node.style, {left:r.x+'px',top:r.y+'px',width:r.width+'px',height:r.height+'px'});
    // Composite dimmed artwork once over a compile with the dim roles hidden.
    if (candidate.dim?.length && candidate.backingAsset) {
      const svg = document.createElementNS(NS, 'svg');
      svg.classList.add('tier-dim-artwork'); svg.setAttribute('viewBox',`0 0 ${slide.width} ${slide.height}`);
      svg.setAttribute('width',slide.width);svg.setAttribute('height',slide.height);
      const defs = document.createElementNS(NS,'defs'), clip = document.createElementNS(NS,'clipPath');
      const clipId = 'tier-dim-'+(++serial); clip.id = clipId;
      for (const r of selected.filter(r => candidate.dim.includes(r.uid))) {
        const rect = document.createElementNS(NS,'rect');
        for (const key of ['x','y','width','height']) rect.setAttribute(key,r[key]);
        clip.append(rect);
      }
      defs.append(clip);svg.append(defs);
      // Fade the composed native base exactly once during extraction. Fading
      // overlapping sibling images separately darkens colored page fills.
      const composition = document.createElementNS(NS,'g');
      if (candidate.fx === 'extract') {
        composition.setAttribute('opacity','.12');
        const backing=document.createElementNS(NS,'image');
        backing.setAttribute('href',assetUrl(baseAsset(slide,candidate)));
        backing.setAttribute('width',slide.width);backing.setAttribute('height',slide.height);
        composition.append(backing);
      }
      const full=document.createElementNS(NS,'image');
      full.setAttribute('href',asset);full.setAttribute('width',slide.width);full.setAttribute('height',slide.height);
      full.setAttribute('clip-path',`url(#${clipId})`);full.setAttribute('opacity','.25');composition.append(full);svg.append(composition);decoration.append(svg);
    }
    for (const r of selected) {
      if ((candidate.emph || []).includes(r.uid) || (candidate.pin || []).includes(r.uid) || debug) {
        const ring = document.createElement('div'); ring.className = 'tier-ring';
        if ((candidate.pin || []).includes(r.uid)) ring.classList.add('tier-pin');
        if (debug) {ring.classList.add('tier-debug');ring.textContent=r.role+' · '+(r.id || r.uid);}
        rectStyle(ring,r);decoration.append(ring);
      }
    }
    if (candidate.fx === 'extract') {
      const messages=selected.filter(r=>r.role==='takeaway');
      if (messages.length) {
        if(image) image.style.opacity=candidate.dim?.length && candidate.backingAsset ? '0' : '.12';
        decoration.classList.add('tier-extract');
        const gap=12, total=messages.reduce((n,r)=>n+r.height,0)+gap*(messages.length-1);
        const scale=Math.min(2.5,slide.width*.86/Math.max(...messages.map(r=>r.width)),slide.height*.78/total);
        let y=(slide.height-total*scale)/2;
        for(const r of messages) {
          const crop=document.createElement('div');crop.className='tier-extract-crop';
          Object.assign(crop.style,{left:(slide.width-r.width*scale)/2+'px',top:y+'px',width:r.width*scale+'px',height:r.height*scale+'px',backgroundImage:`url("${asset}")`,backgroundSize:`${slide.width*scale}px ${slide.height*scale}px`,backgroundPosition:`${-r.x*scale}px ${-r.y*scale}px`});
          decoration.append(crop);y+=(r.height+gap)*scale;
        }
      }
    }
    frame.append(decoration);
    // Decode errors fail closed: retain this tier's artwork, never the full answer.
    const token=jobs.get(frame), probe=new Image();probe.src=asset;
    probe.decode?.().catch(()=>{if(jobs.get(frame)===token) onError('Tier artwork unavailable; regenerate this presentation.');});
    if(!reducedMotion) decoration.animate?.([{opacity:.6},{opacity:1}],{duration:160});
  }
  return {render,clear,baseAsset};
})();
