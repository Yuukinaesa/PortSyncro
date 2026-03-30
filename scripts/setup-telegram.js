// scripts/setup-telegram.js
// Setup script for configuring Telegram Bot webhook
// Usage: node scripts/setup-telegram.js <COMMAND> [OPTIONS]
//
// Commands:
//   setup    - Set webhook URL
//   info     - Get bot info
//   remove   - Remove webhook
//   commands - Register bot commands in Telegram

// ═══════════════════════════════════════════════════════════════
// AUTO-LOAD .env.local (karena `node` tidak otomatis baca seperti Next.js)
// ═══════════════════════════════════════════════════════════════
const fs = require('fs');
const path = require('path');

function loadEnvFile(filePath) {
  try {
    if (!fs.existsSync(filePath)) return;
    const content = fs.readFileSync(filePath, 'utf-8');
    content.split('\n').forEach(line => {
      line = line.trim();
      if (!line || line.startsWith('#')) return;
      const eqIndex = line.indexOf('=');
      if (eqIndex === -1) return;
      const key = line.substring(0, eqIndex).trim();
      let value = line.substring(eqIndex + 1).trim();
      // Remove surrounding quotes if present
      if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1);
      }
      // Only set if not already defined (system env takes priority)
      if (!process.env[key]) {
        process.env[key] = value;
      }
    });
    console.log(`📂 Loaded env from: ${path.basename(filePath)}`);
  } catch (e) {
    // Ignore errors
  }
}

// Load env files in order of priority (same as Next.js)
const projectRoot = path.resolve(__dirname, '..');
loadEnvFile(path.join(projectRoot, '.env.local'));
loadEnvFile(path.join(projectRoot, '.env.development'));
loadEnvFile(path.join(projectRoot, '.env'));

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const WEBHOOK_SECRET = process.env.TELEGRAM_WEBHOOK_SECRET;

if (!BOT_TOKEN) {
  console.error('❌ TELEGRAM_BOT_TOKEN environment variable is not set!');
  console.error('');
  console.error('Steps to get your bot token:');
  console.error('1. Open Telegram and search for @BotFather');
  console.error('2. Send /newbot and follow instructions');
  console.error('3. Copy the bot token');
  console.error('4. Add to .env.local: TELEGRAM_BOT_TOKEN=your_token_here');
  process.exit(1);
}

const API = `https://api.telegram.org/bot${BOT_TOKEN}`;
const command = process.argv[2] || 'info';
const webhookUrl = process.argv[3];

async function main() {
  switch (command) {
    case 'setup':
      await setupWebhook();
      break;
    case 'info':
      await getBotInfo();
      break;
    case 'remove':
      await removeWebhook();
      break;
    case 'commands':
      await setCommands();
      break;
    case 'status':
      await getWebhookStatus();
      break;
    default:
      console.log('Usage: node scripts/setup-telegram.js <command> [webhook-url]');
      console.log('');
      console.log('Commands:');
      console.log('  info     - Get bot information');
      console.log('  setup    - Set webhook (requires URL argument)');
      console.log('  remove   - Remove webhook');
      console.log('  commands - Register bot commands menu');
      console.log('  status   - Get webhook status');
      console.log('');
      console.log('Example:');
      console.log('  node scripts/setup-telegram.js setup https://your-domain.com/api/telegram');
  }
}

async function getBotInfo() {
  console.log('🤖 Getting bot info...\n');
  const res = await fetch(`${API}/getMe`);
  const data = await res.json();
  
  if (data.ok) {
    console.log(`✅ Bot Name: ${data.result.first_name}`);
    console.log(`   Username: @${data.result.username}`);
    console.log(`   Bot ID: ${data.result.id}`);
    console.log(`   Can Join Groups: ${data.result.can_join_groups}`);
    console.log(`   Supports Inline: ${data.result.supports_inline_queries}`);
  } else {
    console.error('❌ Failed:', data.description);
  }
}

async function setupWebhook() {
  if (!webhookUrl) {
    console.error('❌ Please provide webhook URL:');
    console.error('   node scripts/setup-telegram.js setup https://your-domain.com/api/telegram');
    return;
  }

  console.log(`🔗 Setting webhook to: ${webhookUrl}\n`);

  const body = {
    url: webhookUrl,
    allowed_updates: ['message', 'callback_query'],
    drop_pending_updates: true, // Don't process old messages
    max_connections: 40
  };

  // Add secret token if available
  if (WEBHOOK_SECRET) {
    body.secret_token = WEBHOOK_SECRET;
    console.log('🔐 Using webhook secret token for verification');
  }

  const res = await fetch(`${API}/setWebhook`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  const data = await res.json();

  if (data.ok) {
    console.log('✅ Webhook set successfully!');
    console.log(`   URL: ${webhookUrl}`);
    if (WEBHOOK_SECRET) {
      console.log('   Secret: Configured ✅');
    }
  } else {
    console.error('❌ Failed:', data.description);
  }
}

async function removeWebhook() {
  console.log('🗑️ Removing webhook...\n');
  
  const res = await fetch(`${API}/deleteWebhook`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ drop_pending_updates: true })
  });
  const data = await res.json();

  if (data.ok) {
    console.log('✅ Webhook removed successfully!');
  } else {
    console.error('❌ Failed:', data.description);
  }
}

async function getWebhookStatus() {
  console.log('📡 Getting webhook status...\n');
  
  const res = await fetch(`${API}/getWebhookInfo`);
  const data = await res.json();

  if (data.ok) {
    const info = data.result;
    console.log(`   URL: ${info.url || '(not set)'}`);
    console.log(`   Has Custom Certificate: ${info.has_custom_certificate}`);
    console.log(`   Pending Updates: ${info.pending_update_count}`);
    console.log(`   Max Connections: ${info.max_connections}`);
    console.log(`   IP Address: ${info.ip_address || 'N/A'}`);
    if (info.last_error_date) {
      const errorDate = new Date(info.last_error_date * 1000).toLocaleString();
      console.log(`   Last Error: ${info.last_error_message} (${errorDate})`);
    } else {
      console.log('   Last Error: None ✅');
    }
    if (info.allowed_updates) {
      console.log(`   Allowed Updates: ${info.allowed_updates.join(', ')}`);
    }
  } else {
    console.error('❌ Failed:', data.description);
  }
}

async function setCommands() {
  console.log('📋 Registering bot commands...\n');

  const commands = [
    { command: 'start', description: '🚀 Mulai & info bot' },
    { command: 'help', description: '📖 Daftar semua perintah' },
    { command: 'link', description: '🔗 Hubungkan akun (link KODE)' },
    { command: 'unlink', description: '🔓 Putuskan koneksi akun' },
    { command: 'status', description: '🔗 Status koneksi akun' },
    { command: 'porto', description: '📋 Rekap keuangan (format WhatsApp)' },
    { command: 'portfolio', description: '📊 Ringkasan portfolio (detail)' },
    { command: 'hargaporto', description: '💹 Harga portofolio saat ini' },
    { command: 'harga', description: '💹 Cek harga ticker spesifik' },
    { command: 'saham', description: '📈 Detail saham' },
    { command: 'crypto', description: '🪙 Detail crypto' },
    { command: 'emas', description: '🥇 Detail emas' },
    { command: 'cash', description: '💵 Detail cash' },
    { command: 'beli', description: '💰 Beli aset (buy TYPE TICKER QTY PRICE)' },
    { command: 'jual', description: '📤 Jual aset (sell TYPE TICKER QTY PRICE)' },
    { command: 'addcash', description: '💵 Tambah cash (addcash BANK AMOUNT)' },
    { command: 'setcash', description: '💳 Set nominal Bank mutlak (setcash BANK AMOUNT)' },
    { command: 'addgold', description: '🥇 Beli emas (addgold TYPE GRAMS PRICE)' },
    { command: 'riwayat', description: '📜 Riwayat 10 transaksi terakhir' },
    { command: 'pnl', description: '📊 Profit & Loss summary' },
    { command: 'autopilot', description: '⚙️ Kirim rekap harian otomatis' },
    { command: 'setname', description: '👤 Ganti identitas di grup' }
  ];

  const res = await fetch(`${API}/setMyCommands`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ commands })
  });
  const data = await res.json();

  if (data.ok) {
    console.log(`✅ ${commands.length} commands registered successfully!`);
    commands.forEach(cmd => {
      console.log(`   /${cmd.command} - ${cmd.description}`);
    });
  } else {
    console.error('❌ Failed:', data.description);
  }
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
