// CMMGH MCP — Streamable HTTP, stateless.
// SECURITY: GH_TOKEN never leaves the server. Clients upload via upload_file;
// the server pushes to GitHub Contents API with the server-side token.
// Env: MCP_AUTH_TOKEN, GH_TOKEN, UPLOAD_REPO (owner/repo), optional UPLOAD_BRANCH
const crypto = require("crypto");

const SERVER_INFO = { name: "CMMGH", version: "2.0.0" };
const MAX_FILE_BYTES = 20 * 1024 * 1024; // 20 MB
const RATE = new Map(); // key -> { count, resetAt }
const RATE_WINDOW_MS = 60_000;
const RATE_MAX = 30;

const TOOLS = [
  {
    name: "upload_file",
    description:
      "Uploads a file to the private uploads GitHub repo via server-side push. " +
      "Pass path (relative in repo) and content_base64. No GitHub token is returned. " +
      "Call only when the user asks to transfer a sandbox/artifact file via uploads.",
    inputSchema: {
      type: "object",
      properties: {
        path: {
          type: "string",
          description: "Path inside the repo, e.g. artifacts/report.pdf (no leading slash, no ..)",
        },
        content_base64: {
          type: "string",
          description: "File bytes as base64",
        },
        message: {
          type: "string",
          description: "Optional commit message",
        },
      },
      required: ["path", "content_base64"],
      additionalProperties: false,
    },
  },
  {
    name: "list_repo_root",
    description: "Lists files at the root (or given path) of the uploads repo. Read-only.",
    inputSchema: {
      type: "object",
      properties: {
        path: { type: "string", description: "Directory path, default empty = root" },
      },
      additionalProperties: false,
    },
  },
];

function safeEqual(a, b) {
  const ha = crypto.createHash("sha256").update(String(a)).digest();
  const hb = crypto.createHash("sha256").update(String(b)).digest();
  return crypto.timingSafeEqual(ha, hb);
}

function clientKey(req) {
  const fwd = req.headers["x-forwarded-for"] || "";
  return fwd.split(",")[0].trim() || req.socket?.remoteAddress || "unknown";
}

function rateLimit(req) {
  const key = clientKey(req);
  const now = Date.now();
  let rec = RATE.get(key);
  if (!rec || now > rec.resetAt) {
    rec = { count: 0, resetAt: now + RATE_WINDOW_MS };
    RATE.set(key, rec);
  }
  rec.count += 1;
  if (rec.count > RATE_MAX) return { blocked: true, retryAfterMs: rec.resetAt - now };
  return { blocked: false };
}

function extractBearer(req) {
  const auth = req.headers["authorization"] || "";
  if (auth.startsWith("Bearer ")) return auth.slice(7).trim();
  // Fallback for MCP clients that only support URL (Claude custom connector).
  // Prefer Bearer; query accepted only as secondary channel.
  const url = new URL(req.url, "http://localhost");
  return url.searchParams.get("MCP_AUTH_TOKEN") || url.searchParams.get("key") || "";
}

function authorized(req) {
  const expected = process.env.MCP_AUTH_TOKEN;
  if (!expected) return false;
  const given = extractBearer(req);
  return given ? safeEqual(given, expected) : false;
}

function sanitizeRepoPath(raw) {
  let p = String(raw || "").replace(/\\/g, "/").trim();
  if (p.startsWith("/")) p = p.slice(1);
  if (!p || p.includes("..") || p.startsWith(".git")) {
    throw new Error("Invalid path: no empty, no .., no .git");
  }
  if (!/^[a-zA-Z0-9._\-\/]+$/.test(p)) {
    throw new Error("Path may only contain alphanumeric, . _ - /");
  }
  return p;
}

function parseRepo() {
  const repo = (process.env.UPLOAD_REPO || "").trim();
  if (!repo || !repo.includes("/")) {
    throw new Error("UPLOAD_REPO env must be set as owner/name");
  }
  const [owner, name] = repo.split("/");
  return { owner, name, full: repo };
}

async function gh(path, { method = "GET", body } = {}) {
  const token = process.env.GH_TOKEN;
  if (!token) throw new Error("GH_TOKEN is not configured on the server");
  const res = await fetch(`https://api.github.com${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github+json",
      "User-Agent": "CMMGH-MCP",
      "X-GitHub-Api-Version": "2022-11-28",
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = { raw: text.slice(0, 200) };
  }
  if (!res.ok) {
    const msg = data?.message || text.slice(0, 200) || res.statusText;
    throw new Error(`GitHub API ${res.status}: ${msg}`);
  }
  return data;
}

async function uploadFile({ path, content_base64, message }) {
  const safePath = sanitizeRepoPath(path);
  const buf = Buffer.from(String(content_base64 || ""), "base64");
  if (!buf.length) throw new Error("content_base64 is empty or invalid");
  if (buf.length > MAX_FILE_BYTES) throw new Error(`File too large (max ${MAX_FILE_BYTES} bytes)`);

  const { owner, name, full } = parseRepo();
  const branch = process.env.UPLOAD_BRANCH || "main";
  const apiPath = `/repos/${owner}/${name}/contents/${safePath}`;

  // If file exists, need sha for update
  let sha;
  try {
    const existing = await gh(`${apiPath}?ref=${encodeURIComponent(branch)}`);
    if (existing && existing.sha) sha = existing.sha;
  } catch (e) {
    // 404 = new file, OK
    if (!String(e.message).includes("404")) throw e;
  }

  const body = {
    message: message || `upload ${safePath} via CMMGH`,
    content: buf.toString("base64"),
    branch,
  };
  if (sha) body.sha = sha;

  const result = await gh(apiPath, { method: "PUT", body });
  return {
    ok: true,
    path: safePath,
    repo: full,
    branch,
    commit: result?.commit?.sha || null,
    html_url: result?.content?.html_url || null,
    size: buf.length,
  };
}

async function listRepoRoot({ path }) {
  const { owner, name, full } = parseRepo();
  const branch = process.env.UPLOAD_BRANCH || "main";
  let p = String(path || "").replace(/\\/g, "/").replace(/^\/+/, "");
  if (p.includes("..")) throw new Error("Invalid path");
  const apiPath = p
    ? `/repos/${owner}/${name}/contents/${p}?ref=${encodeURIComponent(branch)}`
    : `/repos/${owner}/${name}/contents?ref=${encodeURIComponent(branch)}`;
  const data = await gh(apiPath);
  const items = Array.isArray(data) ? data : data ? [data] : [];
  const lines = items.map((i) => `${i.type}\t${i.path}\t${i.size ?? ""}`);
  return { repo: full, branch, entries: lines.join("\n") || "(empty)" };
}

function ok(id, result) {
  return { jsonrpc: "2.0", id, result };
}
function err(id, code, message) {
  return { jsonrpc: "2.0", id, error: { code, message } };
}

async function handleRpc(msg) {
  const { id, method, params } = msg || {};
  if (id === undefined || id === null) return null;

  switch (method) {
    case "initialize":
      return ok(id, {
        protocolVersion: (params && params.protocolVersion) || "2025-03-26",
        capabilities: { tools: {} },
        serverInfo: SERVER_INFO,
      });
    case "ping":
      return ok(id, {});
    case "tools/list":
      return ok(id, { tools: TOOLS });
    case "tools/call": {
      const name = params && params.name;
      const args = (params && params.arguments) || {};
      try {
        if (name === "upload_file") {
          const result = await uploadFile(args);
          return ok(id, {
            content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
          });
        }
        if (name === "list_repo_root") {
          const result = await listRepoRoot(args);
          return ok(id, {
            content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
          });
        }
        return err(id, -32602, "Unknown tool: " + name);
      } catch (e) {
        return ok(id, {
          isError: true,
          content: [{ type: "text", text: String(e.message || e) }],
        });
      }
    }
    default:
      return err(id, -32601, "Method not found: " + method);
  }
}

async function readBody(req) {
  if (req.body !== undefined && req.body !== null) {
    if (typeof req.body === "string") return JSON.parse(req.body);
    if (Buffer.isBuffer(req.body)) return JSON.parse(req.body.toString("utf8"));
    return req.body;
  }
  const chunks = [];
  for await (const c of req) chunks.push(c);
  const raw = Buffer.concat(chunks).toString("utf8");
  return raw ? JSON.parse(raw) : null;
}

module.exports = async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");

  const rl = rateLimit(req);
  if (rl.blocked) {
    res.statusCode = 429;
    res.setHeader("Content-Type", "application/json");
    return res.end(JSON.stringify({ error: "rate_limited", retryAfterMs: rl.retryAfterMs }));
  }

  if (!authorized(req)) {
    res.statusCode = 401;
    res.setHeader("Content-Type", "application/json");
    return res.end(JSON.stringify({ error: "unauthorized" }));
  }

  if (req.method !== "POST") {
    res.statusCode = 405;
    res.setHeader("Allow", "POST");
    return res.end();
  }

  let body;
  try {
    body = await readBody(req);
  } catch {
    res.statusCode = 400;
    res.setHeader("Content-Type", "application/json");
    return res.end(JSON.stringify(err(null, -32700, "Parse error")));
  }

  const isBatch = Array.isArray(body);
  const messages = isBatch ? body : [body];
  const out = [];
  for (const m of messages) {
    const r = await handleRpc(m);
    if (r) out.push(r);
  }

  if (out.length === 0) {
    res.statusCode = 202;
    return res.end();
  }
  res.statusCode = 200;
  res.setHeader("Content-Type", "application/json");
  res.end(JSON.stringify(isBatch ? out : out[0]));
};
