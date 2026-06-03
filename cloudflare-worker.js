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
    const GAME_URL = env.GAME_URL || 'https://ais-pre-v6zarkuvyxohytr4laef7s-84066267023.europe-west1.run.app';
    const BOT_USERNAME = env.BOT_USERNAME || 'Game_Make100_bot';

    if (!BOT_TOKEN) {
      return new Response('Error: BOT_TOKEN is missing in Cloudflare Secrets', { status: 500 });
    }

    const TELEGRAM_API = `https://api.telegram.org/bot${BOT_TOKEN}`;

    // --- 1. Endpoint для установки рекордов ---
    if (request.method === 'POST' && pathname === '/api/set_score') {
      try {
        const data = await request.json();
        const { user_id, score, inline_message_id, chat_id, message_id } = data;

        const payload = { 
          user_id: Number(user_id), 
          score: Math.floor(Number(score)),
          force: true 
        };

        if (inline_message_id && inline_message_id !== 'null' && inline_message_id !== '') {
          payload.inline_message_id = String(inline_message_id);
        } else if (chat_id && message_id) {
          payload.chat_id = Number(chat_id);
          payload.message_id = Number(message_id);
        } else {
          return new Response(JSON.stringify({ error: 'Missing message identification' }), { status: 400 });
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

    // --- 2. Обработка Webhook (Команды и клики) ---
    if (request.method === 'POST') {
      try {
        const update = await request.json();

        // 1. Старт игры
        if (update.message?.text?.startsWith('/start')) {
          const chatId = update.message.chat.id;
          
          const sendResponse = await fetch(`${TELEGRAM_API}/sendGame`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              chat_id: chatId,
              game_short_name: GAME_SHORT_NAME
            })
          });

          const sendResult = await sendResponse.json();
          if (!sendResult.ok) {
            // Если игра не зарегистрирована в BotFather, отправим обычное сообщение с ошибкой
            await fetch(`${TELEGRAM_API}/sendMessage`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                chat_id: chatId,
                text: `Ошибка: Игра '${GAME_SHORT_NAME}' не найдена в этом боте. Зарегистрируйте её в @BotFather через /newgame.`
              })
            });
          }
        }

        // 1.5 Обработка Inline Query (для кнопки "Поделиться" в меню игры)
        if (update.inline_query) {
          await fetch(`${TELEGRAM_API}/answerInlineQuery`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              inline_query_id: update.inline_query.id,
              results: [
                {
                  type: 'game',
                  id: update.inline_query.id,
                  game_short_name: GAME_SHORT_NAME
                }
              ],
              cache_time: 0
            })
          });
        }

        // 2. Клик по кнопке "Играть"
        // Убираем излишне строгую проверку по имени, чтобы кнопка всегда срабатывала
        if (update.callback_query?.game_short_name) {
          const callbackQueryId = update.callback_query.id;
          const userId = update.callback_query.from.id;
          const inlineMessageId = update.callback_query.inline_message_id || '';
          const messageId = update.callback_query.message?.message_id || '';
          const chatId = update.callback_query.message?.chat?.id || '';
          
          const apiUrl = new URL(request.url).origin + '/api/set_score';
          
          // Тот самый формат ссылки, который мы проверили в тестовом боте
          const finalUrl = `${GAME_URL}?user_id=${userId}&inline_message_id=${inlineMessageId}&message_id=${messageId}&chat_id=${chatId}&bot=${BOT_USERNAME}&api=${encodeURIComponent(apiUrl)}`;
          
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
        return new Response('Webhook Error', { status: 500 });
      }
    }

    return new Response('Send POST request from Telegram', { status: 200 });
  }
};
