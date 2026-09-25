// POST { email, password } -> sets httpOnly session cookie on success.
// Env required: LOGIN_EMAIL, LOGIN_PASS, SESSION_SECRET
const crypto = require("crypto");
const { sign } = require("../lib/session");
const rateLimit = require("../lib/rateLimit");

const SESSION_TTL_MS = 30 * 60 * 1000; // 30 min

function safeEqual(a, b) {
  const ha = crypto.createHash("sha256").update(String(a)).digest();
  const hb = crypto.createHash("sha256").update(String(b)).digest();
  return crypto.timingSafeEqual(ha, hb);
}

async function readBody(req) {
  if (req.body !== undefined && req.body !== null) {
    if (typeof req.body === "string") return JSON.parse(req.body || "{}");
    if (Buffer.isBuffer(req.body)) return JSON.parse(req.body.toString("utf8") || "{}");
    return req.body;
  }
  const chunks = [];
  for await (const c of req) chunks.push(c);
  const raw = Buffer.concat(chunks).toString("utf8");
  return raw ? JSON.parse(raw) : {};
}

module.exports = async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");

  if (req.method !== "POST") {
    res.statusCode = 405;
    res.setHeader("Allow", "POST");
    return res.end(JSON.stringify({ error: "method_not_allowed" }));
  }

  const { blocked, key, retryAfterMs } = rateLimit.check(req);
  if (blocked) {
    res.statusCode = 429;
    res.setHeader("Content-Type", "application/json");
    return res.end(JSON.stringify({ error: "too_many_attempts", retryAfterMs }));
  }

  const secret = process.env.SESSION_SECRET;
  const expectedEmail = process.env.LOGIN_EMAIL;
  const expectedPass = process.env.LOGIN_PASS;
  if (!secret || !expectedEmail || !expectedPass) {
    res.statusCode = 500;
    res.setHeader("Content-Type", "application/json");
    return res.end(JSON.stringify({ error: "server_not_configured" }));
  }

  let body;
  try {
    body = await readBody(req);
  } catch {
    res.statusCode = 400;
    res.setHeader("Content-Type", "application/json");
    return res.end(JSON.stringify({ error: "bad_request" }));
  }

  const email = String(body.email || "");
  const password = String(body.password || "");

  const emailOk = email.length > 0 && safeEqual(email, expectedEmail);
  const passOk = password.length > 0 && safeEqual(password, expectedPass);

  if (!emailOk || !passOk) {
    rateLimit.registerFailure(key);
    res.statusCode = 401;
    res.setHeader("Content-Type", "application/json");
    return res.end(JSON.stringify({ error: "invalid_credentials" }));
  }

  rateLimit.registerSuccess(key);

  const token = sign({ sub: "mr", exp: Date.now() + SESSION_TTL_MS }, secret);
  const isProd = process.env.VERCEL === "1";
  const cookie = [
    `cmmgh_session=${token}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Strict",
    `Max-Age=${Math.floor(SESSION_TTL_MS / 1000)}`,
    isProd ? "Secure" : "",
  ]
    .filter(Boolean)
    .join("; ");

  res.setHeader("Set-Cookie", cookie);
  res.statusCode = 200;
  res.setHeader("Content-Type", "application/json");
  res.end(JSON.stringify({ ok: true }));
};
