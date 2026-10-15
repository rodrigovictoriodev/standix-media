const { mkdir, readFile, writeFile } = require("node:fs/promises");
const { join, resolve } = require("node:path");
const sharp = require("sharp");
const projectRoot = resolve(__dirname, "..");
const publicDirectory = join(projectRoot, "apps/web/public");
const sourcePath = join(publicDirectory, "branding/logo-source.png");
const iconSizes = [16, 32, 48, 64, 128, 192, 256, 512];
const appleTouchIconSize = 180;

function createIco(pngImages: { size: number; data: Buffer }[]) {
  const header = Buffer.alloc(6 + pngImages.length * 16);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(pngImages.length, 4);

  let dataOffset = header.length;
  pngImages.forEach(({ size, data }, index) => {
    const entryOffset = 6 + index * 16;
    header.writeUInt8(size === 256 ? 0 : size, entryOffset);
    header.writeUInt8(size === 256 ? 0 : size, entryOffset + 1);
    header.writeUInt8(0, entryOffset + 2);
    header.writeUInt8(0, entryOffset + 3);
    header.writeUInt16LE(1, entryOffset + 4);
    header.writeUInt16LE(32, entryOffset + 6);
    header.writeUInt32LE(data.length, entryOffset + 8);
    header.writeUInt32LE(dataOffset, entryOffset + 12);
    dataOffset += data.length;
  });

  return Buffer.concat([header, ...pngImages.map(({ data }) => data)]);
}

async function main() {
  const source = await readFile(sourcePath);
  const metadata = await sharp(source).metadata();
  if (!metadata.width || !metadata.height) {
    throw new Error(`Unable to read image dimensions from ${sourcePath}`);
  }

  await mkdir(publicDirectory, { recursive: true });
  const pngs = new Map<number, Buffer>();

  for (const size of iconSizes) {
    const output = await sharp(source)
      .resize(size, size, {
        fit: "contain",
        background: { r: 0, g: 0, b: 0, alpha: 0 },
        withoutEnlargement: false,
      })
      .png()
      .toBuffer();
    pngs.set(size, output);
    await writeFile(join(publicDirectory, `icon-${size}.png`), output);
    console.log(`Generated icon-${size}.png`);
  }

  const appleIcon = await sharp(source)
    .resize(appleTouchIconSize, appleTouchIconSize, {
      fit: "contain",
      background: { r: 0, g: 0, b: 0, alpha: 0 },
      withoutEnlargement: false,
    })
    .png()
    .toBuffer();
  await writeFile(join(publicDirectory, "apple-touch-icon.png"), appleIcon);
  console.log("Generated apple-touch-icon.png");

  const favicon = createIco(
    [16, 32, 48].map((size) => ({ size, data: pngs.get(size)! })),
  );
  await writeFile(join(publicDirectory, "favicon.ico"), favicon);
  console.log("Generated favicon.ico");
}

main().catch((error: unknown) => {
  console.error("Failed to generate branding assets:", error);
  process.exitCode = 1;
});
