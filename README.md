# CMMGH (ConnectMyMcpGithub)

Ikki qism:

1. **MCP server** (`/api/mcp`) — Claude uchun. Bitta tool: `get_upload_token`. `GH_TOKEN`ni Claude'ga beradi (Claude undan `uploads` repo'ga push qilish uchun foydalanadi).
2. **Web login** (`/login/`, `/token/`) — MR o'zi brauzerdan kirib, tayyor MCP connector URL'ini (`.../mcp?MCP_AUTH_TOKEN=...`) ko'rish/nusxalash uchun.

## Sahifa tuzilishi
- `/` — hech narsa ko'rsatmaydi, darhol `/login/` ga yo'naltiradi.
- `/login/` — email+parol bilan kirish sahifasi.
- `/token/` — login qilingandan keyin tayyor MCP connector URL ko'rinadigan sahifa.
- `/index.html`, `/login/index.html`, `/token/index.html` ga to'g'ridan-to'g'ri kirilsa ham, 301 bilan tozaroq (`/`, `/login/`, `/token/`) shakliga yo'naltiriladi.

## Deploy
1. Bu papkani GitHub repo'ga push qil (yoki `vercel` CLI bilan deploy qil).
2. Vercel > Project > Settings > Environment Variables:
   - `MCP_AUTH_TOKEN` = uzun tasodifiy satr (`openssl rand -hex 32`) — MCP uchun.
   - `GH_TOKEN` = fine-grained token (faqat `uploads` repo, Contents: Read and write, qisqa muddat).
   - `UPLOAD_REPO` (ixtiyoriy) = `mrdevs2011/uploads`
   - `LOGIN_EMAIL` = web login uchun email.
   - `LOGIN_PASS` = web login uchun parol.
   - `SESSION_SECRET` = uzun tasodifiy satr (`openssl rand -hex 32`) — sessiya cookie imzosi uchun.
   - `PUBLIC_BASE_URL` = loyihaning aniq domeni, masalan `https://cmmgh.vercel.app` (oxirida `/` bo'lmasin) — MCP URL shundan yasaladi, so'rov header'idan (Host) OLINMAYDI (spoofing'dan himoya).
3. Redeploy.

## Claude'ga ulash (MCP)
Connector URL: `https://<loyiha>.vercel.app/mcp?MCP_AUTH_TOKEN=<MCP_AUTH_TOKEN>`

## Web login (MR uchun)
1. `https://<loyiha>.vercel.app/` ga kir (avtomatik `/login/` ga o'tadi).
2. Email + parolni kirit.
3. `/token/` sahifasida tayyor MCP connector URL ko'rinadi, "Nusxa" tugmasi bilan darhol nusxalab, Claude'ga connector sifatida ulaysan.
4. `/token/` sahifasi **bir martalik ko'rsatish**: 30 soniyadan keyin avtomatik sessiyani tugatib `/login/`ga qaytaradi; sahifani qayta yuklasang (F5/refresh) ham darhol sessiyani tugatib `/login/`ga qaytaradi — token qayta ko'rsatilmaydi.
5. "Yangilash" tugmasi (sahifani qayta yuklamasdan) URL'ni qayta so'raydi va 30 soniyalik hisobni qayta boshlaydi. "Chiqish" tugmasi sessiyani darhol tugatadi va `/login/`ga qaytaradi.

**Xavfsizlik:**
- Parol solishtirish `timingSafeEqual` bilan (timing attack'dan himoya).
- Login urinishlari IP bo'yicha cheklangan (10 daqiqada 8 ta noto'g'ri urinish — shundan keyin 429).
- Sessiya cookie: `HttpOnly` + `Secure` (production) + `SameSite=Strict` — JS orqali o'g'irlab bo'lmaydi, boshqa saytdan yuborilmaydi.
- Sessiya statik emas — HMAC (`SESSION_SECRET`) bilan imzolangan, muddati tugagach avtomatik ishlamay qoladi.
- `/api/get-token` `GH_TOKEN`ni emas, faqat tayyor MCP connector URL'ini qaytaradi — parolli login orqali `GH_TOKEN` umuman brauzerga chiqmaydi.
- MCP URL'dagi domen `PUBLIC_BASE_URL` env'dan olinadi, `Host`/`X-Forwarded-Host` header'iga ishonilmaydi (host-header spoofing'dan himoya).

## Tekshirish (MCP)
curl -s -X POST "https://<loyiha>.vercel.app/mcp?MCP_AUTH_TOKEN=..." -H "content-type: application/json" -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'
