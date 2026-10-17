// Minimal synthetic EXIF envelope, generated in memory around a canvas JPEG.
// No photographs or metadata from a device/owner are used.
export function syntheticGpsJpeg(jpeg, photo) {
  const tiff = Buffer.alloc(190);
  tiff.write('II'); tiff.writeUInt16LE(42, 2); tiff.writeUInt32LE(8, 4);
  const entry = (at, tag, type, count, value) => {
    tiff.writeUInt16LE(tag, at); tiff.writeUInt16LE(type, at + 2);
    tiff.writeUInt32LE(count, at + 4); tiff.writeUInt32LE(value, at + 8);
  };
  tiff.writeUInt16LE(3, 8);
  entry(10, 0x112, 3, 1, 1); // orientation
  entry(22, 0x8769, 4, 1, 104);
  entry(34, 0x8825, 4, 1, 50);
  tiff.writeUInt16LE(4, 50);
  entry(52, 1, 2, 2, 78); // N
  entry(64, 2, 5, 3, 142);
  entry(76, 3, 2, 2, 69); // E
  entry(88, 4, 5, 3, 166);
  tiff.writeUInt16LE(1, 104);
  entry(106, 0x9003, 2, 20, 122);
  tiff.write(new Date(photo.captureTimeMs).toISOString().slice(0, 19).replaceAll('-', ':').replace('T', ' '), 122);
  const rational = (at, coordinate) => {
    const degrees = Math.floor(coordinate);
    const minutes = Math.floor((coordinate - degrees) * 60);
    const seconds = ((coordinate - degrees) * 60 - minutes) * 60;
    for (const [i, [n, d]] of [[degrees, 1], [minutes, 1], [Math.round(seconds * 1e7), 1e7]].entries()) {
      tiff.writeUInt32LE(n, at + i * 8); tiff.writeUInt32LE(d, at + i * 8 + 4);
    }
  };
  rational(142, photo.coordinates.latitude); rational(166, photo.coordinates.longitude);
  const header = Buffer.from([0xff, 0xe1, 0, 0, 69, 120, 105, 102, 0, 0]);
  header.writeUInt16BE(tiff.length + 8, 2);
  return Buffer.concat([jpeg.subarray(0, 2), header, tiff, jpeg.subarray(2)]);
}
