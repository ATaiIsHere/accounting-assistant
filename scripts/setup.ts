import { execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import prompts from 'prompts';

async function run() {
  console.log('🚀 開始初始化 Edge AI 記帳助手 本機環境...\n');

  try {
    // 1. Create or Check D1 Database
    console.log('📦 正在確認 Cloudflare D1 資料庫...');
    let dbId = '';
    try {
      const output = execSync('npx wrangler d1 create accounting-db', { encoding: 'utf-8', stdio: 'pipe' });
      const match = output.match(/([a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12})/i);
      if (match) dbId = match[1];
    } catch (e: any) {
      const out = (e.stdout || e.stderr)?.toString() || '';
      if (out.includes('already exists')) {
        console.log('⚠️ 資料庫 accounting-db 已存在，正在獲取 ID...');
        const info = execSync('npx wrangler d1 info accounting-db', { encoding: 'utf-8', stdio: 'pipe' });
        const match = info.match(/([a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12})/i);
        if (match) dbId = match[1];
      } else {
        throw new Error(out);
      }
    }

    if (!dbId) {
      console.log('❌ 無法取得 D1 Database ID，腳本終止。');
      process.exit(1);
    }
    console.log(`✅ 取得到 Database ID: ${dbId}\n`);

    // 2. Overwrite wrangler.jsonc
    console.log('📝 正在更新 wrangler.jsonc...');
    const wranglerPath = path.join(process.cwd(), 'wrangler.jsonc');
    let config = fs.readFileSync(wranglerPath, 'utf-8');
    config = config.replace(/"database_id":\s*"[^"]*"/g, `"database_id": "${dbId}"`);
    fs.writeFileSync(wranglerPath, config);
    console.log('✅ wrangler.jsonc 更新完成！\n');

    // 3. Sync Schema
    console.log('🗂️ 正在同步資料庫結構 (schema.sql)...');
    execSync('npx wrangler d1 execute DB --remote --file=./schema.sql', { stdio: 'inherit' });
    console.log('✅ 資料庫結構同步完成！\n');

    // 4. Ask for Secrets
    console.log('🔒 準備安全鎖定機密金鑰 (Secrets)...');
    const response = await prompts([
      {
        type: 'password',
        name: 'telegram',
        message: '🔑 請輸入 Telegram Bot Token (若已設定可直接按 Enter 略過):'
      },
      {
        type: 'password',
        name: 'gemini',
        message: '🔑 請輸入 Gemini API Key (若已設定可直接按 Enter 略過):'
      },
      {
        type: 'text',
        name: 'userid',
        message: '👤 請輸入允許連線的 Telegram User ID (純數字):'
      }
    ]);

    if (response.telegram) {
      execSync(`npx wrangler secret put TELEGRAM_BOT_TOKEN`, { input: response.telegram, stdio: ['pipe', 'inherit', 'inherit'] });
    }
    if (response.gemini) {
      execSync(`npx wrangler secret put GEMINI_API_KEY`, { input: response.gemini, stdio: ['pipe', 'inherit', 'inherit'] });
    }
    if (response.userid) {
      execSync(`npx wrangler secret put ALLOWED_USER_ID`, { input: response.userid, stdio: ['pipe', 'inherit', 'inherit'] });
      // Write to .dev.vars for local use
      const devVars = `TELEGRAM_BOT_TOKEN="${response.telegram || ''}"\nGEMINI_API_KEY="${response.gemini || ''}"\nALLOWED_USER_ID="${response.userid}"\n`;
      fs.writeFileSync('.dev.vars', devVars);
    }

    console.log('\n🎉 所有前置作業皆已完成！');
    console.log('👉 下一步：您可以輸入 `npm run deploy` 發佈到正式版，或是保留在本機開發。');

  } catch (error) {
    console.error('❌ 發生錯誤:', error);
  }
}

run();
