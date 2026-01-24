#!/usr/bin/env node
/**
 * Telegram Bot Test Script
 *
 * Usage:
 *   1. First, send any message to your bot (@AIFrontlineBot) in Telegram
 *   2. Run: node scripts/test-telegram-bot.js
 *   3. This will show you the chat_id to use
 *
 * For group chats:
 *   1. Add the bot to your group
 *   2. Send a message in the group mentioning the bot
 *   3. Run this script to get the group's chat_id
 */

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || 'REDACTED_TELEGRAM_BOT_TOKEN';

async function getUpdates() {
  const url = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/getUpdates`;

  try {
    const response = await fetch(url);
    const data = await response.json();

    if (!data.ok) {
      console.error('Error:', data.description);
      return;
    }

    if (data.result.length === 0) {
      console.log('\n⚠️  No messages found!\n');
      console.log('Please do ONE of the following first:');
      console.log('');
      console.log('📱 For PRIVATE chat (1-on-1 with bot):');
      console.log('   1. Open Telegram');
      console.log('   2. Search for @AIFrontlineBot');
      console.log('   3. Send any message (like "hello")');
      console.log('   4. Run this script again');
      console.log('');
      console.log('👥 For GROUP chat:');
      console.log('   1. Create a Telegram group or use existing one');
      console.log('   2. Add @AIFrontlineBot to the group');
      console.log('   3. Send a message in the group');
      console.log('   4. Run this script again');
      console.log('');
      return;
    }

    console.log('\n✅ Found messages! Here are your chat IDs:\n');
    console.log('─'.repeat(50));

    const seenChats = new Set();

    for (const update of data.result) {
      const message = update.message || update.channel_post;
      if (!message) continue;

      const chat = message.chat;
      const chatKey = `${chat.id}`;

      if (seenChats.has(chatKey)) continue;
      seenChats.add(chatKey);

      const chatType = chat.type;
      const chatName = chat.title || chat.first_name || chat.username || 'Unknown';

      console.log(`📍 Chat ID: ${chat.id}`);
      console.log(`   Type: ${chatType}`);
      console.log(`   Name: ${chatName}`);
      if (chat.username) console.log(`   Username: @${chat.username}`);
      console.log('');
    }

    console.log('─'.repeat(50));
    console.log('\n📝 Next steps:');
    console.log('');
    console.log('1. Copy the Chat ID you want to use');
    console.log('2. Add it to your .env file:');
    console.log('   TELEGRAM_CHAT_ID=<your-chat-id>');
    console.log('');
    console.log('3. Test sending a message:');
    console.log('   node scripts/test-telegram-bot.js send "Hello from bot!"');
    console.log('');

  } catch (error) {
    console.error('Error:', error.message);
  }
}

async function sendMessage(chatId, text) {
  const url = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`;

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text: text,
        parse_mode: 'Markdown'
      })
    });

    const data = await response.json();

    if (data.ok) {
      console.log('✅ Message sent successfully!');
      console.log(`   Message ID: ${data.result.message_id}`);
    } else {
      console.error('❌ Failed:', data.description);
    }
  } catch (error) {
    console.error('Error:', error.message);
  }
}

// Main
const args = process.argv.slice(2);

if (args[0] === 'send' && args[1]) {
  const chatId = process.env.TELEGRAM_CHAT_ID || args[2];
  if (!chatId) {
    console.error('Please set TELEGRAM_CHAT_ID or provide it as argument');
    console.error('Usage: node test-telegram-bot.js send "message" <chat_id>');
    process.exit(1);
  }
  sendMessage(chatId, args[1]);
} else {
  getUpdates();
}
