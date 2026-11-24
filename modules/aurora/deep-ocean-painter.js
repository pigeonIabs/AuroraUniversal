// Original wallpaper equations. Executed exclusively inside the rendering worker.
(() => {
  'use strict';
  // Distributed surface samples, extending beyond the view. Keep this JSON
  // literal readable by generate_theme_art.py so all renderers share one set.
  const beams = [
    [-0.240, 0.240, 0.066, 0.150, 1.3],
    [-0.115, 0.225, 0.043, 0.180, 4.1],
    [-0.015, 0.255, 0.061, 0.160, 0.7],
    [0.095, 0.235, 0.032, 0.205, 2.6],
    [0.190, 0.260, 0.057, 0.170, 5.2],
    [0.302, 0.230, 0.038, 0.195, 1.8],
    [0.415, 0.250, 0.068, 0.145, 4.5],
    [0.535, 0.220, 0.031, 0.190, 0.3],
    [0.635, 0.245, 0.056, 0.175, 3.7],
    [0.748, 0.255, 0.040, 0.210, 5.8],
    [0.850, 0.230, 0.064, 0.160, 2.1],
    [0.966, 0.250, 0.035, 0.195, 4.9],
    [1.070, 0.235, 0.060, 0.165, 0.9]
  ];
  const vertexSource = `
    attribute vec2 aPosition;
    void main() { gl_Position = vec4(aPosition, 0.0, 1.0); }
  `;
  const fragmentSource = `
    precision highp float;
    uniform vec2 uResolution;
    uniform float uTime;
    uniform vec4 uBeams[13];
    float shaft(vec2 p, vec4 beam, float phase) {
      // Uniform beam parameters are evaluated once per frame in the worker,
      // instead of repeating their time-only trigonometry for every pixel.
      float spread = beam.z * (0.65 + p.y * 0.72);
      float q = (p.x - beam.x - p.y * beam.y) / spread;
      float feather = exp(-q * q) * 0.72 + exp(-q * q * 0.18) * 0.28;
      // Traveling bands of radiance slide across each feathered cone. They
      // remain constant along straight projected rays instead of twisting.
      float striation = 0.90 + 0.13 * sin(q * 2.7 - uTime * 0.70 + phase)
        + 0.05 * sin(q * 6.1 + uTime * 0.94 + phase * 1.8);
      return feather * beam.w * striation * exp(-p.y * 2.7);
    }
    void main() {
      vec2 uv = vec2(gl_FragCoord.x, uResolution.y - gl_FragCoord.y) / uResolution;
      float aspect = uResolution.x / uResolution.y;
      vec2 fit = vec2(max(1.0, 1.77777778 / aspect), max(1.0, aspect / 1.77777778));
      vec2 p = (uv - vec2(0.38, 0.0)) / fit + vec2(0.38, 0.0);
      // Broad illumination from an unseen, continuous surface. No aperture.
      float skylight = 0.90 + 0.06 * sin(p.x * 4.3 + 0.8);
      float depth = exp(-p.y * 2.8) * skylight;
      vec3 water = mix(vec3(0.008, 0.027, 0.049), vec3(0.025, 0.115, 0.159), depth);
      float light = ${beams.map((beam, index) => `shaft(p, uBeams[${index}], ${beam[4].toFixed(3)})`).join('\n        + ')};
      // Blue-green scattering dims with depth across the whole scene.
      vec3 radiance = light * vec3(0.28, 0.62, 0.68)
        + skylight * exp(-p.y * 5.0) * vec3(0.018, 0.047, 0.052);
      vec3 color = 1.0 - (1.0 - water) * (1.0 - radiance);
      // Stable dither prevents contour bands without animated grain or sparkle.
      float grain = fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(0.06711056, 0.00583715)))) - 0.5;
      gl_FragColor = vec4(clamp(color + grain / 255.0, 0.0, 1.0), 1.0);
    }
  `;

  function makePainter(canvas) {
    const gl = canvas.getContext('webgl', { alpha: false, antialias: false,
      depth: false, stencil: false, powerPreference: 'low-power' });
    if (!gl) return null;
    const shaders = [];
    let program, buffer;
    const dispose = () => {
      if (buffer) gl.deleteBuffer(buffer);
      for (const shader of shaders) gl.deleteShader(shader);
      if (program) gl.deleteProgram(program);
    };
    try {
      for (const [type, source] of [[gl.VERTEX_SHADER, vertexSource], [gl.FRAGMENT_SHADER, fragmentSource]]) {
        const shader = gl.createShader(type);
        shaders.push(shader);
        gl.shaderSource(shader, source);
        gl.compileShader(shader);
        if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(shader));
      }
      program = gl.createProgram();
      for (const shader of shaders) gl.attachShader(program, shader);
      gl.linkProgram(program);
      if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(program));
      gl.useProgram(program);
      buffer = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
      const attribute = gl.getAttribLocation(program, 'aPosition');
      gl.enableVertexAttribArray(attribute);
      gl.vertexAttribPointer(attribute, 2, gl.FLOAT, false, 0, 0);
      const time = gl.getUniformLocation(program, 'uTime');
      const resolution = gl.getUniformLocation(program, 'uResolution');
      const beamUniform = gl.getUniformLocation(program, 'uBeams[0]');
      const beamValues = new Float32Array(beams.length * 4);
      return {
        dispose,
        draw(seconds) {
          for (let i = 0; i < beams.length; i++) {
            const [origin, slope, width, power, phase] = beams[i];
            beamValues[i * 4] = origin + 0.014 * Math.sin(seconds * 0.43 + phase)
              + 0.006 * Math.sin(seconds * 0.71 + phase * 1.7);
            beamValues[i * 4 + 1] = slope + 0.040 * Math.sin(seconds * 0.27 + phase)
              + 0.018 * Math.sin(seconds * 0.49 + phase * 2.1);
            beamValues[i * 4 + 2] = width * (1 + 0.18 * Math.sin(seconds * 0.46 + phase * 1.3));
            beamValues[i * 4 + 3] = power * (0.86 + 0.19 * Math.sin(seconds * 0.51 + phase)
              + 0.07 * Math.sin(seconds * 0.89 + phase * 2.3));
          }
          gl.viewport(0, 0, canvas.width, canvas.height);
          gl.uniform4fv(beamUniform, beamValues);
          gl.uniform1f(time, seconds);
          gl.uniform2f(resolution, canvas.width, canvas.height);
          gl.drawArrays(gl.TRIANGLES, 0, 3);
        }
      };
    } catch (_) {
      dispose();
      // Keep the deterministic startup frame if the graphics driver rejects GLSL.
      return null;
    }
  }

  // Keep the rays animated when WebGL is unavailable. Evaluate the same field
  // with compact cross-shaft lookup tables, then reconstruct it smoothly.
  function makeCanvasPainter(canvas) {
    const ctx = canvas.getContext('2d', { alpha: false });
    const raster = new OffscreenCanvas(1, 1);
    const rasterContext = raster.getContext('2d', { alpha: false });
    if (!ctx || !rasterContext) return null;
    const table = new Float32Array(1025);
    let image, xs, ys, attenuation, base, response, energy;
    const fract = value => value - Math.floor(value);
    return {
      fps: 15,
      draw(t) {
        const scale = Math.min(1, 400 / Math.max(canvas.width, canvas.height));
        const width = Math.max(1, Math.round(canvas.width * scale));
        const height = Math.max(1, Math.round(canvas.height * scale));
        if (!image || image.width !== width || image.height !== height) {
          raster.width = width; raster.height = height;
          image = rasterContext.createImageData(width, height);
          xs = new Float32Array(width); ys = new Float32Array(height);
          attenuation = new Float32Array(height);
          base = new Float32Array(width * height * 3);
          response = new Float32Array(base.length);
          energy = new Float32Array(width * height);
          const aspect = canvas.width / canvas.height;
          for (let x = 0; x < width; x++) xs[x] = ((x + .5) / width - .38) / Math.max(1, (16 / 9) / aspect) + .38;
          for (let y = 0; y < height; y++) {
            const py = ((y + .5) / height) / Math.max(1, aspect / (16 / 9));
            ys[y] = py; attenuation[y] = Math.exp(-py * 2.7);
            for (let x = 0; x < width; x++) {
              const skylight = .90 + .06 * Math.sin(xs[x] * 4.3 + .8);
              const depth = Math.exp(-py * 2.8) * skylight;
              const water = [.008 + .017 * depth, .027 + .088 * depth, .049 + .110 * depth];
              const glow = skylight * Math.exp(-py * 5);
              const dither = (fract(52.9829189 * fract((x + .5) * .06711056 + (height - y - .5) * .00583715)) - .5) / 255;
              const index = (y * width + x) * 3;
              for (let c = 0; c < 3; c++) {
                base[index + c] = 1 - (1 - water[c]) * (1 - glow * [.018,.047,.052][c]) + dither;
                response[index + c] = (1 - water[c]) * [.28,.62,.68][c];
              }
            }
          }
        }
        energy.fill(0);
        for (const [origin, slope, breadth, power, phase] of beams) {
          const sweep = .014*Math.sin(t*.43+phase) + .006*Math.sin(t*.71+phase*1.7);
          const angle = slope + .040*Math.sin(t*.27+phase) + .018*Math.sin(t*.49+phase*2.1);
          const focus = 1 + .18*Math.sin(t*.46+phase*1.3);
          const illumination = .86 + .19*Math.sin(t*.51+phase) + .07*Math.sin(t*.89+phase*2.3);
          for (let i = 0; i < table.length; i++) {
            const q = i / 1024 * 14 - 7;
            const feather = Math.exp(-q*q)*.72 + Math.exp(-q*q*.18)*.28;
            const striation = .90 + .13*Math.sin(q*2.7-t*.70+phase) + .05*Math.sin(q*6.1+t*.94+phase*1.8);
            table[i] = feather * striation * illumination * power;
          }
          for (let y = 0; y < height; y++) {
            const center = origin + sweep + ys[y] * angle;
            const inverse = (1024 / 14) / (breadth * focus * (.65 + ys[y] * .72));
            const row = y * width;
            for (let x = 0; x < width; x++) {
              const q = (xs[x] - center) * inverse + 512;
              if (q < 0 || q >= 1024) continue;
              const i = Math.floor(q), f = q - i;
              energy[row + x] += (table[i] * (1 - f) + table[i + 1] * f) * attenuation[y];
            }
          }
        }
        for (let i = 0; i < energy.length; i++) {
          for (let c = 0; c < 3; c++) image.data[i * 4 + c] = (base[i * 3 + c] + response[i * 3 + c] * energy[i]) * 255;
          image.data[i * 4 + 3] = 255;
        }
        rasterContext.putImageData(image, 0, 0);
        ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(raster, 0, 0, canvas.width, canvas.height);
      },
      dispose() { canvas.width = canvas.height = raster.width = raster.height = 1; }
    };
  }

  function makeLifePainter(canvas) {
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    let seed = 73619;
    const random = () => {
      seed ^= seed << 13; seed ^= seed >>> 17; seed ^= seed << 5;
      return (seed >>> 0) / 4294967296;
    };
    const clamp = value => Math.max(0, Math.min(1, value));
    const smooth = (a, b, value) => {
      const p = clamp((value - a) / (b - a));
      return p * p * (3 - 2 * p);
    };
    const particles = Array.from({ length: 56 }, (_, i) => ({
      x: random(), y: random(), phase: random() * Math.PI * 2,
      depth: random(), speed: 0.002 + random() * 0.003,
      radius: 0.45 + random() * (i < 14 ? 1.25 : 0.55), bubble: i < 14
    }));
    return {
      draw(seconds) {
        const width = canvas.width, height = canvas.height;
        ctx.clearRect(0, 0, width, height);
        const scale = Math.min(width / 1600, height / 900);
        for (const p of particles) {
          const speed = p.speed * (p.bubble ? 1.5 : 0.32);
          const y = ((p.y - seconds * speed) % 1 + 1) % 1;
          const x = p.x + Math.sin(seconds * 0.09 + p.phase) * 0.007
            + Math.sin(y * 8 + p.phase) * 0.004;
          const quiet = smooth(0.18, 0.31, x) * (1 - smooth(0.69, 0.82, x))
            * smooth(0.14, 0.29, y) * (1 - smooth(0.78, 0.92, y));
          const edge = smooth(0, 0.09, y) * (1 - smooth(0.91, 1, y));
          const illumination = 0.45 + 0.55 * Math.exp(-y * 2.4);
          const alpha = (p.bubble ? 0.19 : 0.10) * (0.4 + p.depth * 0.6)
            * edge * illumination * (1 - quiet * 0.88);
          const radius = p.radius * scale;
          ctx.save();
          ctx.translate(x * width, y * height);
          if (p.bubble) {
            // Small transparent rims with a broken upper highlight, not beads.
            ctx.strokeStyle = `rgba(125,181,194,${alpha * 0.45})`;
            ctx.lineWidth = Math.max(0.25, 0.45 * scale);
            ctx.beginPath(); ctx.arc(0, 0, radius, 0, Math.PI * 2); ctx.stroke();
            ctx.strokeStyle = `rgba(165,207,213,${alpha})`;
            ctx.beginPath(); ctx.arc(0, 0, radius, Math.PI * 1.08, Math.PI * 1.66); ctx.stroke();
          } else {
            ctx.fillStyle = `rgba(123,175,187,${alpha})`;
            ctx.beginPath(); ctx.ellipse(0, 0, radius * 0.65, radius, p.phase, 0, Math.PI * 2); ctx.fill();
          }
          ctx.restore();
        }
      },
      dispose() { canvas.width = canvas.height = 1; }
    };
  }

  self.AuroraWallpaperPainters ||= {};
  self.AuroraWallpaperPainters['deep-ocean'] = { makePainter, makeCanvasPainter, makeLifePainter };
})();
