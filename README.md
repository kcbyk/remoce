# Remoce

## Yapı
- `client/`: Vite + React (Vercel)
- `server/`: Express + Socket.IO (Render)

## Lokal Çalıştırma
### Backend
```bash
cd server
npm install
npm run dev
```

### Frontend
```bash
cd client
npm install
npm run dev
```

## Deploy
### Render (Backend)
- Repo: bu repo
- Root Directory: `server`
- Build Command: `npm install`
- Start Command: `node index.js`
- Env Vars:
  - `CORS_ORIGIN`: `https://<vercel-domain>`
  - (opsiyonel) `SERP_API_KEY`, `MOJEEK_API_KEY`, `SCRAPINGBEE_KEY`, `SCRAPINGANT_KEYS`

### Vercel (Frontend)
- Root Directory: `client`
- Build Command: `npm run build`
- Output Directory: `dist`
- Env Vars:
  - `VITE_BACKEND_URL`: `https://<render-backend-domain>`
  - `VITE_SOCKET_URL`: `https://<render-backend-domain>`

## Notlar
- Paylaşımlı tarayıcı, `/proxy` üzerinden çalışır. Bazı modern siteler (anti-bot / cookie / CSP) tam uyumlu olmayabilir.
