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

    // --- 1. Endpoint для установки рекордов & /setup ---
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

    const cleanPath = pathname.replace(/\/$/, '');
    if (request.method === 'GET' && (cleanPath === '' || cleanPath === '/setup')) {
      try {
        const commandsResponse = await fetch(`${TELEGRAM_API}/setMyCommands`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            commands: [
              { command: 'start', description: '🎮 Запустить игру и открыть меню' },
              { command: 'help', description: 'ℹ️ Инструкция по игре' },
              { command: 'feedback', description: '💬 Написать отзыв / Обратная связь' }
            ]
          })
        });
        const commandsResult = await commandsResponse.json();

        let webhookResult = null;
        const workerUrl = new URL(request.url).origin;
        if (workerUrl && !workerUrl.includes('localhost') && !workerUrl.includes('127.0.0.1')) {
          const webhookResp = await fetch(`${TELEGRAM_API}/setWebhook`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ url: workerUrl })
          });
          webhookResult = await webhookResp.json();
        }

        return new Response(JSON.stringify({
          success: true,
          message: 'Setup completed successfully!',
          setMyCommands: commandsResult,
          setWebhook: webhookResult,
          info: {
            gameShortName: GAME_SHORT_NAME,
            botUsername: BOT_USERNAME,
            workerUrl: workerUrl
          }
        }, null, 2), {
          status: 200,
          headers: { 'Content-Type': 'application/json' }
        });
      } catch (err) {
        return new Response(JSON.stringify({ success: false, error: err.message }), {
          status: 500,
          headers: { 'Content-Type': 'application/json' }
        });
      }
    }

    // --- 2. Обработка Webhook (Команды и клики) ---
    if (request.method === 'POST') {
      try {
        const update = await request.json();

        // 1. Обработка входящих текстовых сообщений
        if (update.message) {
          const chatId = update.message.chat.id;
          const text = update.message.text ? update.message.text.trim() : '';

          const defaultKeyboard = {
            keyboard: [
              [{ text: "🎮 Играть" }],
              [{ text: "ℹ️ Помощь" }, { text: "💬 Обратная связь" }]
            ],
            resize_keyboard: true,
            one_time_keyboard: false
          };

          const sendMessage = async (targetId, messageText, extra = {}) => {
            return fetch(`${TELEGRAM_API}/sendMessage`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                chat_id: targetId,
                text: messageText,
                ...extra
              })
            });
          };

          const sendHelpMessage = async (targetId) => {
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

            await sendMessage(targetId, helpText, { 
              parse_mode: 'HTML',
              reply_markup: defaultKeyboard
            });
          };

          const sendFeedbackInstructions = async (targetId) => {
            const feedbackText = `💬 *Обратная связь*\n\n` +
              `Мы ценим ваше мнение! Чтобы отправить нам отзыв или предложение, воспользуйтесь одним из способов:\n\n` +
              `1. Напишите команду: \`/feedback ваш текст\`\n` +
              `2. Или просто отправьте сообщение, начинающееся со слов *Обратная связь* или *Отзыв* (например, "Обратная связь: отличная игра!").`;
            
            await sendMessage(targetId, feedbackText, { 
              parse_mode: 'Markdown',
              reply_markup: defaultKeyboard
            });
          };

          const sendFeedbackToAdmin = async (msg, feedbackContent) => {
            const username = msg.from?.username ? `@${msg.from.username}` : 'нет';
            const firstName = msg.from?.first_name || '';
            const lastName = msg.from?.last_name || '';
            const userId = msg.from?.id || 'неизвестно';
            const name = [firstName, lastName].filter(Boolean).join(' ') || 'Пользователь';

            const feedbackMsg = `📝 <b>Новый отзыв!</b>\n\n` +
              `👤 <b>Отправитель:</b> ${name} (${username})\n` +
              `🆔 <b>User ID:</b> <code>${userId}</code>\n\n` +
              `💬 <b>Текст отзыва:</b>\n${feedbackContent}`;

            // Отправляем пользователю подтверждение получения отзыва
            await sendMessage(chatId, "✅ Спасибо за ваш отзыв! Мы обязательно его прочтем и сделаем игру ещё лучше.", {
              reply_markup: defaultKeyboard
            });

            const targetAdminId = env.ADMIN_CHAT_ID;
            if (targetAdminId) {
              await sendMessage(Number(targetAdminId), feedbackMsg, { parse_mode: 'HTML' });
            }
          };

          if (text.startsWith('/start')) {
            // Зарегистрируем глобальные команды при вызове /start
            ctx.waitUntil(
              fetch(`${TELEGRAM_API}/setMyCommands`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  commands: [
                    { command: 'start', description: '🎮 Запустить игру и открыть меню' },
                    { command: 'help', description: 'ℹ️ Инструкция по игре' },
                    { command: 'feedback', description: '💬 Написать отзыв / Обратная связь' }
                  ]
                })
              }).catch(() => {})
            );

            // Отправляем приветствие с меню
            await sendMessage(chatId, "Добро пожаловать в игру Make100! 🎮\nВыберите кнопку на клавиатуре ниже, чтобы играть или получить информацию:", {
              reply_markup: defaultKeyboard
            });

            // Отправляем карточку игры
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
              await sendMessage(chatId, `Ошибка: Игра '${GAME_SHORT_NAME}' не найдена в этом боте. Зарегистрируйте её в @BotFather через /newgame.`, {
                reply_markup: defaultKeyboard
              });
            }
          } else if (text.startsWith('/help') || text === "ℹ️ Помощь") {
            await sendHelpMessage(chatId);
          } else if (text === "💬 Обратная связь") {
            await sendFeedbackInstructions(chatId);
          } else if (text.startsWith('/setadmin')) {
            const adminMessage = `👑 <b>Команда /setadmin получена!</b>\n\n` +
              `Ваш Telegram ID чата: <code>${chatId}</code>\n\n` +
              `Так как ваш рабочий бот запущен на платформе Cloudflare (которая работает без постоянной памяти), динамическая регистрация через чат не сохраняется автоматически.\n\n` +
              `<b>Чтобы отзывы начали приходить прямо сюда в этот чат:</b>\n` +
              `Добавьте в настройки вашего Cloudflare Worker переменную окружения:\n` +
              `<code>ADMIN_CHAT_ID</code> со значением <code>${chatId}</code>\n\n` +
              `После добавления переменной, все отзывы будут мгновенно присылаться вам сюда!`;

            await sendMessage(chatId, adminMessage, {
              parse_mode: 'HTML',
              reply_markup: defaultKeyboard
            });
          } else if (text.startsWith('/feedback')) {
            const feedbackText = text.substring(9).trim();
            if (feedbackText) {
              await sendFeedbackToAdmin(update.message, feedbackText);
            } else {
              await sendFeedbackInstructions(chatId);
            }
          } else if (text === "🎮 Играть") {
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
              await sendMessage(chatId, `Ошибка: Игра '${GAME_SHORT_NAME}' не найдена в этом боте. Зарегистрируйте её в @BotFather через /newgame.`, {
                reply_markup: defaultKeyboard
              });
            }
          } else if (text.toLowerCase().startsWith("отзыв") || text.toLowerCase().startsWith("обратная связь")) {
            let feedbackContent = '';
            if (text.toLowerCase().startsWith("отзыв")) {
              feedbackContent = text.substring(5).replace(/^[:\s]+/, '');
            } else {
              feedbackContent = text.substring(14).replace(/^[:\s]+/, '');
            }

            if (feedbackContent) {
              await sendFeedbackToAdmin(update.message, feedbackContent);
            } else {
              await sendFeedbackInstructions(chatId);
            }
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
