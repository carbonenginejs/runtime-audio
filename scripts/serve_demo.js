// Tiny static server for the audio demo. Serves the ORG ROOT (one level up
// from runtime-audio) so the demo's import map can reach sibling package
// sources and the git-ignored .tmp library artifact. Local use only.
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";

const orgRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
// EVE resource cache (cache-first; CDN fallback populates it so the CDN is
// never asked twice). Read-only game data - never modified, only mirrored.
const resourceCache = "E:/ccpwgl2-server/public/cache";
const port = Number(process.env.PORT) || 8787;
const types = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".gz": "application/gzip",
  ".map": "application/json; charset=utf-8",
  ".otf": "font/otf"
};

// Lazy library load for the embedded-wem route (same artifact the demo uses):
// the machine-local full artifact when present, else the committed demo copy.
let libraryPromise = null;
function loadLibrary() {
  return libraryPromise ??= fs.promises
    .readFile(path.join(orgRoot, ".tmp", "ccp_3435006_audio_v1.json"), "utf8")
    .catch(() => fs.promises.readFile(path.join(orgRoot, "runtime-audio", "demo", "audio-library.json"), "utf8"))
    .then(JSON.parse);
}

async function ensureCached(storagePath) {
  const file = path.normalize(path.join(resourceCache, storagePath));
  if (!file.startsWith(path.normalize(resourceCache))) return null;
  if (!fs.existsSync(file)) {
    const remote = await fetch(`https://resources.eveonline.com/${storagePath}`);
    if (!remote.ok) throw new Error(String(remote.status));
    const bytes = Buffer.from(await remote.arrayBuffer());
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, bytes);
  }
  return file;
}

http.createServer(async (request, response) => {
  const url = decodeURIComponent(new URL(request.url, "http://localhost").pathname);
  // Local cross-origin use: ccpwgl dev pages (other ports) consume the audio
  // library, engine modules, and wem routes from this server.
  response.setHeader("access-control-allow-origin", "*");
  // Dev server: never let the browser cache modules/pages - a stale bundle
  // makes freshly-built engine behavior invisible.
  response.setHeader("cache-control", "no-store");

  // /bankwem/<wemId>: slice an embedded wem out of its bank's DATA payload
  // using the library's embeddedMedia directory (bank + absolute offset).
  if (url.startsWith("/bankwem/")) {
    try {
      const library = await loadLibrary();
      const record = library.embeddedMedia?.[url.slice("/bankwem/".length)];
      const bank = record && library.banks[record.bank];
      const file = bank && await ensureCached(bank.storagePath);
      if (!file) {
        response.writeHead(404).end("not found");
        return;
      }
      const slice = Buffer.alloc(record.byteLength);
      const fd = await fs.promises.open(file, "r");
      try {
        await fd.read(slice, 0, record.byteLength, record.offset);
      } finally {
        await fd.close();
      }
      response.writeHead(200, { "content-type": "application/octet-stream" });
      response.end(slice);
    } catch {
      response.writeHead(404).end("not found");
    }
    return;
  }

  if (url.startsWith("/cache/")) {
    const storagePath = url.slice("/cache/".length);
    const file = path.normalize(path.join(resourceCache, storagePath));
    if (!file.startsWith(path.normalize(resourceCache))) {
      response.writeHead(404).end("not found");
      return;
    }
    if (!fs.existsSync(file)) {
      try {
        const remote = await fetch(`https://resources.eveonline.com/${storagePath}`);
        if (!remote.ok) throw new Error(String(remote.status));
        const bytes = Buffer.from(await remote.arrayBuffer());
        fs.mkdirSync(path.dirname(file), { recursive: true });
        fs.writeFileSync(file, bytes);
      } catch {
        response.writeHead(404).end("not found");
        return;
      }
    }
    response.writeHead(200, { "content-type": "application/octet-stream" });
    fs.createReadStream(file).pipe(response);
    return;
  }

  const file = path.normalize(path.join(orgRoot, url === "/" ? "/runtime-audio/demo/index.html" : url));
  if (!file.startsWith(orgRoot) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
    response.writeHead(404).end("not found");
    return;
  }
  response.writeHead(200, { "content-type": types[path.extname(file)] ?? "application/octet-stream" });
  fs.createReadStream(file).pipe(response);
}).listen(port, () => console.log(`audio demo: http://localhost:${port}/`));
