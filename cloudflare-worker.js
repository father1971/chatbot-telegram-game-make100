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
    const BOT_USERNAME = env.BOT_USERNAME || 'Game_Make100_bot'; // <--- ПРОДАКШЕН ИМЯ БОТА

    if (!BOT_TOKEN) {
      return new Response('Bot token is missing in environment variables', { status: 500 });
    }

    const TELEGRAM_API = `https://api.telegram.org/bot${BOT_TOKEN}`;

    // --- 1. Endpoint для игры: Установка рекордов (setGameScore) ---
    if (request.method === 'POST' && pathname === '/api/set_score') {
      try {
        const data = await request.json();
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
          
          const userId = update.callback_query.from.id;
          const inlineMessageId = update.callback_query.inline_message_id || '';
          const messageId = update.callback_query.message?.message_id || '';
          const chatId = update.callback_query.message?.chat?.id || '';
          
          // В Worker.js API URL будет ссылаться на сам воркер
          const apiUrl = new URL(request.url).origin + '/api/set_score';
          
          try {
            const gameUrlObj = new URL(GAME_URL);
            gameUrlObj.searchParams.set('user_id', String(userId));
            gameUrlObj.searchParams.set('inline_message_id', String(inlineMessageId));
            gameUrlObj.searchParams.set('message_id', String(messageId));
            gameUrlObj.searchParams.set('chat_id', String(chatId));
            gameUrlObj.searchParams.set('bot', BOT_USERNAME);
            gameUrlObj.searchParams.set('api', apiUrl);

            await fetch(`${TELEGRAM_API}/answerCallbackQuery`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                callback_query_id: callbackQueryId,
                url: gameUrlObj.toString()
              })
            });
          } catch (urlErr) {
            console.error('Error building game URL:', urlErr);
            await fetch(`${TELEGRAM_API}/answerCallbackQuery`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                callback_query_id: callbackQueryId,
                text: 'Ошибка конфигурации игры. Проверьте GAME_URL.'
              })
            });
          }
        }

        return new Response('OK', { status: 200 });
      } catch (err) {
        console.error('Webhook Error:', err);
        return new Response('Webhook Error', { status: 500 });
      }
    }

    return new Response('Send POST request from Telegram', { status: 200 });
  }
};
