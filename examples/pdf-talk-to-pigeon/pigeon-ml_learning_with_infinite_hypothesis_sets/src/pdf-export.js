/* Preserve original PDF pages; composite only the new ink as transparent PNGs. */
(() => {
  let loading;
  function library() {
    if (window.PDFLib) return Promise.resolve(window.PDFLib);
    if (!loading) loading = new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = "src/vendor/pdf-lib.min.js";
      script.onload = () => window.PDFLib ? resolve(window.PDFLib) : reject(new Error("PDF export library did not start"));
      script.onerror = () => { script.remove(); reject(new Error("PDF export library is missing. Re-extract the complete presentation folder.")); };
      document.body.append(script);
    }).catch(error => { loading = null; throw error; });
    return loading;
  }

  function geometry(page) {
    const crop = page.getCropBox(), media = page.getMediaBox();
    const x = Math.max(crop.x, media.x), y = Math.max(crop.y, media.y);
    const width = Math.min(crop.x + crop.width, media.x + media.width) - x;
    const height = Math.min(crop.y + crop.height, media.y + media.height) - y;
    const angle = ((page.getRotation().angle % 360) + 360) % 360;
    if (width <= 0 || height <= 0 || ![0, 90, 180, 270].includes(angle))
      throw new Error("The source PDF contains an unsupported page box or rotation");
    return { x, y, width, height, angle,
      displayWidth: angle % 180 ? height : width,
      displayHeight: angle % 180 ? width : height };
  }

  async function build({ source, title, slides, annotations, boards, boardMeta, renderInk, onProgress = () => {} }) {
    const { PDFDocument, PDFName, degrees, rgb } = await library();
    const original = await PDFDocument.load(source);
    const output = await PDFDocument.create();
    output.setTitle(title || original.getTitle() || "Pigeon presentation");
    output.setCreator("Pigeon 1.0.2");
    output.setProducer("Pigeon · pdf-lib 1.17.1");
    const indices = slides.map(slide => {
      if (!Number.isInteger(slide.page) || slide.page < 1 || slide.page > original.getPageCount())
        throw new Error(`Slide ${slide.id} has no matching source PDF page`);
      return slide.page - 1;
    });
    // Copy in one batch so fonts and shared resources are not duplicated per page.
    const pages = await output.copyPages(original, indices);
    const entries = slides.flatMap((slide, i) => [
      { slide, page: pages[i], key: null },
      ...Object.keys(boardMeta).filter(key => key.startsWith(`${slide.id}::`) && boardMeta[key].inserted)
        .map(key => ({ slide, page: pages[i], key })),
    ]);
    onProgress(0, entries.length);
    for (const [i, entry] of entries.entries()) {
      const { slide, key } = entry, box = geometry(entry.page);
      let page, placement;
      if (key) {
        const unit = entry.page.node.get(PDFName.of("UserUnit"))?.asNumber() || 1;
        page = output.addPage([box.displayWidth * unit, box.displayHeight * unit]);
        placement = { x: 0, y: 0, width: page.getWidth(), height: page.getHeight() };
        page.drawRectangle({ ...placement, color: boardMeta[key].color === "black"
          ? rgb(17/255, 24/255, 39/255) : rgb(1, 1, 1) });
      } else {
        page = output.addPage(entry.page);
        // Counter-rotate the overlay in PDF coordinates to match the displayed slide.
        placement = {
          x: box.x + ([90, 180].includes(box.angle) ? box.width : 0),
          y: box.y + ([180, 270].includes(box.angle) ? box.height : 0),
          width: box.displayWidth, height: box.displayHeight, rotate: degrees(box.angle),
        };
      }
      const ops = (key ? boards[key] : annotations[slide.id]) || [];
      if (ops.length) {
        const image = await output.embedPng(await renderInk(slide, ops));
        page.drawImage(image, placement);
      }
      onProgress(i + 1, entries.length);
      await new Promise(resolve => setTimeout(resolve, 0));
    }
    return { bytes: await output.save(), pages: entries.length };
  }
  window.PigeonPdf = { export: build };
})();
