import express from 'express';
import path from 'path';
import { createServer as createViteServer } from 'vite';
import TelegramBot from 'node-telegram-bot-api';

const PORT = 3000;
const GAME_URL = process.env.GAME_URL || "https://gamemake100.pages.dev";

// Initialize Telegram Bot if token is provided
let bot: TelegramBot | null = null;

if (process.env.TELEGRAM_BOT_TOKEN) {
  bot = new TelegramBot(process.env.TELEGRAM_BOT_TOKEN, { polling: true });

  console.log('Telegram bot started and polling...');

  const GAME_SHORT_NAME = process.env.GAME_SHORT_NAME || "make100";

  // Обработка /start: отправляем саму игру (HTML5 Game Platform)
  bot.onText(/\/start(.*)/, (msg) => {
    const chatId = msg.chat.id;
    
    bot?.sendGame(chatId, GAME_SHORT_NAME).catch((err) => {
        console.error('Ошибка sendGame:', err.message);
        bot?.sendMessage(chatId, `Ошибка запуска игры "${GAME_SHORT_NAME}". Убедитесь, что игра зарегистрирована в @BotFather через /newgame.`, {
            reply_markup: {
                inline_keyboard: [
                  [
                    {
                      text: '🌐 Играть в браузере',
                      url: GAME_URL,
                    }
                  ]
                ]
            }
        });
    });
  });

  // Handle Game Callback Query
  // Note: If you registered a game using BotFather (/newgame), passing the game short name, 
  // Telegram expects you to answer the callback query with the game's URL.
  bot.on('callback_query', (query) => {
    if (query.game_short_name && bot) {
      bot.answerCallbackQuery(query.id, { url: GAME_URL });
    }
  });

  // Catch-all message handler (optional)
  bot.on('message', (msg) => {
    if (msg.text && !msg.text.startsWith('/start')) {
      const chatId = msg.chat.id;
      bot?.sendMessage(chatId, "Введите /start, чтобы начать игру! 🎮");
    }
  });

  bot.on('polling_error', (error) => {
    console.error('Polling error:', error.message);
  });

} else {
  console.warn('TELEGRAM_BOT_TOKEN is missing. Bot is not running.');
}

async function startServer() {
  const app = express();

  app.get('/api/status', (req, res) => {
    res.json({
      status: 'ok',
      botRunning: !!bot,
      gameUrl: GAME_URL
    });
  });

  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
