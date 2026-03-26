# accounting-assistant — 專案記憶

<!-- 
  本文件遵循 AGENTS.md §9 定義的記憶模板。
  由 AI Agent 與使用者共同維護，記錄專案的關鍵上下文。
-->

## Overview
開發一個可透過聊天軟體（文字或語音）觸發的 AI 記帳助手，能自動解析輸入並記錄帳務，以提供便捷的手機記帳體驗。

## Status
- **階段**: V2 新功能規劃中 
- **上次更新**: 2026-03-26
- **當前焦點**: 規劃 V2 的資料庫擴充 (過濾查詢與分類轉移)、CLI 全自動配置腳本以及 Vitest 測試環境。
- **下一步**: 待使用者確認 V2 架構 (特別是指令 UX 偏好)，確認後實作。

## Key Facts
- [2026-03-25] 專案建立，目標為開發聊天機器人式的記帳助手。
- [2026-03-25] 確認需求：只需支出紀錄、能修改帳目、CSV 匯出、圖片上傳、動態分類建立。

## Decisions
- [2026-03-25] **架構重構**: 捨棄 n8n，改為 Cloudflare Workers + Hono + Telegram Webhook + GrammY 架構。**原因**: 完美支援圖片傳輸 API 與 Inline Keyboard 對話互動。
- [2026-03-25] **選擇資料庫**: 棄用 Google Sheets，改用 Cloudflare D1 (SQLite)。**原因**: Schema 更穩固，尋找與更新單筆資料 (Message ID) 速度快。
- [2026-03-25] **新增 Categories 表格**: **原因**: 讓分類變成動態 Enum。使用者未指定的分類可由 AI 建議，並透過 Telegram Inline Keyboard 讓使用者一鍵把新分類加入資料庫。

## Lessons Learned
