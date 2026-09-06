/**
 * Synthesizes just enough of a JPEG/EXIF byte structure for `parseJpegOrientation` to read --
 * not a real decodable photo (jsdom has no JPEG decoder to exercise anyway; that's what
 * `createImageBitmap` is mocked for in these tests). Structure: SOI, one APP1 segment holding
 * a minimal little-endian TIFF/IFD0 with a single Orientation (0x0112) entry, then EOI.
 */
export function buildJpegWithExifOrientation(orientationValue) {
  const bytes = [];
  const push16 = (value) => bytes.push((value >> 8) & 0xff, value & 0xff);
  const pushAll = (values) => values.forEach((value) => bytes.push(value));

  const tiff = [];
  const tiff16le = (value) => tiff.push(value & 0xff, (value >> 8) & 0xff);
  const tiff32le = (value) =>
    tiff.push(value & 0xff, (value >> 8) & 0xff, (value >> 16) & 0xff, (value >> 24) & 0xff);

  tiff16le(0x4949); // 'II' -- little-endian byte order
  tiff16le(42); // TIFF magic number
  tiff32le(8); // offset to IFD0, relative to the TIFF header start
  tiff16le(1); // IFD0 entry count
  tiff16le(0x0112); // tag: Orientation
  tiff16le(3); // type: SHORT
  tiff32le(1); // count: 1
  tiff16le(orientationValue); // value (first 2 bytes of the 4-byte value/offset field)
  tiff16le(0); // padding (remaining 2 bytes of the value/offset field)
  tiff32le(0); // next IFD offset (none)

  const exifHeader = [0x45, 0x78, 0x69, 0x66, 0x00, 0x00]; // "Exif\0\0"
  const app1Body = [...exifHeader, ...tiff];
  const app1Length = app1Body.length + 2; // includes the length field itself

  push16(0xffd8); // SOI
  push16(0xffe1); // APP1 marker
  push16(app1Length);
  pushAll(app1Body);
  push16(0xffd9); // EOI

  return new Uint8Array(bytes).buffer;
}
