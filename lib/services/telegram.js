'use strict';

const { Telegraf } = require('telegraf');
const NodeCache = require('node-cache');
const watson_assistant = require('./watson-assistant');

const local_cache = new NodeCache();

function message_broker(message) {
  return new Promise(async (resolve, reject) => {
    const chat_id = message.chat.id;

    const context = local_cache.get(chat_id) || {};

    const watson_response = await watson_assistant.message({
      text: message.text,
      id: chat_id,
      context,
    });

    local_cache.set(chat_id, watson_response.context);
    console.log(JSON.stringify(watson_response, null, 2));
    resolve();
  });
}

module.exports = {
  listen: () => {
    const telegram_bot = new Telegraf(process.env.TELEGRAM_BOT_TOKEN);

    telegram_bot.start((ctx) => ctx.reply('Welcome'));

    telegram_bot.on('text', async (ctx) => {
      // Using context shortcut
      ctx.reply(`Hello ${ctx.message.chat.first_name}`);
      const response = await message_broker(ctx.message);
    });

    telegram_bot.launch();
  },
};
