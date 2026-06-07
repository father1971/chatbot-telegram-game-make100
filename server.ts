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

  // Регистрируем глобальное меню команд бота (синяя кнопка Menu в углу экрана)
  bot.setMyCommands([
    { command: 'start', description: '🎮 Запустить игру и открыть меню' },
    { command: 'help', description: 'ℹ️ Инструкция по игре' },
    { command: 'feedback', description: '💬 Написать отзыв / Обратная связь' }
  ]).then(() => {
    console.log('Bot commands registered successfully');
  }).catch((err) => {
    console.error('Failed to register bot commands:', err.message);
  });

  const defaultKeyboard = {
    keyboard: [
      [{ text: "🎮 Играть" }],
      [{ text: "ℹ️ Помощь" }, { text: "💬 Обратная связь" }]
    ],
    resize_keyboard: true,
    one_time_keyboard: false
  };

  // Функция для отправки помощи
  const sendHelpMessage = (chatId: number) => {
    const helpText = `🎯 <b>Цель игры:</b>\n` +
      `Получить в ответе ровно 100, используя 6 заданных цифр, которые вы видите на билете или автомобильном номере.\n\n` +
      `🧩 <b>Основные правила:</b>\n` +
      `1. Порядок цифр менять нельзя! Они должны идти точно так же, как написаны на экране.\n` +
      `2. Между цифрами, а также перед первой и после последней цифры есть пустые ячейки (слоты). Нажмите на любую ячейку, чтобы выбрать её (она подсветится оранжевым цветом).\n` +
      `3. Используйте клавиатуру внизу экрана, чтобы вставлять в ячейки математические знаки: +, -, *, /.\n` +
      `4. Склейка чисел. Если вы оставите ячейку между двумя цифрами пустой, они превратятся в двузначное (или трехзначное) число. Например, если между 9 и 8 ничего не поставить, они станут числом 98.\n` +
      `5. Скобки. Доступны скобки ( и ). Используйте их, чтобы менять порядок действий (сначала программа считает то, что в скобках, потом умножает/делит, а затем складывает/вычитает).\n` +
      `6. Десятичные дроби. Если нужна дробь, используйте запятую ,. Например, 1, 5 склеенное через запятую даст 1.5.\n\n` +
      `🎮 <b>Игровой процесс:</b>\n` +
      `• Приложение в реальном времени считает результат вашего выражения.\n` +
      `• Как только программа увидит, что получилось ровно 100 — всё автоматически вспыхнет зеленым цветом, и вы перейдете на следующий уровень!\n` +
      `• Застряли?\n` +
      `  - Нажмите кнопку со стрелочками «Пропустить», чтобы получить другой номер.\n` +
      `  - Если нет идей, жмите кнопку «Подсказка» (лампочка) — игра сама подставит знаки и покажет решение (но очки за этот билет не начислятся).\n` +
      `  - Иногда попадаются билеты, из которых невозможно собрать 100. Если вы нажмете на «Подсказку» и игра покажет красную надпись «У этой комбинации нет решения», просто жмите кнопку пропустить!`;
    
    bot?.sendMessage(chatId, helpText, { 
      parse_mode: 'HTML',
      reply_markup: defaultKeyboard
    }).catch(err => console.error('Error sendHelpMessage:', err.message));
  };

  let dynamicAdminChatId: number | null = null;

  // Функция для отправки отзыва администратору
  const sendFeedbackToAdmin = (msg: TelegramBot.Message, text: string) => {
    const chatId = msg.chat.id;
    const username = msg.from?.username ? `@${msg.from.username}` : 'нет';
    const firstName = msg.from?.first_name || '';
    const lastName = msg.from?.last_name || '';
    const userId = msg.from?.id || 'неизвестно';
    const name = [firstName, lastName].filter(Boolean).join(' ') || 'Пользователь';

    const feedbackMsg = `📝 <b>Новый отзыв!</b>\n\n` +
      `👤 <b>Отправитель:</b> ${name} (${username})\n` +
      `🆔 <b>User ID:</b> <code>${userId}</code>\n\n` +
      `💬 <b>Текст отзыва:</b>\n${text}`;

    // Отправляем пользователю подтверждение получения отзыва с клавиатурой
    bot?.sendMessage(chatId, "✅ Спасибо за ваш отзыв! Мы обязательно его прочтем и сделаем игру ещё лучше.", {
      reply_markup: defaultKeyboard
    }).catch(err => {
      console.error('Ошибка отправки подтверждения пользователю:', err.message);
    });

    // Пытаемся получить chat ID администратора из env или использовать установленный динамически через /setadmin
    const envAdminId = process.env.ADMIN_CHAT_ID;
    const targetAdminId = envAdminId ? Number(envAdminId) : dynamicAdminChatId;

    if (targetAdminId) {
      bot?.sendMessage(targetAdminId, feedbackMsg, { parse_mode: 'HTML' }).catch(err => {
        console.error('Ошибка отправки отзыва администратору:', err.message);
      });
    } else {
      console.log(`[Feedback] в консоли от ${name} (${username}): ${text}`);
      console.warn('ADMIN_CHAT_ID не настроен в .env, и никто не выполнил команду /setadmin.');
      
      // Даем подсказку разработчику при локальном/предпросмотровом запуске, как получать эти отзывы прямо в Telegram
      bot?.sendMessage(chatId, `💡 <b>Подсказка разработчику:</b>\nОтзыв сохранен в логах. Чтобы получать эти отзывы прямо в этом чате в Telegram, напишите команду:\n<code>/setadmin</code>`, { 
        parse_mode: 'HTML',
        reply_markup: defaultKeyboard
      }).catch(err => {
        console.error('Ошибка отправки подсказки разработчику:', err.message);
      });
    }
  };

  // Функция для отправки инструкции по отзыву
  const sendFeedbackInstructions = (chatId: number) => {
    const feedbackText = `💬 *Обратная связь*\n\n` +
      `Мы ценим ваше мнение! Чтобы отправить нам отзыв или предложение, воспользуйтесь одним из способов:\n\n` +
      `1. Напишите команду: \`/feedback ваш текст\`\n` +
      `2. Или просто отправьте сообщение, начинающееся со слов *Обратная связь* или *Отзыв* (например, "Обратная связь: отличная игра!").`;
    
    bot?.sendMessage(chatId, feedbackText, { 
      parse_mode: 'Markdown',
      reply_markup: defaultKeyboard
    }).catch(err => console.error('Error sendFeedbackInstructions:', err.message));
  };

  // Обработка /start: отправляем саму игру и добавляем клавиатуру
  bot.onText(/\/start(.*)/, (msg) => {
    const chatId = msg.chat.id;
    console.log(`[Bot] /start received from ${chatId}`);
    
    bot?.sendMessage(chatId, "Добро пожаловать в игру Make100! 🎮\nВыберите кнопку на клавиатуре ниже, чтобы играть или получить информацию:", {
      reply_markup: defaultKeyboard
    }).then(() => {
      // Отправляем карточку игры вслед за клавиатурой
      bot?.sendGame(chatId, GAME_SHORT_NAME).catch((err) => {
          console.error('Ошибка sendGame:', err.message);
          bot?.sendMessage(chatId, `Ошибка запуска игры "${GAME_SHORT_NAME}". Убедитесь, что игра зарегистрирована в @BotFather через /newgame.`);
      });
    }).catch(err => {
      console.error('Ошибка отправки приветствия:', err.message);
    });
  });

  // Обработка /help
  bot.onText(/\/help/, (msg) => {
    sendHelpMessage(msg.chat.id);
  });

  // Обработка /setadmin
  bot.onText(/\/setadmin/, (msg) => {
    const chatId = msg.chat.id;
    dynamicAdminChatId = chatId;
    bot?.sendMessage(chatId, `👑 <b>Вы успешно зарегистрированы как администратор бота!</b>\n\nТеперь все отзывы пользователей будут приходить вам прямо сюда в этот чат.\n\n<i>(Примечание: для постоянного сохранения добавьте переменную окружения ADMIN_CHAT_ID = ${chatId} в настройках приложения)</i>`, { 
      parse_mode: 'HTML',
      reply_markup: defaultKeyboard
    }).catch(err => {
      console.error('Ошибка отправки сообщения о регистрации админа:', err.message);
    });
  });

  // Обработка /feedback
  bot.onText(/\/feedback(?:\s+(.+))?/, (msg, match) => {
    const chatId = msg.chat.id;
    const text = match ? match[1] : null;

    if (text && text.trim()) {
      sendFeedbackToAdmin(msg, text);
    } else {
      sendFeedbackInstructions(chatId);
    }
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

  // Общий обработчик сообщений
  bot.on('message', (msg) => {
    if (!msg.text) return;

    const text = msg.text.trim();
    const chatId = msg.chat.id;

    // Пропускаем встроенные команды, они обрабатываются через onText
    if (text.startsWith('/start') || text.startsWith('/help') || text.startsWith('/feedback')) {
      return;
    }

    if (text === "🎮 Играть") {
      bot?.sendGame(chatId, GAME_SHORT_NAME).catch((err) => {
          console.error('Ошибка sendGame:', err.message);
          bot?.sendMessage(chatId, `Ошибка запуска игры "${GAME_SHORT_NAME}". Убедитесь, что игра зарегистрирована в @BotFather через /newgame.`, {
            reply_markup: defaultKeyboard
          });
      });
    } else if (text === "ℹ️ Помощь") {
      sendHelpMessage(chatId);
    } else if (text === "💬 Обратная связь") {
      sendFeedbackInstructions(chatId);
    } else if (text.toLowerCase().startsWith("отзыв") || text.toLowerCase().startsWith("обратная связь")) {
      let feedbackContent = '';
      if (text.toLowerCase().startsWith("отзыв")) {
        feedbackContent = text.substring(5).replace(/^[:\s]+/, '');
      } else {
        feedbackContent = text.substring(14).replace(/^[:\s]+/, '');
      }

      if (feedbackContent) {
        sendFeedbackToAdmin(msg, feedbackContent);
      } else {
        sendFeedbackInstructions(chatId);
      }
    } else {
      bot?.sendMessage(chatId, "Введите /start, чтобы открыть меню игры! 🎮\nИли нажмите кнопку «Помощь» / «Обратная связь».", {
        reply_markup: defaultKeyboard
      });
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
