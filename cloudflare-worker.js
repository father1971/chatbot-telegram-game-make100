// Это готовый скрипт для Cloudflare Workers
// 1. Создайте Worker на dash.cloudflare.com
// 2. Вставьте этот код в worker.js (или index.js)
// 3. Добавьте Environment Variables (Settings -> Variables):
//    - TELEGRAM_BOT_TOKEN
//    - GAME_SHORT_NAME (например: make100)
//    - GAME_URL (по умолчанию подхватит https://gamemake100.pages.dev)
// 4. Зарегистрируйте вебхук (один раз), открыв в браузере ссылку:
//    https://api.telegram.org/bot<ВАШ_ТОКЕН>/setWebhook?url=<ССЫЛКА_НА_ВАШ_WORKER>

export default {
  async fetch(request, env, ctx) {
    // Проверка, что это POST запрос (Telegram всегда присылает POST)
    if (request.method !== 'POST') {
      return new Response('Telegram Bot Webhook is running! Please configure Telegram to send POST requests here.', { status: 200 });
    }

    const TELEGRAM_TOKEN = env.TELEGRAM_BOT_TOKEN;
    const GAME_SHORT_NAME = env.GAME_SHORT_NAME || 'make100'; // Используйте ваше short_name
    const GAME_URL = env.GAME_URL || 'https://gamemake100.pages.dev';

    if (!TELEGRAM_TOKEN) {
      return new Response('Bot token is not configured in Cloudflare Variables.', { status: 500 });
    }

    const TELEGRAM_API = `https://api.telegram.org/bot${TELEGRAM_TOKEN}`;

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
      if (update.callback_query?.game_short_name) {
        const callbackQueryId = update.callback_query.id;
        
        await fetch(`${TELEGRAM_API}/answerCallbackQuery`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            callback_query_id: callbackQueryId,
            url: GAME_URL
          })
        });
      }

      // Обязательно возвращаем 200 OK для Telegram, иначе он будет бесконечно повторять запрос
      return new Response('OK', { status: 200 });
    } catch (err) {
      console.error(err);
      return new Response('Error handling update', { status: 500 });
    }
  }
};
