// Build-output packaging only. Never reads maintenance inputs or writes public/data.
import { copyFile, lstat, mkdir, readdir, rm } from "node:fs/promises";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { BASE_PATH, WORKERS_ASSETS_DIRECTORY } from "../site.config.js";

const root = fileURLToPath(new URL("../", import.meta.url));
const metadata = new Set(["_headers", "_redirects", ".assetsignore"]);

function inside(parent, child) {
  const path = relative(parent, child);
  return path === "" || (!isAbsolute(path) && path !== ".." && !path.startsWith(`..${sep}`));
}

async function filesIn(directory, prefix = "") {
  const directoryInfo = await lstat(directory);
  if (!directoryInfo.isDirectory() || directoryInfo.isSymbolicLink()) {
    throw new Error(`Build input must be a regular directory: ${directory}`);
  }
  const files = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    const name = join(prefix, entry.name);
    if (entry.isDirectory()) files.push(...await filesIn(path, name));
    else if (entry.isFile()) files.push(name);
    else throw new Error(`Unsupported build entry: ${path}`);
  }
  return files;
}

export async function prepareWorkersAssets(source, destination, basePath = BASE_PATH) {
  if (basePath !== "/" && !/^\/(?:[A-Za-z0-9_-]+\/)+$/.test(basePath)) {
    throw new Error("Base path must contain normalized directory segments, with leading and trailing slashes");
  }
  source = resolve(source);
  destination = resolve(destination);
  if (inside(source, destination) || inside(destination, source)) {
    throw new Error("Build input and Workers output must not overlap");
  }
  // Validate before removing any previous generated output.
  const files = await filesIn(source);
  if (!files.includes("index.html")) throw new Error("Build output is missing index.html");
  await mkdir(dirname(destination), { recursive: true });
  const parent = await lstat(dirname(destination));
  if (!parent.isDirectory() || parent.isSymbolicLink()) throw new Error("Unsafe output parent");
  await rm(destination, { recursive: true, force: true });
  const mount = basePath.slice(1, -1);
  for (const name of files) {
    const target = join(destination, metadata.has(name) ? name : join(mount, name));
    await mkdir(dirname(target), { recursive: true });
    await copyFile(join(source, name), target);
  }
  // At the domain root index.html is already in place. Subpath deployments
  // also need Cloudflare's fixed /index.html SPA fallback entry.
  if (mount) await copyFile(join(source, "index.html"), join(destination, "index.html"));
  return files.length + (mount ? 1 : 0);
}

if (process.argv[1] && relative(resolve(process.argv[1]), fileURLToPath(import.meta.url)) === "") {
  if (process.argv.length !== 2) throw new Error("This build-only script does not accept command-line options");
  const count = await prepareWorkersAssets(resolve(root, "dist"), resolve(root, WORKERS_ASSETS_DIRECTORY));
  console.log(`Prepared ${count} static files in ${WORKERS_ASSETS_DIRECTORY} for ${BASE_PATH}`);
}
