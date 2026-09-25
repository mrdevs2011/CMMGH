# CMMGH (ConnectMyMCPGithub)

Ikki qism:

1. **MCP server** (`/api/mcp`) — Claude uchun. Bitta tool: `get_upload_token`. `GH_TOKEN`ni Claude'ga beradi (Claude undan `uploads` repo'ga push qilish uchun foydalanadi).
2. **Web login** (`/`, `/token.html`) — MR o'zi brauzerdan kirib, xuddi shu `GH_TOKEN`ni qo'lda ko'rish/nusxalash uchun.

## Deploy
1. Bu papkani GitHub repo'ga push qil (yoki `vercel` CLI bilan deploy qil).
2. Vercel > Project > Settings > Environment Variables:
   - `MCP_AUTH_TOKEN` = uzun tasodifiy satr (`openssl rand -hex 32`) — MCP uchun.
   - `GH_TOKEN` = fine-grained token (faqat `uploads` repo, Contents: Read and write, qisqa muddat).
   - `UPLOAD_REPO` (ixtiyoriy) = `mrdevs2011/uploads`
   - `LOGIN_EMAIL` = web login uchun email.
   - `LOGIN_PASS` = web login uchun parol.
   - `SESSION_SECRET` = uzun tasodifiy satr (`openssl rand -hex 32`) — sessiya cookie imzosi uchun.
3. Redeploy.

## Claude'ga ulash (MCP)
Connector URL: `https://<loyiha>.vercel.app/mcp?MCP_AUTH_TOKEN=<MCP_AUTH_TOKEN>`

## Web login (MR uchun)
1. `https://<loyiha>.vercel.app/` ga kir.
2. Email + parolni kirit.
3. `/token.html`da tokenni ko'rasan, "Nusxa" tugmasi bilan darhol nusxalab olasan.
4. Sessiya 30 daqiqa amal qiladi, shundan keyin qayta login kerak bo'ladi.
5. "Chiqish" tugmasi sessiyani darhol tugatadi.

**Xavfsizlik:**
- Parol solishtirish `timingSafeEqual` bilan (timing attack'dan himoya).
- Login urinishlari IP bo'yicha cheklangan (10 daqiqada 8 ta noto'g'ri urinish — shundan keyin 429).
- Sessiya cookie: `HttpOnly` + `Secure` (production) + `SameSite=Strict` — JS orqali o'g'irlab bo'lmaydi, boshqa saytdan yuborilmaydi.
- Sessiya statik emas — HMAC (`SESSION_SECRET`) bilan imzolangan, muddati tugagach avtomatik ishlamay qoladi.
- Token hech qachon serverda/logda saqlanmaydi — faqat `GH_TOKEN` env'dan o'qib, so'rov javobida qaytariladi.

## Tekshirish (MCP)
curl -s -X POST "https://<loyiha>.vercel.app/mcp?MCP_AUTH_TOKEN=..." -H "content-type: application/json" -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'
