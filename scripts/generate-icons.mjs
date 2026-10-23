// Rasterize the existing SVG mark. No network, new artwork or image service.
// Uses the Chromium already installed for Playwright; run npm run icons:generate.
import { readFile, mkdir, writeFile } from "node:fs/promises";
import { chromium } from "@playwright/test";

const root = new URL("../", import.meta.url);
const svg = await readFile(new URL("src/app/icon.svg", root), "utf8");
const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage();
  await mkdir(new URL("public/icons/", root), { recursive: true });
  for (const [path, size, inset] of [
    ["public/icons/icon-192.png", 192, 0],
    ["public/icons/icon-512.png", 512, 0],
    ["public/icons/icon-maskable-512.png", 512, 0.1],
    ["src/app/apple-icon.png", 180, 0],
  ]) {
    const png = await page.evaluate(
      async ({ svg, size, inset }) => {
        const image = new Image();
        image.src = `data:image/svg+xml;base64,${btoa(svg)}`;
        await image.decode();
        const canvas = document.createElement("canvas");
        canvas.width = canvas.height = size;
        const context = canvas.getContext("2d");
        if (!context) throw new Error("Canvas unavailable");
        context.fillStyle = "#296447";
        context.fillRect(0, 0, size, size);
        context.drawImage(
          image,
          size * inset,
          size * inset,
          size * (1 - 2 * inset),
          size * (1 - 2 * inset),
        );
        return canvas.toDataURL("image/png").split(",")[1];
      },
      { svg, size, inset },
    );
    await writeFile(new URL(path, root), Buffer.from(png, "base64"));
    console.log(`${path} (${size}×${size})`);
  }
} finally {
  await browser.close();
}
