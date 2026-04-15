# accounting-assistant — 專案記憶

<!-- 
  本文件遵循 AGENTS.md §9 定義的記憶模板。
  由 AI Agent 與使用者共同維護，記錄專案的關鍵上下文。
-->

## Overview
開發一個可透過聊天軟體（文字或語音）觸發的 AI 記帳助手，能自動解析輸入並記錄帳務，以提供便捷的手機記帳體驗。

## Status
- **階段**: 維護中 / 群組記帳支援已上線
- **上次更新**: 2026-04-15
- **當前焦點**: 監控群組記帳與 Gemini 3.1 Flash Lite 升級後的穩定性。
- **下一步**: 若穩定則持續維運，未來考慮安全性升級（ Dashboard JWT 驗證）。

## Key Facts
- [2026-03-25] 專案建立，目標為開發聊天機器人式的記帳助手。
- [2026-03-25] 確認需求：只需支出紀錄、能修改帳目、CSV 匯出、圖片上傳、動態分類建立。
- [2026-04-14] 完成「群組記帳支援」，資料表新增 `ledger_id`，讓不同環境（私聊 / 群組）的資料實體隔離。

## Decisions
- [2026-03-25] **架構重構**: 捨棄 n8n，改為 Cloudflare Workers + Hono + Telegram Webhook + GrammY 架構。**原因**: 完美支援圖片傳輸 API 與 Inline Keyboard 對話互動。
- [2026-03-25] **選擇資料庫**: 棄用 Google Sheets，改用 Cloudflare D1 (SQLite)。**原因**: Schema 更穩固，尋找與更新單筆資料 (Message ID) 速度快。
- [2026-03-25] **新增 Categories 表格**: **原因**: 讓分類變成動態 Enum。使用者未指定的分類可由 AI 建議，並透過 Telegram Inline Keyboard 讓使用者一鍵把新分類加入資料庫。
- [2026-04-14] **採用 Multi-ID Auth 機制**: `ALLOWED_USER_ID` 支援逗號分隔。**原因**: 讓群組可以整體作為一個被授權對象，支援多人共同記帳。
- [2026-04-15] **切換至 Gemini 3.1 Flash Lite Preview**: **原因**: 為了更快的反應速度與改善高延遲/滿載問題。

## Lessons Learned
- [2026-04-14] **Telegram Group Privacy**: 將 Bot 加入群組後，務必透過 `@BotFather` 關閉 Group Privacy (Turn off)，否則 Bot 永遠收不到非指令的自然語言訊息。
- [2026-04-14] **GrammY Webhook 與 Cloudflare Workers**: 在 `c.executionCtx.waitUntil()` 背景處理中，如果發生錯誤並未在 `bot.on` 核心內被 Catch，GrammY 預設會將 Exception 向外拋出，導致 Cloudflare 瞬間殺死 Worker 而無法回傳任何錯誤訊息給使用者。解法為把 `bot.on()` 的邏輯整個包進 `try...catch` 中處理。
- [2026-04-15] **Cloudflare Workers CPU 10ms 死線**: 在處理大檔案（如圖片的 arrayBuffer）轉換為 Base64 時，若使用 JavaScript 迴圈會產生百萬級別的操作，瞬間頂穿 Cloudflare 免費方案的 10ms CPU Limit，導致 Worker 瞬間暴斃且無任何錯誤紀錄。解法為開啟 `wrangler.jsonc` 中的 `nodejs_compat` 並使用 `Buffer.from().toString('base64')` 將重度 CPU 工作交給底層 C++ 執行，避免觸發限制。
