// Original, quiet ambient score for the live product recording.
const { writeFile } = require('node:fs/promises');

module.exports = async function score(path, duration) {
  const rate = 48000;
  const length = Math.ceil(duration * rate);
  const data = Buffer.alloc(44 + length * 4);
  data.write('RIFF'); data.writeUInt32LE(data.length - 8, 4); data.write('WAVEfmt ', 8);
  data.writeUInt32LE(16, 16); data.writeUInt16LE(1, 20); data.writeUInt16LE(2, 22);
  data.writeUInt32LE(rate, 24); data.writeUInt32LE(rate * 4, 28); data.writeUInt16LE(4, 32); data.writeUInt16LE(16, 34);
  data.write('data', 36); data.writeUInt32LE(length * 4, 40);
  const chords = [[146.832, 220, 277.183, 329.628], [130.813, 195.998, 246.942, 293.665], [110, 164.814, 220, 277.183]];
  for (let i = 0; i < length; i++) {
    const t = i / rate;
    const envelope = Math.min(1, t / 2) * Math.min(1, Math.max(0, (duration - t) / 3));
    for (let channel = 0; channel < 2; channel++) {
      let sample = 0;
      chords.forEach((chord, index) => {
        const gain = Math.exp(-(((t / duration - [.15, .5, .85][index]) / .25) ** 2));
        chord.forEach((frequency, note) => {
          const phase = t * frequency * 2 * Math.PI + channel * (.15 + note * .08);
          sample += gain * (.014 * Math.sin(phase) + .003 * Math.sin(phase * 2)) * (1 + .1 * Math.sin(t * .6 + note));
        });
      });
      data.writeInt16LE(Math.round(sample * envelope * 32767), 44 + i * 4 + channel * 2);
    }
  }
  await writeFile(path, data);
};
