import express from 'express';
import path from 'path';
import cors from 'cors';
import { createServer as createViteServer } from 'vite';
import TelegramBot from 'node-telegram-bot-api';

const PORT = 3000;
const GAME_URL = process.env.GAME_URL || "https://ais-pre-v6zarkuvyxohytr4laef7s-84066267023.europe-west1.run.app";

// Initialize Telegram Bot if token is provided
let bot: TelegramBot | null = null;
const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || process.env.BOT_TOKEN;

if (BOT_TOKEN) {
  bot = new TelegramBot(BOT_TOKEN, { polling: true });

  console.log(`Telegram bot started. Token: ${BOT_TOKEN.substring(0, 5)}...`);

  const GAME_SHORT_NAME = process.env.GAME_SHORT_NAME || "make100";
  const BOT_USERNAME = process.env.BOT_USERNAME || 'test_game_make100_bot';

  // Обработка /start: отправляем саму игру (HTML5 Game Platform)
  bot.onText(/\/start(.*)/, (msg) => {
    const chatId = msg.chat.id;
    console.log(`[Bot] /start received from ${chatId}`);
    
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

  bot.on('callback_query', (query) => {
    if (query.game_short_name === GAME_SHORT_NAME && bot) {
      const userId = query.from.id;
      const inlineMessageId = query.inline_message_id || '';
      const messageId = query.message?.message_id || '';
      const chatId = query.message?.chat?.id || '';
      const appUrl = process.env.APP_URL || `http://localhost:${PORT}`;
      
      try {
        const gameUrlObj = new URL(GAME_URL);
        gameUrlObj.searchParams.set('user_id', String(userId));
        gameUrlObj.searchParams.set('inline_message_id', String(inlineMessageId));
        gameUrlObj.searchParams.set('message_id', String(messageId));
        gameUrlObj.searchParams.set('chat_id', String(chatId));
        gameUrlObj.searchParams.set('bot', BOT_USERNAME);
        gameUrlObj.searchParams.set('api', `${appUrl}/api/set_score`);

        bot.answerCallbackQuery(query.id, { url: gameUrlObj.toString() }).catch(e => console.error('[Bot] answerCallbackQuery error:', e));
      } catch (err) {
        console.error('[Bot] Error creating game URL:', err);
        bot.answerCallbackQuery(query.id, { text: 'Ошибка при запуске игры. Попробуйте еще раз.' }).catch(e => console.error(e));
      }
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
  app.use(cors());
  app.use(express.json());

  app.post('/api/set_score', async (req, res) => {
    if (!bot) {
      console.error('[API] Attempted to set score but bot is not initialized');
      return res.status(500).json({ error: 'Bot is not running' });
    }
    
    try {
      const { user_id, score, inline_message_id, chat_id, message_id } = req.body;
      console.log(`[API] Setting score ${score} for user ${user_id}`);
      
      const opts: any = { force: true };
      
      if (inline_message_id) {
        opts.inline_message_id = inline_message_id;
      } else if (chat_id && message_id) {
        opts.chat_id = chat_id;
        opts.message_id = message_id;
      } else {
        throw new Error('Missing message identification parameters');
      }
      
      const result = await bot.setGameScore(user_id, score, opts);
      res.json({ ok: true, result });
    } catch (err: any) {
      console.error('[API] setGameScore Error:', err.message);
      res.status(500).json({ error: err.message });
    }
  });

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
