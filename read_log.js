const fs = require('fs');
const path = 'backend/logs/combined.log';

try {
  const stats = fs.statSync(path);
  const size = stats.size;
  const bufferSize = 4000;
  const buffer = Buffer.alloc(bufferSize);
  
  const fd = fs.openSync(path, 'r');
  const pos = Math.max(0, size - bufferSize);
  fs.readSync(fd, buffer, 0, bufferSize, pos);
  fs.closeSync(fd);
  
  console.log(buffer.toString('utf8'));
} catch (e) {
  console.error(e);
}
