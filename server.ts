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
        bot?.sendMessage(chatId, `Ошибка запуска игры "${GAME_SHORT_NAME}". Убедитесь, что игра зарегистрирована в @BotFather через /newgame.`);
    });
  });

  // Правильный обработчик Inline Query для передачи КАРТОЧКИ ИГРЫ
  bot.on('inline_query', (query) => {
    bot?.answerInlineQuery(query.id, [
      {
        type: 'game',
        id: query.id,
        game_short_name: GAME_SHORT_NAME
      }
    ], { cache_time: 0 }).catch(e => console.error('Inline Query Error:', e));
  });

  bot.on('callback_query', (query) => {
    if (query.game_short_name === GAME_SHORT_NAME && bot) {
      const userId = query.from.id;
      const inlineMessageId = query.inline_message_id || '';
      const messageId = query.message?.message_id || '';
      const chatId = query.message?.chat?.id || '';
      const appUrl = process.env.APP_URL || `http://localhost:${PORT}`;
      
      // Передаем параметры в URL игры (подтвержденный рабочий способ)
      const finalUrl = `${GAME_URL}?user_id=${userId}&inline_message_id=${inlineMessageId}&message_id=${messageId}&chat_id=${chatId}&bot=${BOT_USERNAME}&api=${encodeURIComponent(appUrl + '/api/set_score')}`;
      
      bot.answerCallbackQuery(query.id, { url: finalUrl }).catch(e => console.error('Error answering query:', e));
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
    if (!bot) return res.status(500).json({ error: 'Bot is not running' });
    
    try {
      const { user_id, score, inline_message_id, chat_id, message_id } = req.body;
      const opts: any = { force: true };
      
      const parsedUserId = Number(user_id);
      const parsedScore = Math.floor(Number(score));

      if (isNaN(parsedUserId) || isNaN(parsedScore)) {
        return res.status(400).json({ error: 'user_id and score must be valid numbers' });
      }

      if (inline_message_id && inline_message_id !== 'null' && inline_message_id !== '') {
        opts.inline_message_id = String(inline_message_id);
      } else if (chat_id && message_id) {
        opts.chat_id = Number(chat_id);
        opts.message_id = Number(message_id);
      } else {
        return res.status(400).json({ error: 'Missing message ID or inline_message_id' });
      }
      
      const result = await bot.setGameScore(parsedUserId, parsedScore, opts);
      res.json(result);
    } catch (err: any) {
      console.error('setGameScore Error:', err);
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
