// Это готовый скрипт для Cloudflare Workers
// 1. Создайте Worker на dash.cloudflare.com
// 2. Вставьте этот код в worker.js (или index.js)
// 3. Добавьте Environment Variables (Settings -> Variables):
//    - TELEGRAM_BOT_TOKEN
//    - GAME_SHORT_NAME (например: make100)
//    - GAME_URL (по умолчанию подхватит https://gamemake100.pages.dev)
// 4. Зарегистрируйте вебхук (один раз), открыв в браузере ссылку:
//    https://api.telegram.org/bot<ВАШ_ТОКЕН>/setWebhook?url=<ССЫЛКА_НА_ВАШ_WORKER>

// Входная точка Cloudflare Worker
export default {
  async fetch(request, env, ctx) {
    // Настройка CORS для запросов от игры
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'POST, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type',
        }
      });
    }

    const { pathname } = new URL(request.url);
    const BOT_TOKEN = env.BOT_TOKEN || env.TELEGRAM_BOT_TOKEN;
    const GAME_SHORT_NAME = env.GAME_SHORT_NAME || 'make100';
    const GAME_URL = env.GAME_URL || 'https://gamemake100.pages.dev';

    if (!BOT_TOKEN) {
      return new Response('Bot token is missing in environment variables', { status: 500 });
    }

    const TELEGRAM_API = `https://api.telegram.org/bot${BOT_TOKEN}`;

    // --- 1. Endpoint для игры: Установка рекордов (setGameScore) ---
    if (request.method === 'POST' && pathname === '/set_score') {
      try {
        const data = await request.json();
        /*
          Ожидаемые параметры из базы данных/игры:
          - user_id (обязательно)
          - score (обязательно)
          - inline_message_id (если игра запущена в inline-режиме)
          - chat_id и message_id (если игра запущена в обычном чате)
        */
        const { user_id, score, inline_message_id, chat_id, message_id } = data;

        const payload = { 
          user_id: user_id, 
          score: score,
          force: true // Обновлять счет в любом случае
        };

        if (inline_message_id) {
          payload.inline_message_id = inline_message_id;
        } else {
          payload.chat_id = chat_id;
          payload.message_id = message_id;
        }

        const telegramResponse = await fetch(`${TELEGRAM_API}/setGameScore`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });

        const result = await telegramResponse.json();
        return new Response(JSON.stringify(result), {
          status: 200,
          headers: { 
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*' 
          }
        });
      } catch (err) {
        return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: {'Access-Control-Allow-Origin': '*'} });
      }
    }

    // --- 2. Endpoint для Telegram Webhook ---
    if (request.method === 'POST') {
      try {
        const update = await request.json();

        // Обработка команды /start
        if (update.message?.text?.startsWith('/start')) {
          const chatId = update.message.chat.id;
          
          await fetch(`${TELEGRAM_API}/sendGame`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              chat_id: chatId,
              game_short_name: GAME_SHORT_NAME
            })
          });
        }

        // Обработка нажатия кнопки "Играть"
        if (update.callback_query?.game_short_name === GAME_SHORT_NAME) {
          const callbackQueryId = update.callback_query.id;
          
          // Извлекаем параметры контекста для передачи в игру (для сохранения результатов)
          const userId = update.callback_query.from.id;
          const inlineMessageId = update.callback_query.inline_message_id || '';
          const messageId = update.callback_query.message?.message_id || '';
          const chatId = update.callback_query.message?.chat?.id || '';
          
          // Передаем параметры в URL, чтобы игра могла их использовать при вызове setGameScore
          const finalUrl = `${GAME_URL}?user_id=${userId}&inline_message_id=${inlineMessageId}&message_id=${messageId}&chat_id=${chatId}`;
          
          await fetch(`${TELEGRAM_API}/answerCallbackQuery`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              callback_query_id: callbackQueryId,
              url: finalUrl
            })
          });
        }

        return new Response('OK', { status: 200 });
      } catch (err) {
        console.error(err);
        return new Response('Webhook Error', { status: 500 });
      }
    }

    return new Response('Send POST request from Telegram', { status: 200 });
  }
};
