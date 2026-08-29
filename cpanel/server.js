const { spawn } = require("child_process");
const { createReadStream, existsSync, statSync } = require("fs");
const { join, normalize } = require("path");
const http = require("http");
const { request } = require("http");

const root = __dirname;
const webRoot = join(root, "web");
const dataDir = process.env.TM_DATA_DIR || join(root, "data");
const apiPort = process.env.TM_API_PORT || "18080";
const port = Number(process.env.PORT || 3000);
const host = process.env.HOSTNAME || "127.0.0.1";

const env = {
  ...process.env,
  TM_HTTP_PORT: apiPort,
  PORT: apiPort,
  TM_DATABASE_URL: process.env.TM_DATABASE_URL || `sqlite://${join(dataDir, "tradermemos.db").replace(/\\/g, "/")}`,
  TM_ATTACH_DIR: process.env.TM_ATTACH_DIR || join(dataDir, "attachments"),
  TM_CORS_ORIGINS: process.env.TM_CORS_ORIGINS || "",
  TM_PUBLIC_WEB_URL: process.env.TM_PUBLIC_WEB_URL || "https://journal.ranksmedia.com",
  TM_JOBS_ENABLED: process.env.TM_JOBS_ENABLED || "false",
};

if (!env.TM_JWT_SECRET || env.TM_JWT_SECRET.length < 32) {
  console.error("TM_JWT_SECRET must be set to a strong 32+ character value.");
  process.exit(1);
}

const api = spawn(join(root, "bin", "server"), [], {
  cwd: root,
  env,
  stdio: ["ignore", "inherit", "inherit"],
});

api.on("exit", (code, signal) => {
  console.error(`TraderMemos API exited: code=${code} signal=${signal}`);
  process.exit(code || 1);
});

process.on("SIGTERM", () => api.kill("SIGTERM"));
process.on("SIGINT", () => api.kill("SIGINT"));

const mime = {
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".ico": "image/x-icon",
  ".webmanifest": "application/manifest+json",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
};

function contentType(path) {
  const ext = path.slice(path.lastIndexOf("."));
  return mime[ext] || "application/octet-stream";
}

function serveStatic(req, res) {
  const url = new URL(req.url, "http://localhost");
  let requested = normalize(decodeURIComponent(url.pathname)).replace(/^(\.\.[/\\])+/, "");
  if (requested === "/" || requested === ".") requested = "/index.html";
  let file = join(webRoot, requested);
  if (!file.startsWith(webRoot) || !existsSync(file) || !statSync(file).isFile()) {
    file = join(webRoot, "index.html");
  }
  res.setHeader("Content-Type", contentType(file));
  createReadStream(file).pipe(res);
}

function proxyApi(req, res) {
  const options = {
    hostname: "127.0.0.1",
    port: apiPort,
    path: req.url,
    method: req.method,
    headers: req.headers,
  };
  const upstream = request(options, (apiRes) => {
    res.writeHead(apiRes.statusCode || 502, apiRes.headers);
    apiRes.pipe(res);
  });
  upstream.on("error", (err) => {
    res.writeHead(502, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "api_unavailable", detail: err.message }));
  });
  req.pipe(upstream);
}

http.createServer((req, res) => {
  if (req.url.startsWith("/api/") || req.url === "/healthz" || req.url === "/docs" || req.url === "/openapi.yaml") {
    proxyApi(req, res);
    return;
  }
  serveStatic(req, res);
}).listen(port, host, () => {
  console.log(`TraderMemos launcher listening on http://${host}:${port}, API on ${apiPort}`);
});

