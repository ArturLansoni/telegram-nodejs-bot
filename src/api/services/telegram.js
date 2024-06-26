'use strict';

const { Telegraf } = require('telegraf');
const node_cache = require('node-cache');
const watson_assistant = require('./watson-assistant');
const speech_to_text = require('./speech-to-text');

const local_cache = new node_cache();

/**
 * Function to handle text messages and interact with a IBM watsonx Assistant.
 * @param {object} message - The message object containing chat information and text.
 * @returns {Promise} - A promise resolving to an array of responses.
 */
function text_message_broker(message) {
  return new Promise(async (resolve, reject) => {
    try {
      const chat_id = message.chat.id;

      // Retrieve or initialize the full context from local cache
      const full_context = local_cache.get(chat_id) || {
        skills: { 'actions skill': { skill_variables: {} } },
      };
      const context = full_context.skills['actions skill'].skill_variables;

      context.first_name = message.chat.first_name;

      // Update the skill_variables in the full context
      full_context.skills['actions skill'].skill_variables = context;

      // Send message to watsonx Assistant with text, chat ID, and full context
      let res = await watson_assistant.message({
        text: message.text,
        id: chat_id,
        context: full_context,
      });

      // Check if watsonx Assistant skip_user_input -> true
      if (
        res.context.global.system.skip_user_input &&
        res.context.global.system.skip_user_input === true
      ) {
        // Store previous output before calling watsonx Assistant again
        const previous_output = res.output.generic;
        console.debug('skip_user_input -> true');

        // Call Watson Assistant without user input
        res = await watson_assistant.message({
          id: chat_id,
          context: res.context,
        });
        console.debug('extension called -> OK');

        // Concatenate previous output with new output
        res.output.generic = previous_output.concat(res.output.generic);
      }

      console.debug('--------------------------------------------------');
      console.debug('assistant session_id ->', res.context.global.session_id);
      console.debug('assistant output ->', res.output.generic);

      // Update local cache with the latest context
      local_cache.set(chat_id, res.context);

      resolve(res.output.generic);
    } catch (err) {
      reject(err);
    }
  });
}

/**
 * Function to handle text messages and interact with a IBM watsonx Assistant.
 * @param {object} message - The message object containing chat information and text.
 * @param {string} fileLink - The link to the voice file.
 * @returns {Promise} - A promise resolving to an array of responses.
 */
function voice_message_broker(message, fileLink) {
  return new Promise(async (resolve, reject) => {
    try {
      // Fetch the audio file from the provided link
      const audioResponse = await fetch(fileLink);
      const buffer = await audioResponse.arrayBuffer();

      let text = await speech_to_text.synthesize(buffer);
      message.text = text;

      const response = await text_message_broker(message);
      resolve(response);
    } catch (err) {
      reject(err);
    }
  });
}

function response_parser(response) {
  let text = '';
  let options = [];

  response.forEach((item) => {
    if (item.response_type === 'text') {
      text = item.text;
    } else if (item.response_type === 'option') {
      item.options.forEach((option) => {
        options.push([{ text: option.label, callback_data: option.label }]);
      });
    }
  });
  return [text, options];
}


module.exports = {
  start: () => {
    try {
      // Create a new instance of the Telegraf bot with the provided Telegram bot token
      const bot = new Telegraf(process.env.TELEGRAM_BOT_TOKEN);
      bot.start((ctx) => ctx.reply(`Bem-vindo ${ctx.message.chat.first_name}`));

      bot.on('text', async (ctx) => {
        console.debug('**************************************************');
        console.debug('chat id ->', ctx.message.chat.id);

        const response = await text_message_broker(ctx.message);
        var [text, options] = response_parser(response);
        await ctx.reply(text, {
          reply_markup: {
            inline_keyboard: options,
          },
        });
      });

      bot.on('callback_query', async (ctx) => {
        console.debug('**************************************************');
        console.debug('chat id ->', ctx.callbackQuery.id);

        const response = await text_message_broker({
          chat: { id: ctx.callbackQuery.id, first_name: ctx.callbackQuery.from.first_name },
          text: ctx.callbackQuery.data,
        });
        var [text, options] = response_parser(response);
        await ctx.reply(text, {
          reply_markup: {
            inline_keyboard: options,
          },
        });
      });

      bot.on('voice', async (ctx) => {
        console.debug('**************************************************');
        console.debug('chat id ->', ctx.message.chat.id);

        const voice = ctx.message.voice;
        const fileLink = await ctx.telegram.getFileLink(voice.file_id);

        const response = await voice_message_broker(ctx.message, fileLink);
        var [text, options] = response_parser(response);
        await ctx.reply(text, {
          reply_markup: {
            inline_keyboard: options,
          },
        });
      });

      bot.launch();
    } catch (err) {
      console.error(err);
    }
  },
};
