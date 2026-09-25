// Simple in-memory rate limiter (per warm serverless instance).
// Not perfect across cold starts, but stops fast brute-force attempts.
const attempts = new Map(); // key -> { count, resetAt }

const WINDOW_MS = 10 * 60 * 1000; // 10 min
const MAX_ATTEMPTS = 8;

function keyFor(req) {
  const fwd = req.headers["x-forwarded-for"] || "";
  return fwd.split(",")[0].trim() || req.socket?.remoteAddress || "unknown";
}

function check(req) {
  const key = keyFor(req);
  const now = Date.now();
  const rec = attempts.get(key);
  if (!rec || now > rec.resetAt) {
    attempts.set(key, { count: 0, resetAt: now + WINDOW_MS });
    return { blocked: false, key };
  }
  if (rec.count >= MAX_ATTEMPTS) return { blocked: true, key, retryAfterMs: rec.resetAt - now };
  return { blocked: false, key };
}

function registerFailure(key) {
  const rec = attempts.get(key);
  if (rec) rec.count += 1;
}

function registerSuccess(key) {
  attempts.delete(key);
}

module.exports = { check, registerFailure, registerSuccess };
