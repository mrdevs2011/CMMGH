# CMMGH (ConnectMyMCPGithub)

Bitta tool: `get_upload_token`. GH_TOKEN'ni Claude'ga beradi, push'ni bash qiladi.

## Deploy
1. Bu papkani GitHub repo'ga push qil (yoki `vercel` CLI bilan deploy qil).
2. Vercel > Project > Settings > Environment Variables:
   - `MCP_AUTH_TOKEN` = uzun tasodifiy satr (`openssl rand -hex 32`)
   - `GH_TOKEN` = fine-grained token (faqat `uploads` repo, Contents: Read and write, qisqa muddat)
   - `UPLOAD_REPO` (ixtiyoriy) = `mrdevs2011/uploads`
3. Redeploy.

## Claude'ga ulash
Connector URL:
`https://<loyiha>.vercel.app/mcp?MCP_AUTH_TOKEN=<MCP_AUTH_TOKEN>`

## Instruction (MCP Hub'dagi fayl) uchun qoida
"Foydalanuvchi zip'ni push qil desa: get_upload_token ni chaqir. Keyin bash bilan
`git clone https://x-access-token:<token>@github.com/<repo>.git`, zip'ni ko'chir,
commit va push qil. Tokenni javobda ko'rsatma."

## Tekshirish
curl -s -X POST "https://<loyiha>.vercel.app/mcp?MCP_AUTH_TOKEN=..." \
  -H "content-type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'
