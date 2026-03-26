# Edge AI 記帳助手 (Accounting Assistant)

基於 **Cloudflare Workers** + **Hono** + **Telegram Bot** 打造的極致輕量、零維護成本的個人 AI 記帳助手。支援自然語言與發票圖片多模態解析。

## ✨ 核心特色 (V2 升級)
- **零伺服器成本**：完全運行在 Cloudflare Workers 免費額度上。
- **NLP 動態查詢**：不只能記帳，直接對 Bot 說「這個月吃飯花多少？」即可自動產出分類統計報表！
- **多模態視覺解析**：結合 Google Gemini 2.5 Flash 視覺模型，傳送發票或收據照片自動生帳目。
- **動態分類引擎與安全移轉**：AI 自動建議分類，免手動建檔。提供 `/categories` 列出分類，支援透過自然語言指令刪除，並自動彈出 Inline Keyboard 防呆選單幫助您無縫移轉關聯帳目。
- **報表匯出**：提供 `/export` 指令直接下載 CSV 檔案以供外部圖表 (Excel / Looker Studio) 深度分析。

## 🛠️ 系統架構 (Architecture)
- **Runtime**: Cloudflare Workers
- **Framework**: Hono.js (TypeScript)
- **Bot Framework**: GrammY
- **Database**: Cloudflare D1 (Serverless SQLite)
- **LLM**: Google Gemini API

## 🚀 部署指南 (Deployment Guide)

### 1. 準備工作 (Prerequisites)
- [Cloudflare 帳號](https://dash.cloudflare.com/) 
- Telegram Bot Token (向 [@BotFather](https://t.me/BotFather) 申請)
- [Google AI Studio API Key](https://aistudio.google.com/app/apikey) (Gemini Token)
- 你的 Telegram User ID (可向 [@userinfobot](https://t.me/userinfobot) 查詢)

### 2. 環境安裝與自動化設定 (Day-0 Setup)
過去需要手動設定 D1、綁定 ID 和 Schema，現在我們提供了全自動化安裝腳本！

\`\`\`bash
git clone <your-repo-url>
cd accounting-assistant
npm install

# 執行全自動設定腳本
npm run setup
\`\`\`
執行腳本後，程式會：
1. 自動創建 `accounting-db` 資料庫並覆寫 `wrangler.jsonc`。
2. 自動向雲端同步執行 `schema.sql`。
3. 透過互動式介面引導您輸入 `TELEGRAM_BOT_TOKEN`、`GEMINI_API_KEY` 與 `ALLOWED_USER_ID`，並自動安全地加密存入 Cloudflare Secrets 中。

### 4. 終極一鍵部署 (Deploy to Production)
現在我們已經將環境設定、部署、與 Webhook 註冊**完美串接在同一個指令**中！若您是第一次克隆此專案，只要跑這一行就夠了：
\`\`\`bash
npm run deploy
\`\`\`
執行此指令後，系統會自動：
1. **[偵測]** 發現環境未初始化，自動呼叫 `npm run setup` 建立 D1 資料庫與安全憑證。
2. **[建置]** 自動編譯並將程式碼發佈推送到 Cloudflare Workers。
3. **[註冊]** 自動呼叫 Telegram API，將您的專屬 Worker 網址安全註冊為伺服器 Webhook。

看到 `🎉 Webhook 註冊成功！` 即代表大功告成，可以直接打開 Telegram 跟你的機器人說聲 `/start` 開始快樂記帳了！

---
## 💻 開發與測試 (Development & Testing)

### 本機連線熱重載 (Local Dev)
1. 執行 `npm run setup` 腳本時已自動為您產出 `.dev.vars`。
2. 啟動本機伺服器：`npm run dev`
3. 搭配 `ngrok` 或 `cloudflared` (例如 `npx cloudflared tunnel --url http://127.0.0.1:8787`) 將本機埠暴露，再依循上述「第 5 步」設定 Webhook 即可即時測試。

### 自動化測試 (Automated Tests)
專案已內建完整的 Vitest Cloudflare Pool Workers 測試套件，涵蓋 D1 資料庫的離線隔離模擬。
\`\`\`bash
npm run test
\`\`\`
