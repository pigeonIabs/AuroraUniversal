// No page DOM, per-frame messaging, pixel readback, or main-thread raster loops.
'use strict';
let theme, preview, canvas, lifeCanvas, output, lifeOutput, painter, lifePainter;
let active = false, moving = true, dirty = true, announced = false;
let timer = 0, last = 0, seconds = 18, backend = '', contextLost = false;

function stop() { clearTimeout(timer); timer = 0; last = 0; }

function paint() {
  timer = 0;
  if (!active || contextLost) { last = 0; return; }
  const now = performance.now();
  if (last && moving) seconds += Math.min(now - last, 100) / 1000;
  painter.draw(seconds);
  lifePainter?.draw(seconds);
  // The compositor takes ownership of each bitmap without reading pixels back
  // into JavaScript. Fallback and GPU rendering use the same presentation path.
  output.transferFromImageBitmap(canvas.transferToImageBitmap());
  if (lifePainter) lifeOutput.transferFromImageBitmap(lifeCanvas.transferToImageBitmap());
  dirty = false;
  last = now;
  if (!announced) { announced = true; self.postMessage({ type: 'painted', backend }); }
  if (moving) {
    const fps = preview ? (theme === 'deep-ocean' ? 12 : 15) : painter.fps || 24;
    // Only schedule frames that will actually be rendered. Missed deadlines
    // never accumulate a queue or trigger catch-up rendering.
    timer = setTimeout(draw, Math.max(0, 1000 / fps - (performance.now() - now)));
  } else last = 0;
}

function draw() {
  try { paint(); }
  catch (error) { stop(); active = false; self.postMessage({ type: 'error', message: String(error) }); }
}

function update(state) {
  const wasActive = active, wasMoving = moving;
  active = state.active;
  moving = state.moving;
  // These are the original renderer dimensions and budgets, unchanged.
  const ocean = theme === 'deep-ocean';
  const maxDimension = preview ? 480 : ocean ? 1600 : painter.maxDimension || 1920;
  const pixelBudget = preview ? 140000 : ocean ? 1200000 : 1800000;
  const scale = Math.min(1, maxDimension / Math.max(state.width, state.height, 1),
    Math.sqrt(pixelBudget / Math.max(1, state.width * state.height)));
  const width = Math.max(1, Math.round(state.width * scale));
  const height = Math.max(1, Math.round(state.height * scale));
  if (canvas.width !== width || canvas.height !== height) {
    canvas.width = width; canvas.height = height;
    output.canvas.width = width; output.canvas.height = height;
    if (lifeCanvas) {
      lifeCanvas.width = width; lifeCanvas.height = height;
      lifeOutput.canvas.width = width; lifeOutput.canvas.height = height;
    }
    dirty = true;
  }
  if (!active || contextLost) { stop(); return; }
  if (!wasActive || wasMoving !== moving) stop();
  if (!timer && (dirty || moving)) timer = setTimeout(draw, 0);
}

self.onmessage = ({ data }) => {
  try {
    if (data.type === 'init') {
      theme = data.theme; preview = data.preview;
      // Import only the selected theme. No graphics contexts are allocated for
      // offscreen gallery scenes or the other, unselected wallpaper.
      importScripts(`${theme}-painter.js`);
      const factory = self.AuroraWallpaperPainters[theme];
      canvas = new OffscreenCanvas(1, 1);
      try { painter = factory.makePainter(canvas); } catch (_) { /* Use the identical software field. */ }
      backend = 'webgl-worker';
      if (!painter) {
        canvas = new OffscreenCanvas(1, 1);
        painter = factory.makeCanvasPainter(canvas);
        backend = 'canvas-worker';
      }
      if (!painter) throw new Error('No wallpaper drawing context is available');
      output = data.target.getContext('bitmaprenderer');
      if (!output) throw new Error('The wallpaper presentation context is unavailable');
      if (data.particles) {
        lifeCanvas = new OffscreenCanvas(1, 1);
        lifePainter = factory.makeLifePainter(lifeCanvas);
        lifeOutput = data.particles.getContext('bitmaprenderer');
        if (!lifePainter || !lifeOutput) throw new Error('The particle drawing context is unavailable');
      }
      canvas.addEventListener('webglcontextlost', event => {
        event.preventDefault(); contextLost = true; dirty = true; stop();
      });
      canvas.addEventListener('webglcontextrestored', () => {
        try {
          painter = factory.makePainter(canvas);
          if (!painter) throw new Error('The wallpaper graphics context could not be restored');
          contextLost = false; dirty = true;
          if (active) timer = setTimeout(draw, 0);
        } catch (error) { self.postMessage({ type: 'error', message: String(error) }); }
      });
    }
    update(data);
  } catch (error) {
    stop(); active = false;
    self.postMessage({ type: 'error', message: String(error) });
  }
};
