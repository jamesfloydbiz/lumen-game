// Minimal static server for LUMEN (Bun). Serves files from this script's folder.
import { join, normalize } from "path";
const root = import.meta.dir;
const types = { ".html":"text/html", ".css":"text/css", ".js":"text/javascript",
  ".json":"application/json", ".svg":"image/svg+xml", ".png":"image/png" };

Bun.serve({
  port: 4173,
  async fetch(req) {
    let p = new URL(req.url).pathname;
    if (p === "/") p = "/index.html";
    // prevent path traversal
    const safe = normalize(p).replace(/^(\.\.[/\\])+/, "");
    const path = join(root, safe);
    const file = Bun.file(path);
    if (!(await file.exists())) return new Response("Not found", { status: 404 });
    const ext = "." + path.split(".").pop();
    return new Response(file, { headers: { "Content-Type": types[ext] || "application/octet-stream" } });
  },
});
console.log("LUMEN serving from", root, "on :4173");
