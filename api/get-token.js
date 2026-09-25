// GET -> requires valid cmmgh_session cookie (set by /api/login) -> returns GH_TOKEN.
// Env required: SESSION_SECRET, GH_TOKEN
const { verify, parseCookies } = require("../lib/session");

module.exports = async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");

  if (req.method !== "GET") {
    res.statusCode = 405;
    res.setHeader("Allow", "GET");
    return res.end(JSON.stringify({ error: "method_not_allowed" }));
  }

  const secret = process.env.SESSION_SECRET;
  const ghToken = process.env.GH_TOKEN;
  if (!secret || !ghToken) {
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

  const repo = process.env.UPLOAD_REPO || null;
  res.statusCode = 200;
  res.setHeader("Content-Type", "application/json");
  res.end(JSON.stringify({ token: ghToken, repo, expiresAt: session.exp }));
};
