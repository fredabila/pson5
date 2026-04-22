import { cpSync, existsSync, mkdirSync, rmSync, copyFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const publicDir = path.join(__dirname, "public");
const outDir = path.join(__dirname, "dist");
const requiredFiles = ["index.html", "styles.css", "app.js", "site-data.js"];

for (const file of requiredFiles) {
  if (!existsSync(path.join(publicDir, file))) {
    throw new Error(`Missing ${file} in docs public directory.`);
  }
}

rmSync(outDir, { recursive: true, force: true });
mkdirSync(outDir, { recursive: true });
cpSync(publicDir, outDir, { recursive: true });
copyFileSync(path.join(outDir, "index.html"), path.join(outDir, "404.html"));

console.log("docs site built to apps/docs-site/dist");
