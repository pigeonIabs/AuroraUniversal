// Original wallpaper equations. Executed exclusively inside the rendering worker.
(() => {
  'use strict';
  const noiseSize = 256;
  let noisePixels;
  function getNoise() {
    if (noisePixels) return noisePixels;
    noisePixels = new Uint8Array(noiseSize * noiseSize);
    let seed = 48117;
    for (let i = 0; i < noisePixels.length; i++) {
      seed ^= seed << 13; seed ^= seed >>> 17; seed ^= seed << 5;
      noisePixels[i] = seed >>> 24;
    }
    return noisePixels;
  }
  const vertexSource = `
    attribute vec2 aPosition;
    void main() { gl_Position = vec4(aPosition, 0.0, 1.0); }
  `;
  const fragmentSource = `
    precision highp float;
    uniform vec2 uResolution;
    uniform float uTime;
    uniform sampler2D uNoise;
    float noise(vec2 p) {
      vec2 f = fract(p);
      f = f * f * f * (f * (f * 6.0 - 15.0) + 10.0);
      return texture2D(uNoise, (floor(p) + f + 0.5) / 256.0).r;
    }
    vec3 radiance(vec2 p, float k) {
      float t = uTime;
      float billow = noise(p * vec2(3.1, 2.7) + vec2(-t * 0.024, t * 0.018 + k * 19.0));
      float x = p.x + 0.085 * (billow - 0.5) + (p.y - 0.4) * 0.055;
      float arc = 0.64 - k * 0.22 - (0.14 + k * 0.02) * x
        + (0.09 - k * 0.015) * sin(x * (8.5 - k * 1.4) - 0.9 + k * 2.7 + 0.22 * sin(t * 0.065 + k))
        + 0.10 * (noise(vec2(x * 7.0 - t * 0.055, k * 13.0 + t * 0.025)) - 0.5);
      float depth = arc - p.y + 0.035 * (billow - 0.5);
      float spread = 0.12 + 0.075 * noise(vec2(x * 4.6 + k * 17.0, t * 0.032));
      // Smooth asymmetric emission has no clipped underside or opaque silhouette.
      float body = (depth - 0.07) / spread;
      float veil = exp(-body * body);
      veil *= smoothstep(-0.15, 0.025, depth);
      float edge = (depth - 0.015) / 0.048;
      float core = exp(-edge * edge) * 0.13;
      float warp = x * 43.0 + billow * 3.5 + depth * 7.0;
      float silk = noise(vec2(warp, depth * 5.0 - t * 0.12 + k * 21.0));
      float finer = noise(vec2(warp * 1.93 + billow, depth * 9.0 + t * 0.09));
      float wisps = 0.74 + 0.18 * silk + 0.08 * finer;
      float pockets = 0.32 + 0.68 * noise(vec2(x * 6.0 - t * 0.045 + k * 11.0, t * 0.035));
      float energy = (veil * 0.66 + core) * wisps * pockets * (1.0 - k * 0.34);
      float tint = smoothstep(0.015, 0.21, depth + k * 0.035);
      float colorDrift = noise(vec2(x * 2.3 + k * 7.0, t * 0.021));
      vec3 lower = mix(vec3(0.19, 0.48, 0.56), vec3(0.33, 0.54, 0.46), colorDrift * 0.48);
      vec3 upper = mix(vec3(0.32, 0.28, 0.56), vec3(0.43, 0.25, 0.48), colorDrift);
      return mix(lower, upper, tint) * energy;
    }
    void main() {
      vec2 uv = vec2(gl_FragCoord.x, uResolution.y - gl_FragCoord.y) / uResolution;
      float aspect = uResolution.x / uResolution.y;
      vec2 fit = vec2(max(1.0, 1.65 / aspect), max(1.0, aspect / 1.65));
      vec2 p = (uv - vec2(0.5, 0.4)) / fit + vec2(0.5, 0.4);
      vec3 light = radiance(p, 0.0) + radiance(p, 1.0);
      // Stable sub-LSB dither breaks up 8-bit contour bands without visible sparkle.
      float dither = fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(0.06711056, 0.00583715)))) - 0.5;
      gl_FragColor = vec4(clamp(light + dither / 255.0, 0.0, 1.0), 1.0);
    }
  `;

  function makeCanvasPainter(canvas) {
    const ctx = canvas.getContext('2d', { alpha: false });
    if (!ctx) return null;
    const pixels = getNoise();
    const field = (x, y) => {
      const ix = Math.floor(x), iy = Math.floor(y);
      let fx = x - ix, fy = y - iy;
      fx = fx * fx * fx * (fx * (fx * 6 - 15) + 10);
      fy = fy * fy * fy * (fy * (fy * 6 - 15) + 10);
      const a = (iy & 255) * 256, b = ((iy + 1) & 255) * 256;
      const left = ix & 255, right = (ix + 1) & 255;
      return ((pixels[a + left] * (1 - fx) + pixels[a + right] * fx) * (1 - fy)
        + (pixels[b + left] * (1 - fx) + pixels[b + right] * fx) * fy) / 255;
    };
    const smooth = (a, b, v) => { const f = Math.max(0, Math.min(1, (v - a) / (b - a))); return f * f * (3 - 2 * f); };
    const fract = n => n - Math.floor(n);
    const raster = new OffscreenCanvas(1, 1);
    const rasterContext = raster.getContext('2d', { alpha: false });
    if (!rasterContext) return null;
    let image, xs, ys, dither;
    return {
      fps: 15,
      maxDimension: 1440,
      dispose() { canvas.width = canvas.height = raster.width = raster.height = 1; },
      draw(t) {
        // Evaluate a smooth field, then reconstruct it with filtered interpolation.
        // No polygons, strip boundaries, strokes, or hard-edged primitives are used.
        const aspect = canvas.width / canvas.height;
        const scale = Math.min(1, 480 / Math.max(canvas.width, canvas.height));
        const width = Math.max(1, Math.round(canvas.width * scale));
        const height = Math.max(1, Math.round(canvas.height * scale));
        if (!image || image.width !== width || image.height !== height) {
          raster.width = width; raster.height = height;
          image = rasterContext.createImageData(width, height);
          xs = new Float64Array(width); ys = new Float64Array(height);
          dither = new Float64Array(width * height);
          const fx = Math.max(1, 1.65 / aspect), fy = Math.max(1, aspect / 1.65);
          for (let x = 0; x < width; x++) xs[x] = ((x + 0.5) / width - 0.5) / fx + 0.5;
          for (let y = 0; y < height; y++) {
            ys[y] = ((y + 0.5) / height - 0.4) / fy + 0.4;
            for (let x = 0; x < width; x++) {
              dither[y * width + x] = fract(52.9829189 * fract((x + 0.5) * 0.06711056 +
                (height - y - 0.5) * 0.00583715)) - 0.5;
              image.data[(y * width + x) * 4 + 3] = 255;
            }
          }
        }
        const data = image.data;
        const sweep = [0.22 * Math.sin(t * 0.065), 0.22 * Math.sin(t * 0.065 + 1)];
        for (let row = 0; row < height; row++) {
          const py = ys[row];
          for (let column = 0; column < width; column++) {
            const px = xs[column];
            let red = 0, green = 0, blue = 0;
            for (let k = 0; k < 2; k++) {
              const billow = field(px * 3.1 - t * 0.024, py * 2.7 + t * 0.018 + k * 19);
              const x = px + 0.085 * (billow - 0.5) + (py - 0.4) * 0.055;
              const arc = 0.64 - k * 0.22 - (0.14 + k * 0.02) * x
                + (0.09 - k * 0.015) * Math.sin(x * (8.5 - k * 1.4) - 0.9 + k * 2.7 + sweep[k])
                + 0.10 * (field(x * 7 - t * 0.055, k * 13 + t * 0.025) - 0.5);
              const depth = arc - py + 0.035 * (billow - 0.5);
              const spread = 0.12 + 0.075 * field(x * 4.6 + k * 17, t * 0.032);
              const veil = Math.exp(-(((depth - 0.07) / spread) ** 2)) * smooth(-0.15, 0.025, depth);
              const core = Math.exp(-(((depth - 0.015) / 0.048) ** 2)) * 0.13;
              const warp = x * 43 + billow * 3.5 + depth * 7;
              const wisps = 0.74 + 0.18 * field(warp, depth * 5 - t * 0.12 + k * 21)
                + 0.08 * field(warp * 1.93 + billow, depth * 9 + t * 0.09);
              const pockets = 0.32 + 0.68 * field(x * 6 - t * 0.045 + k * 11, t * 0.035);
              const energy = (veil * 0.66 + core) * wisps * pockets * (1 - k * 0.34);
              const tint = smooth(0.015, 0.21, depth + k * 0.035);
              const drift = field(x * 2.3 + k * 7, t * 0.021);
              red += ((0.19 + 0.14 * drift * 0.48) * (1 - tint) + (0.32 + 0.11 * drift) * tint) * energy;
              green += ((0.48 + 0.06 * drift * 0.48) * (1 - tint) + (0.28 - 0.03 * drift) * tint) * energy;
              blue += ((0.56 - 0.10 * drift * 0.48) * (1 - tint) + (0.56 - 0.08 * drift) * tint) * energy;
            }
            const grain = dither[row * width + column];
            const index = (row * width + column) * 4;
            data[index] = red * 255 + grain;
            data[index + 1] = green * 255 + grain;
            data[index + 2] = blue * 255 + grain;
          }
        }
        rasterContext.putImageData(image, 0, 0);
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(raster, 0, 0, canvas.width, canvas.height);
      }
    };
  }

  function makePainter(canvas) {
    const gl = canvas.getContext('webgl', { alpha: false, antialias: false,
      depth: false, stencil: false, powerPreference: 'low-power' });
    if (!gl) return null;
    const shaders = [];
    let program, buffer, texture;
    const dispose = () => {
      if (buffer) gl.deleteBuffer(buffer);
      if (texture) gl.deleteTexture(texture);
      for (const shader of shaders) gl.deleteShader(shader);
      if (program) gl.deleteProgram(program);
    };
    try {
      for (const [type, source] of [[gl.VERTEX_SHADER, vertexSource], [gl.FRAGMENT_SHADER, fragmentSource]]) {
        const shader = gl.createShader(type);
        shaders.push(shader); gl.shaderSource(shader, source); gl.compileShader(shader);
        if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(shader));
      }
      program = gl.createProgram();
      for (const shader of shaders) gl.attachShader(program, shader);
      gl.linkProgram(program);
      if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(program));
      gl.useProgram(program);
      buffer = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
      // One oversized triangle covers the viewport. Its edges are outside the sky.
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
      const attribute = gl.getAttribLocation(program, 'aPosition');
      gl.enableVertexAttribArray(attribute);
      gl.vertexAttribPointer(attribute, 2, gl.FLOAT, false, 0, 0);
      texture = gl.createTexture();
      gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, texture);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.REPEAT);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.LUMINANCE, noiseSize, noiseSize, 0, gl.LUMINANCE, gl.UNSIGNED_BYTE, getNoise());
      gl.uniform1i(gl.getUniformLocation(program, 'uNoise'), 0);
      const time = gl.getUniformLocation(program, 'uTime');
      const resolution = gl.getUniformLocation(program, 'uResolution');
      return {
        fps: 24,
        maxDimension: 1920,
        dispose,
        draw(seconds) {
          gl.viewport(0, 0, canvas.width, canvas.height);
          gl.uniform1f(time, seconds);
          gl.uniform2f(resolution, canvas.width, canvas.height);
          gl.drawArrays(gl.TRIANGLES, 0, 3);
        }
      };
    } catch (error) {
      dispose();
      console.warn('Aurora northern lights using Canvas rendering', error);
      return null;
    }
  }

  self.AuroraWallpaperPainters ||= {};
  self.AuroraWallpaperPainters['northern-lights'] = { makePainter, makeCanvasPainter };
})();
