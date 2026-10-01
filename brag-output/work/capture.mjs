// Frame-accurate capture of video.html.
//   node capture.mjs stills 1.2,3.4,...   -> stills/t_<time>.jpg
//   node capture.mjs video                -> silent.mp4 (piped to ffmpeg)
import { createRequire } from "node:module";
import { spawn } from "node:child_process";
import { pathToFileURL, fileURLToPath } from "node:url";
import path from "node:path";
import fs from "node:fs";

const here = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(process.env.PP_DIR ? path.join(process.env.PP_DIR, "x.js") : import.meta.url);
const puppeteer = require("puppeteer-core");

const FPS = 30;
const [mode, arg] = process.argv.slice(2);
const browser = await puppeteer.launch({
  executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe",
  headless: true,
  args: ["--force-color-profile=srgb", "--hide-scrollbars", "--font-render-hinting=none"],
  defaultViewport: { width: 1920, height: 1080, deviceScaleFactor: 1 },
});
const page = await browser.newPage();
page.on("pageerror", (e) => console.error("PAGE ERROR", e.message));
await page.goto(pathToFileURL(path.join(here, "video.html")).href + "#cap", { waitUntil: "networkidle0" });
await page.evaluate(() => window.ready);

if (mode === "stills") {
  for (const s of arg.split(",")) {
    const t = parseFloat(s);
    await page.evaluate((t) => window.render(t), t);
    await page.screenshot({ path: path.join(here, "stills", `t_${t.toFixed(2).padStart(5, "0")}.jpg`), type: "jpeg", quality: 82 });
  }
} else {
  const total = Math.round((await page.evaluate(() => window.DURATION)) * FPS);
  const ff = spawn("ffmpeg", ["-y", "-v", "error", "-f", "image2pipe", "-framerate", String(FPS), "-c:v", "png", "-i", "-",
    "-c:v", "libx264", "-preset", "slow", "-crf", "14", "-pix_fmt", "yuv420p", "-r", String(FPS), path.join(here, "silent.mp4")],
    { stdio: ["pipe", "inherit", "inherit"] });
  for (let i = 0; i < total; i++) {
    await page.evaluate((t) => window.render(t), i / FPS);
    const buf = await page.screenshot({ type: "png", optimizeForSpeed: true });
    if (!ff.stdin.write(buf)) await new Promise((r) => ff.stdin.once("drain", r));
    if (i % 60 === 0) console.log(`frame ${i}/${total}`);
  }
  ff.stdin.end();
  await new Promise((r) => ff.on("close", r));
}
await browser.close();
