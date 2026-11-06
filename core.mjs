export const MAX_BYTES = 195000;
export const MIN_SUGGESTED_BYTES = 60000;

export function outputName(name, index) {
  const stem = name.replace(/\.[^.]+$/, '').normalize('NFKD').replace(/[^a-zA-Z0-9_-]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 64) || 'photo';
  return `${String(index + 1).padStart(3, '0')}_${stem}_hikvision.jpg`;
}

export function dimensions(preset, width, height) {
  if (preset !== 'original') return preset.split('x').map(Number);
  const factor = Math.min(1, 1600 / Math.max(width, height));
  return [Math.max(1, Math.round(width * factor)), Math.max(1, Math.round(height * factor))];
}

export function cropTransform(width, height, outWidth, outHeight, zoom, cx, cy) {
  const scale = Math.max(outWidth / width, outHeight / height) * zoom;
  const x = Math.max(outWidth - width * scale, Math.min(0, outWidth / 2 - cx * width * scale));
  const y = Math.max(outHeight - height * scale, Math.min(0, outHeight / 2 - cy * height * scale));
  return {scale, x, y, cx: (outWidth / 2 - x) / (width * scale), cy: (outHeight / 2 - y) / (height * scale)};
}

export async function compressJPEG(canvas) {
  const encode = quality => new Promise((resolve, reject) => canvas.toBlob(blob => blob && blob.type === 'image/jpeg' ? resolve(blob) : reject(new Error('Your browser could not create a JPEG. Try a current browser.')), 'image/jpeg', quality));
  let best = await encode(.98);
  if (best.size < MIN_SUGGESTED_BYTES) {
    const highest = await encode(1);
    if (highest.size < MAX_BYTES) return highest;
  } else if (best.size < MAX_BYTES) return best;
  let low = .05, high = 1;
  best = await encode(low);
  if (best.size >= MAX_BYTES) throw new Error('This photo is still too large. Choose a smaller output size.');
  for (let i = 0; i < 10; i++) {
    const quality = (low + high) / 2;
    const blob = await encode(quality);
    if (blob.size < MAX_BYTES) { best = blob; low = quality; } else { high = quality; }
  }
  return best;
}

const crcTable = Array.from({length:256}, (_, n) => {
  for (let i=0;i<8;i++) n = n & 1 ? 0xedb88320 ^ (n >>> 1) : n >>> 1;
  return n >>> 0;
});
export function crc32(bytes) {
  let crc = 0xffffffff;
  for (const b of bytes) crc = crcTable[(crc ^ b) & 255] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

// Standard, uncompressed ZIP records. JPEGs are already compressed.
export async function makeZip(files) {
  const local = [], central = [];
  let offset = 0, centralSize = 0;
  const now = new Date();
  const time = (now.getHours() << 11) | (now.getMinutes() << 5) | (now.getSeconds() >> 1);
  const date = ((Math.max(1980, now.getFullYear()) - 1980) << 9) | ((now.getMonth()+1) << 5) | now.getDate();
  for (const file of files) {
    const name = new TextEncoder().encode(file.name);
    const bytes = new Uint8Array(await file.blob.arrayBuffer());
    const crc = crc32(bytes);
    const header = new Uint8Array(30 + name.length), view = new DataView(header.buffer);
    view.setUint32(0,0x04034b50,true); view.setUint16(4,20,true); view.setUint16(6,0x0800,true);
    view.setUint16(10,time,true); view.setUint16(12,date,true); view.setUint32(14,crc,true);
    view.setUint32(18,bytes.length,true); view.setUint32(22,bytes.length,true); view.setUint16(26,name.length,true);
    header.set(name,30); local.push(header, bytes);
    const entry = new Uint8Array(46 + name.length), cv = new DataView(entry.buffer);
    cv.setUint32(0,0x02014b50,true);cv.setUint16(4,20,true);cv.setUint16(6,20,true);cv.setUint16(8,0x0800,true);
    cv.setUint16(12,time,true);cv.setUint16(14,date,true);cv.setUint32(16,crc,true);
    cv.setUint32(20,bytes.length,true);cv.setUint32(24,bytes.length,true);cv.setUint16(28,name.length,true);
    cv.setUint32(42,offset,true);entry.set(name,46);central.push(entry);centralSize += entry.length;offset += header.length + bytes.length;
  }
  const end = new Uint8Array(22), ev = new DataView(end.buffer);
  ev.setUint32(0,0x06054b50,true);ev.setUint16(8,files.length,true);ev.setUint16(10,files.length,true);
  ev.setUint32(12,centralSize,true);ev.setUint32(16,offset,true);
  return new Blob([...local,...central,end],{type:'application/zip'});
}
