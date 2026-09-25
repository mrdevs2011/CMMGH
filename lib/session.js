// Stateless HMAC-signed session tokens (no DB needed).
const crypto = require("crypto");

function b64url(buf) {
  return Buffer.from(buf).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
function fromB64url(str) {
  str = str.replace(/-/g, "+").replace(/_/g, "/");
  while (str.length % 4) str += "=";
  return Buffer.from(str, "base64");
}

function sign(payloadObj, secret) {
  const payload = b64url(JSON.stringify(payloadObj));
  const mac = b64url(crypto.createHmac("sha256", secret).update(payload).digest());
  return `${payload}.${mac}`;
}

function verify(token, secret) {
  if (!token || typeof token !== "string" || !token.includes(".")) return null;
  const [payload, mac] = token.split(".");
  if (!payload || !mac) return null;
  const expectedMac = b64url(crypto.createHmac("sha256", secret).update(payload).digest());
  const a = Buffer.from(mac);
  const b = Buffer.from(expectedMac);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  let data;
  try {
    data = JSON.parse(fromB64url(payload).toString("utf8"));
  } catch {
    return null;
  }
  if (!data || typeof data.exp !== "number" || Date.now() > data.exp) return null;
  return data;
}

function parseCookies(req) {
  const header = req.headers.cookie || "";
  const out = {};
  header.split(";").forEach((part) => {
    const idx = part.indexOf("=");
    if (idx === -1) return;
    const k = part.slice(0, idx).trim();
    const v = part.slice(idx + 1).trim();
    if (k) out[k] = decodeURIComponent(v);
  });
  return out;
}

module.exports = { sign, verify, parseCookies };
