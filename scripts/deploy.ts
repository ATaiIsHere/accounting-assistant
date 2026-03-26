import { execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

async function run() {
  console.log('🚀 開始部署 Edge AI 記帳助手...');

  const devVarsPath = path.join(process.cwd(), '.dev.vars');
  let telegramToken = '';

  // 自動化檢查：若無 .dev.vars，代表尚未進行初步設定
  if (!fs.existsSync(devVarsPath)) {
    console.log('⚠️ 系統偵測到您尚未完成初次基礎設定 (.dev.vars 遺失)，正在自動為您啟動 `npm run setup`...\n');
    try {
      execSync('npm run setup', { stdio: 'inherit' });
      console.log('\n✅ 初次設定完成，繼續執行部署流程...\n');
    } catch (e) {
      console.error('\n❌ 設定已中斷或發生錯誤，結束部署。');
      return;
    }
  }

  try {
    // 1. Run wrangler deploy
    console.log('📦 正在發佈至 Cloudflare Workers (可能需要數十秒時間)...');
    const output = execSync('npx wrangler deploy --minify', { encoding: 'utf-8' });
    console.log(output);

    // 2. Capture Worker URL
    const match = output.match(/https:\/\/[^\s]+?\.workers\.dev/);
    if (!match) {
      console.log('⚠️ 部署成功，但在輸出中找不到 Worker 網址，請手動註冊 Webhook。');
      return;
    }
    const workerUrl = match[0];
    console.log(`✅ 取得 Worker 網址: ${workerUrl}`);

    // 3. Read Telegram Token
    if (fs.existsSync(devVarsPath)) {
      const content = fs.readFileSync(devVarsPath, 'utf-8');
      const tokenMatch = content.match(/TELEGRAM_BOT_TOKEN="?([^"\n]+)"?/);
      if (tokenMatch) {
        telegramToken = tokenMatch[1].trim();
      }
    }

    if (!telegramToken) {
      console.log('⚠️ 找不到 Telegram Bot Token (.dev.vars)，請手動造訪 Telegram API 註冊 Webhook。');
      return;
    }

    // 4. Register Webhook
    console.log('🔗 正在自動綁定 Telegram Webhook (具備安全驗證)...');
    const webhookEndpoint = `${workerUrl}/webhook/telegram`;
    const secretToken = telegramToken.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 256);
    const tgApiUrl = `https://api.telegram.org/bot${telegramToken}/setWebhook?url=${webhookEndpoint}&secret_token=${secretToken}`;
    
    const res = await fetch(tgApiUrl);
    const data = await res.json() as any;

    if (data.ok) {
      console.log('🎉 Webhook 註冊成功！可以開始在 Telegram 聊天室記帳了！');
    } else {
      console.error('❌ Webhook 註冊失敗:', data);
    }

    // 5. Register Telegram Menu Commands
    console.log('📋 正在設定 Telegram 內建選單指令...');
    const setCommandsUrl = `https://api.telegram.org/bot${telegramToken}/setMyCommands`;
    const commandsPayload = {
      commands: [
        { command: "start", "description": "啟動記帳助手" },
        { command: "help", "description": "顯示使用說明與所有指令" },
        { command: "summary", "description": "查看本月累積花費" },
        { command: "categories", "description": "列出目前所有分類" },
        { command: "export", "description": "匯出所有帳目(CSV)" }
      ]
    };
    await fetch(setCommandsUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(commandsPayload)
    });
    console.log('✅ Telegram 選單設定完成！左下角會有選單按鈕。');

  } catch (error: any) {
    console.error('❌ 部署發生錯誤:');
    if (error.stdout) console.error(error.stdout.toString());
    if (error.stderr) console.error(error.stderr.toString());
  }
}

run();
