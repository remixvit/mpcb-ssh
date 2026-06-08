'use strict';

async function sendTelegram(chatId, text) {
  const token = process.env.TELEGRAM_SERVICE_BOT_TOKEN;
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

module.exports = { sendTelegram };
