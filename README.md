# Edge AI 記帳助手 (Accounting Assistant)

基於 **Cloudflare Workers** + **Hono** + **Telegram Bot** 打造的極致輕量、零維護成本的個人 AI 記帳助手。支援自然語言與發票圖片多模態解析，並附帶 **Next.js 管理後台 Dashboard**。

## ✨ 核心特色 (V2 升級)
- **零伺服器成本**：完全運行在 Cloudflare Workers 免費額度上。
- **NLP 動態查詢**：不只能記帳，直接對 Bot 說「這個月吃飯花多少？」即可自動產出分類統計報表！
- **多模態視覺解析**：結合 Google Gemini 2.5 Flash 視覺模型，傳送發票或收據照片自動生帳目。
- **動態分類引擎與安全移轉**：AI 自動建議分類，免手動建檔。提供 `/categories` 列出分類，支援透過自然語言指令刪除，並自動彈出 Inline Keyboard 防呆選單幫助您無縫移轉關聯帳目。
- **Dashboard 管理後台**：Next.js 網頁介面，提供圓餅圖、趨勢折線圖、帳目管理等視覺化功能，由 Cloudflare Access 保護（只有你能登入）。
- **報表匯出**：提供 `/export` 指令直接下載 CSV 檔案以供外部圖表 (Excel / Looker Studio) 深度分析。

## 🛠️ 系統架構 (Architecture)

```
accounting-assistant/
├── src/              ← Cloudflare Workers Bot API
├── dashboard/        ← Next.js Dashboard (Cloudflare Pages)
├── scripts/          ← 自動化部署腳本
└── schema.sql        ← D1 資料庫 Schema
```

| Layer | 技術 |
|-------|------|
| Bot Runtime | Cloudflare Workers + Hono.js |
| Bot Framework | GrammY |
| Database | Cloudflare D1 (Serverless SQLite) |
| LLM | Google Gemini API |
| Dashboard | Next.js 15 + Tailwind CSS |
| Dashboard Hosting | Cloudflare Pages |
| Dashboard Auth | Cloudflare Access (Zero Trust) |

## 🚀 Bot 部署指南 (Deployment Guide)

### 1. 準備工作 (Prerequisites)
- [Cloudflare 帳號](https://dash.cloudflare.com/) 
- Telegram Bot Token (向 [@BotFather](https://t.me/BotFather) 申請)
- [Google AI Studio API Key](https://aistudio.google.com/app/apikey) (Gemini Token)
- 你的 Telegram User ID (可向 [@userinfobot](https://t.me/userinfobot) 查詢)

### 2. 終極一鍵部署 (Deploy to Production)
第一次部署，只需要這一行：
```bash
git clone <your-repo-url>
cd accounting-assistant
npm install
npm run deploy
```
系統會自動：
1. **[偵測]** 發現環境未初始化，自動呼叫 `npm run setup` 建立 D1 資料庫與上傳 Secrets。
2. **[建置]** 編譯並將程式碼推送到 Cloudflare Workers。
3. **[註冊]** 自動呼叫 Telegram API 完成 Webhook 綁定並設定左下角選單。

看到 `🎉 Webhook 註冊成功！` 即代表大功告成，打開 Telegram 跟你的機器人說聲 `/start` 開始快樂記帳！

---
## 📊 Dashboard 部署指南

### 1. 部署到 Cloudflare Pages
前往 [Cloudflare Pages](https://dash.cloudflare.com/?to=/:account/pages) → **Create Application → Connect to Git**，選擇此 Repo，設定以下 Build 參數：

| 設定項目 | 值 |
|---------|---|
| Root directory | `dashboard` |
| Framework preset | `Next.js` |
| Build command | `npm run build` |
| Output directory | `.vercel/output/static` |

並新增環境變數：`NEXT_PUBLIC_WORKER_URL` = 你的 Worker 網址

### 2. 用 Cloudflare Access 鎖起來
1. 前往 [Zero Trust → Access → Applications](https://one.dash.cloudflare.com/) → **Add Application → Self-hosted**
2. 填入你的 Pages 網址作為 Application Domain
3. 在 **Policies** 設定 Email 白名單，只允許你自己的 Email 進入

完成後，造訪 Dashboard 時會先跳出 Cloudflare 社交登入驗證頁面，非白名單帳號一律拒絕。

---
## 💻 開發與測試 (Development & Testing)

### 本機連線熱重載 (Local Dev)
1. 執行 `npm run setup` 腳本時已自動為您產出 `.dev.vars`。
2. 啟動本機伺服器：`npm run dev`
3. 搭配 `ngrok` 或 `cloudflared` (例如 `npx cloudflared tunnel --url http://127.0.0.1:8787`) 將本機埠暴露再設定 Webhook 即可即時測試。

### 自動化測試 (Automated Tests)
專案已內建完整的 Vitest Cloudflare Pool Workers 測試套件，涵蓋 D1 資料庫的離線隔離模擬。
```bash
npm run test
```
