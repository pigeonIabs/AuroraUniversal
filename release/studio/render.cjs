// Edit actual browser recordings. Website pixels always fill the frame.
const { readFile, writeFile, readdir, mkdir } = require('node:fs/promises');
const { resolve, extname, relative, sep } = require('node:path');
const { spawn } = require('node:child_process');
const { createServer } = require('node:http');
const score = require('./score.cjs');

const root = resolve(__dirname, '../..');
const media = resolve(root, 'release/media');
const work = resolve(root, 'work/live-release-edit');

function ffmpeg(args) {
  return new Promise((done, reject) => {
    const process = spawn('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', ...args], { windowsHide: true, stdio: ['ignore', 'ignore', 'pipe'] });
    let error = '';
    process.stderr.on('data', chunk => error += chunk);
    process.once('error', reject);
    process.once('close', code => code === 0 ? done() : reject(new Error(error || `Encoding exited ${code}`)));
  });
}

// Smooth camera movement follows the locations of actual recorded controls.
function camera(take) {
  const duration = take.end - take.start;
  const model = take.events.find(event => event.action === 'Native model menu');
  const quick = take.events.find(event => event.action === 'Aurora quick settings');
  const ease = (start, length) => {
    const t = `min(1,max(0,(on/30-${start})/${length}))`;
    return `(${t}*${t}*(3-2*${t}))`;
  };
  const modelIn = ease(model.time - take.start - 1.2, 1.2);
  const settingsIn = ease(quick.time - take.start - 1.5, 1.5);
  const out = ease(duration - 2.4, 2.4);
  const zoom = `1+(0.08*${modelIn}+0.07*${settingsIn})*(1-${out})`;
  const anchorX = model.point.x / 1920;
  const anchorY = model.point.y / 1080;
  const x = `(iw-iw/zoom)*(${anchorX}+(0.98-${anchorX})*${settingsIn})`;
  const y = `(ih-ih/zoom)*(${anchorY}+(0.98-${anchorY})*${settingsIn})`;
  return `fps=30,scale=2560:1440:flags=lanczos,zoompan=z='${zoom}':x='${x}':y='${y}':d=1:s=1920x1080:fps=30,setsar=1`;
}

async function render() {
  await mkdir(work, { recursive: true });
  const capture = JSON.parse(await readFile(resolve(root, 'work/live-release-capture.json'), 'utf8'));
  const manifest = JSON.parse(await readFile(resolve(root, 'manifest.json'), 'utf8'));
  if (!capture.addon.active || capture.addon.version !== manifest.version || capture.promptsSubmitted || capture.takes.some(take => !take.signedOut)) {
    throw new Error('The capture does not match this release or the signed-out requirement');
  }
  const clips = [];
  for (const take of capture.takes) {
    const path = resolve(work, `${take.name}.mp4`);
    await ffmpeg(['-ss', String(take.start), '-i', take.video, '-t', String(take.end - take.start), '-vf', camera(take), '-an', '-c:v', 'libx264', '-preset', 'slow', '-crf', '17', '-pix_fmt', 'yuv420p', path]);
    clips.push(path);
    console.log(`Edited the live ${take.name} recording`);
  }
  const transition = .65;
  const offset = capture.takes[0].end - capture.takes[0].start - transition;
  const duration = capture.takes.reduce((total, take) => total + take.end - take.start, 0) - transition;
  const audio = resolve(work, 'score.wav');
  await score(audio, duration);
  const filename = `aurora-universal-${manifest.version}.mp4`;
  await ffmpeg(['-i', clips[0], '-i', clips[1], '-i', audio, '-filter_complex', `[0:v][1:v]xfade=transition=fade:duration=${transition}:offset=${offset},format=yuv420p[v]`, '-map', '[v]', '-map', '2:a', '-c:v', 'libx264', '-preset', 'slow', '-crf', '17', '-c:a', 'aac', '-b:a', '192k', '-t', String(duration), '-movflags', '+faststart', resolve(media, filename)]);
  for (const name of await readdir(media)) {
    if (!name.endsWith('.png') || name.endsWith('-social.png')) continue;
    await ffmpeg(['-i', resolve(media, name), '-vf', 'scale=1920:1080:flags=lanczos', '-c:v', 'libwebp', '-quality', '93', resolve(media, name.replace('.png', '.webp'))]);
  }
  await ffmpeg(['-i', resolve(media, 'aurora-universal-cover.png'), '-vf', 'scale=1200:675:flags=lanczos,crop=1200:630:0:22', resolve(media, 'aurora-universal-social.png')]);
  await writeFile(resolve(media, 'capture-details.json'), JSON.stringify({
    extension: 'Aurora Universal', version: manifest.version, capturedAt: capture.capturedAt,
    sites: capture.takes.map(take => ({ website: take.url, signedOut: true, viewport: take.viewport })),
    promptsSubmitted: false, personalProfileUsed: false, reconstructedInterface: false,
    video: { file: filename, width: 1920, height: 1080, framesPerSecond: 30, durationSeconds: duration },
    editing: 'Camera movement, crossfade, cursor emphasis, and original ambient audio. Native website geometry is unchanged.'
  }, null, 2) + '\n');
  console.log(`Exported ${duration.toFixed(1)} seconds of actual signed-out website footage`);
}

async function preview() {
  const types = {'.html':'text/html','.css':'text/css','.js':'text/javascript','.png':'image/png','.webp':'image/webp','.mp4':'video/mp4','.woff2':'font/woff2'};
  const server = createServer(async (request, response) => {
    try {
      const file = resolve(root, '.' + decodeURIComponent(new URL(request.url, 'http://localhost').pathname));
      const rel = relative(root, file);
      if (rel.startsWith('..') || !['release', 'assets'].includes(rel.split(sep)[0])) return response.writeHead(404).end();
      const data = await readFile(file);
      response.writeHead(200, {'Content-Type': types[extname(file)] || 'application/octet-stream','Content-Length':data.length,'Cache-Control':'no-store'});
      response.end(data);
    } catch { response.writeHead(404).end(); }
  });
  server.listen(4317, '127.0.0.1', () => console.log('http://127.0.0.1:4317/release/index.html'));
}

(process.argv.includes('--preview') ? preview() : render()).catch(error => { console.error(error); process.exitCode = 1; });
