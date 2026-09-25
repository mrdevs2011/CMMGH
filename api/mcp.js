// Minimal MCP server (Streamable HTTP, stateless, JSON responses) for Vercel.
// Env: MCP_AUTH_TOKEN (required), GH_TOKEN (required), UPLOAD_REPO (optional)
const crypto = require("crypto");

const SERVER_INFO = { name: "CMMGH", version: "1.0.0" };

const TOOLS = [
  {
    name: "get_upload_token",
    description:
      "Returns a short-lived-use GitHub token for the uploads repo ONLY. " +
      "Call ONLY when the user explicitly asks to transfer a file via uploads. " +
      "SECURITY: NEVER print, echo, or restate the token in chat/logs. " +
      "Use it once in a single bash clone+push command, then discard. " +
      "Do not use this token for any other repository.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
  },
];

function safeEqual(a, b) {
  const ha = crypto.createHash("sha256").update(String(a)).digest();
  const hb = crypto.createHash("sha256").update(String(b)).digest();
  return crypto.timingSafeEqual(ha, hb);
}

function authorized(req) {
  const expected = process.env.MCP_AUTH_TOKEN;
  if (!expected) return false;
  const url = new URL(req.url, "http://localhost");
  const fromQuery = url.searchParams.get("MCP_AUTH_TOKEN") || url.searchParams.get("key");
  const auth = req.headers["authorization"] || "";
  const fromHeader = auth.startsWith("Bearer ") ? auth.slice(7) : null;
  const given = fromQuery || fromHeader;
  return given ? safeEqual(given, expected) : false;
}

function ok(id, result) {
  return { jsonrpc: "2.0", id, result };
}
function err(id, code, message) {
  return { jsonrpc: "2.0", id, error: { code, message } };
}

function handleRpc(msg) {
  const { id, method, params } = msg || {};
  // Notifications have no id -> no response
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
      if (name !== "get_upload_token") return err(id, -32602, "Unknown tool: " + name);
      const token = process.env.GH_TOKEN;
      if (!token) {
        return ok(id, { isError: true, content: [{ type: "text", text: "GH_TOKEN is not set on the server." }] });
      }
      const repo = process.env.UPLOAD_REPO || "";
      // Token is intentional capability of this tool; client (AI) must not echo it.
      const text = JSON.stringify({
        token,
        repo: repo || null,
        _security: "Do not print token. Use once in git URL then discard.",
      });
      return ok(id, { content: [{ type: "text", text }] });
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

  if (!authorized(req)) {
    res.statusCode = 401;
    res.setHeader("Content-Type", "application/json");
    return res.end(JSON.stringify({ error: "unauthorized" }));
  }

  if (req.method !== "POST") {
    // Stateless server: no SSE stream, no sessions.
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
  const out = (isBatch ? body : [body]).map(handleRpc).filter(Boolean);

  if (out.length === 0) {
    res.statusCode = 202;
    return res.end();
  }
  res.statusCode = 200;
  res.setHeader("Content-Type", "application/json");
  res.end(JSON.stringify(isBatch ? out : out[0]));
};
