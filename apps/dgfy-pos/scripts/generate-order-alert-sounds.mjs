import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const outputDirectory = path.resolve(scriptDirectory, '../public/sounds/order-alerts');
const sampleRate = 22_050;
const amplitude = 0.16;

const sounds = [
  { fileName: 'soft-chime.wav', notes: [[660, 0, 0.28], [880, 0.08, 0.28]] },
  { fileName: 'gentle-bell.wav', notes: [[523.25, 0, 0.42], [783.99, 0.06, 0.36], [1046.5, 0.12, 0.3]] },
  { fileName: 'bright-ping.wav', notes: [[1174.66, 0, 0.22], [1567.98, 0.04, 0.18]] },
  { fileName: 'two-note-ding.wav', notes: [[587.33, 0, 0.24], [880, 0.13, 0.26]] },
  { fileName: 'calm-notification.wav', notes: [[392, 0, 0.46], [493.88, 0.12, 0.42], [587.33, 0.24, 0.36]] },
  { fileName: 'short-alert.wav', notes: [[740, 0, 0.18], [740, 0.13, 0.18]] }
];

const writeAscii = (buffer, offset, value) => buffer.write(value, offset, 'ascii');

const envelope = (position, duration) => {
  const attack = Math.min(0.018, duration * 0.12);
  const release = Math.min(0.16, duration * 0.42);
  if (position < attack) return position / attack;
  if (position > duration - release) return Math.max(0, (duration - position) / release);
  return 1;
};

const createWav = (notes) => {
  const duration = Math.max(...notes.map(([, start, length]) => start + length)) + 0.04;
  const sampleCount = Math.ceil(duration * sampleRate);
  const dataSize = sampleCount * 2;
  const buffer = Buffer.alloc(44 + dataSize);

  writeAscii(buffer, 0, 'RIFF');
  buffer.writeUInt32LE(36 + dataSize, 4);
  writeAscii(buffer, 8, 'WAVE');
  writeAscii(buffer, 12, 'fmt ');
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(1, 22);
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(sampleRate * 2, 28);
  buffer.writeUInt16LE(2, 32);
  buffer.writeUInt16LE(16, 34);
  writeAscii(buffer, 36, 'data');
  buffer.writeUInt32LE(dataSize, 40);

  for (let index = 0; index < sampleCount; index += 1) {
    const time = index / sampleRate;
    let sample = 0;
    for (const [frequency, start, length] of notes) {
      const position = time - start;
      if (position < 0 || position > length) continue;
      const harmonic = 0.72 * Math.sin(2 * Math.PI * frequency * position)
        + 0.2 * Math.sin(2 * Math.PI * frequency * 2 * position)
        + 0.08 * Math.sin(2 * Math.PI * frequency * 3 * position);
      sample += harmonic * envelope(position, length);
    }
    const normalized = Math.max(-1, Math.min(1, sample * amplitude));
    buffer.writeInt16LE(Math.round(normalized * 32_767), 44 + index * 2);
  }

  return buffer;
};

fs.mkdirSync(outputDirectory, { recursive: true });
for (const sound of sounds) {
  fs.writeFileSync(path.join(outputDirectory, sound.fileName), createWav(sound.notes));
}

console.log(`Generated ${sounds.length} order alert sounds in ${outputDirectory}`);
