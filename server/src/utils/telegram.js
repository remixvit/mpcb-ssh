'use strict';
const { getDb } = require('../db/schema');

function getBotToken() {
  try {
    const row = getDb().prepare("SELECT value FROM settings WHERE key = 'telegram_bot_token'").get();
    if (row?.value) return row.value;
  } catch {}
  return process.env.TELEGRAM_SERVICE_BOT_TOKEN || null;
}

async function sendTelegram(chatId, text) {
  const token = getBotToken();
  if (!token || !chatId) return;
  try {
    await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text, parse_mode: 'HTML' }),
    });
  } catch (e) {
    console.error('[telegram] send failed:', e.message);
  }
}

module.exports = { getBotToken, sendTelegram };
