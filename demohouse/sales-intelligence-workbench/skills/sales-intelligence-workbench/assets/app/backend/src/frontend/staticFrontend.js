import { readFile, stat } from "node:fs/promises";
import path from "node:path";

const CONTENT_TYPES = new Map([
  [".css", "text/css; charset=utf-8"],
  [".gif", "image/gif"],
  [".html", "text/html; charset=utf-8"],
  [".ico", "image/x-icon"],
  [".jpeg", "image/jpeg"],
  [".jpg", "image/jpeg"],
  [".js", "text/javascript; charset=utf-8"],
  [".json", "application/json; charset=utf-8"],
  [".png", "image/png"],
  [".svg", "image/svg+xml; charset=utf-8"],
  [".webp", "image/webp"],
]);

function resolveFrontendFile(rootDir, pathname) {
  let decodedPath;
  try {
    decodedPath = decodeURIComponent(pathname);
  } catch {
    return null;
  }

  const relativePath = decodedPath === "/"
    ? "index.html"
    : decodedPath.replace(/^\/+/, "");
  if (!relativePath || relativePath.includes("\0") || relativePath.includes("\\")) return null;
  if (relativePath.split("/").some((segment) => segment === "..")) return null;

  const resolvedRoot = path.resolve(rootDir);
  const resolvedFile = path.resolve(resolvedRoot, relativePath);
  if (resolvedFile !== resolvedRoot && !resolvedFile.startsWith(`${resolvedRoot}${path.sep}`)) return null;
  return resolvedFile;
}

async function existingFile(filePath) {
  try {
    const fileStat = await stat(filePath);
    if (fileStat.isFile()) return filePath;
    if (!fileStat.isDirectory()) return null;
    const indexPath = path.join(filePath, "index.html");
    return (await stat(indexPath)).isFile() ? indexPath : null;
  } catch {
    return null;
  }
}

function cacheControl(filePath) {
  const extension = path.extname(filePath).toLowerCase();
  if ([".html", ".js", ".css"].includes(extension)) return "no-store";
  return "public, max-age=3600";
}

export function createStaticFrontend({ rootDir }) {
  const resolvedRoot = path.resolve(rootDir);

  return async function serveStaticFrontend(req, res, pathname) {
    if (!["GET", "HEAD"].includes(req.method || "GET")) return false;
    if (pathname === "/api" || pathname.startsWith("/api/")) return false;

    const candidate = resolveFrontendFile(resolvedRoot, pathname);
    const filePath = candidate ? await existingFile(candidate) : null;
    if (!filePath) return false;

    const body = await readFile(filePath);
    const contentType = CONTENT_TYPES.get(path.extname(filePath).toLowerCase()) || "application/octet-stream";
    res.setHeader("Content-Type", contentType);
    res.setHeader("Content-Length", body.byteLength);
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Referrer-Policy", "same-origin");
    res.setHeader("Cache-Control", cacheControl(filePath));
    res.writeHead(200);
    if (req.method === "HEAD") res.end();
    else res.end(body);
    return true;
  };
}
