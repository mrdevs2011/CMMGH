// GET -> requires valid cmmgh_session cookie (set by /api/login) -> returns the MCP connector URL.
// Env required: SESSION_SECRET, MCP_AUTH_TOKEN, PUBLIC_BASE_URL
// PUBLIC_BASE_URL example: https://cmmgh.vercel.app (no trailing slash)
// NOTE: the domain is NEVER derived from request headers (Host/X-Forwarded-Host
// are client-controlled and must not be trusted for building URLs).
const { verify, parseCookies } = require("../lib/session");

module.exports = async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");

  if (req.method !== "GET") {
    res.statusCode = 405;
    res.setHeader("Allow", "GET");
    return res.end(JSON.stringify({ error: "method_not_allowed" }));
  }

  const secret = process.env.SESSION_SECRET;
  const mcpAuthToken = process.env.MCP_AUTH_TOKEN;
  const baseUrl = (process.env.PUBLIC_BASE_URL || "").replace(/\/+$/, "");
  if (!secret || !mcpAuthToken || !baseUrl) {
    res.statusCode = 500;
    res.setHeader("Content-Type", "application/json");
    return res.end(JSON.stringify({ error: "server_not_configured" }));
  }

  const cookies = parseCookies(req);
  const session = verify(cookies.cmmgh_session, secret);
  if (!session) {
    res.statusCode = 401;
    res.setHeader("Content-Type", "application/json");
    return res.end(JSON.stringify({ error: "not_logged_in" }));
  }

  const url = `${baseUrl}/mcp?MCP_AUTH_TOKEN=${mcpAuthToken}`;

  res.statusCode = 200;
  res.setHeader("Content-Type", "application/json");
  res.end(JSON.stringify({ url, expiresAt: session.exp }));
};
