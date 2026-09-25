module.exports = async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  const isProd = process.env.VERCEL === "1";
  const cookie = ["cmmgh_session=", "Path=/", "HttpOnly", "SameSite=Strict", "Max-Age=0", isProd ? "Secure" : ""]
    .filter(Boolean)
    .join("; ");
  res.setHeader("Set-Cookie", cookie);
  res.statusCode = 200;
  res.setHeader("Content-Type", "application/json");
  res.end(JSON.stringify({ ok: true }));
};
