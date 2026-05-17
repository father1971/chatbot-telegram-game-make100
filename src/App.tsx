/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useState } from 'react';
import { Bot, Gamepad2, KeyRound, AlertCircle, CheckCircle2, CloudLightning } from 'lucide-react';

export default function App() {
  const [status, setStatus] = useState<{status: string; botRunning: boolean; gameUrl: string} | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/status')
      .then(res => res.json())
      .then(data => {
        setStatus(data);
        setLoading(false);
      })
      .catch(console.error);
  }, []);

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-6 font-sans">
      <div className="max-w-2xl w-full bg-white rounded-2xl shadow-xl overflow-hidden">
        <div className="bg-blue-600 p-8 text-white flex flex-col items-center">
          <Gamepad2 className="w-16 h-16 mb-4" />
          <h1 className="text-3xl font-bold tracking-tight">Сервер Telegram-игры</h1>
          <p className="mt-2 text-blue-100 text-center">
            Интеграция хостинга для <a href="https://gamemake100.pages.dev" className="underline hover:text-white" target="_blank" rel="noreferrer">GameMake100</a>
          </p>
        </div>
        
        <div className="p-8">
          <div className="flex items-center justify-between mb-8 pb-8 border-b border-gray-100">
            <div>
              <h2 className="text-xl font-semibold text-gray-800">Статус бота</h2>
              <p className="text-sm text-gray-500 mt-1">Подключен ли ваш Telegram-бот и отвечает ли он?</p>
            </div>
            
            {loading ? (
              <div className="animate-pulse bg-gray-200 h-10 w-32 rounded-full"></div>
            ) : status?.botRunning ? (
              <div className="flex items-center space-x-2 bg-green-50 text-green-700 px-4 py-2 rounded-full font-medium">
                <CheckCircle2 className="w-5 h-5 text-green-500" />
                <span>Работает</span>
              </div>
            ) : (
              <div className="flex items-center space-x-2 bg-amber-50 text-amber-700 px-4 py-2 rounded-full font-medium">
                <AlertCircle className="w-5 h-5 text-amber-500" />
                <span>Остановлен</span>
              </div>
            )}
          </div>

          {!status?.botRunning && !loading && (
            <div className="bg-amber-50 rounded-xl p-6 mb-8 border border-amber-100">
              <h3 className="text-lg font-semibold text-amber-800 flex items-center mb-3">
                <KeyRound className="w-5 h-5 mr-2" />
                Отсутствует API токен
              </h3>
              <p className="text-amber-700 mb-4">
                Бот не работает, потому что отсутствует переменная окружения <strong>TELEGRAM_BOT_TOKEN</strong>.
              </p>
              
              <ol className="list-decimal list-inside space-y-2 text-amber-900 bg-amber-100/50 p-4 rounded-lg text-sm">
                <li>Перейдите в Telegram и найдите <strong>@BotFather</strong></li>
                <li>Создайте нового бота или выберите существующего</li>
                <li>Скопируйте API токен, предоставленный BotFather</li>
                <li>Перейдите в панель <strong>Settings &gt; Secrets</strong> в Google AI Studio</li>
                <li>Добавьте новый секрет с именем <code>TELEGRAM_BOT_TOKEN</code> и вашим скопированным токеном</li>
              </ol>
            </div>
          )}

          <div className="space-y-6">
            <h3 className="text-xl font-semibold text-gray-800 border-b pb-2">Как это работает</h3>
            
            <div className="flex items-start">
              <div className="bg-blue-100 text-blue-600 rounded-full w-8 h-8 flex items-center justify-center shrink-0 mr-4 font-bold">1</div>
              <div>
                <h4 className="font-semibold text-gray-800">Опрос бота</h4>
                <p className="text-gray-600 text-sm mt-1">Сервер Node.js подключается к Telegram через long-polling. Он ожидает команды <code>/start</code> от любого пользователя.</p>
              </div>
            </div>

            <div className="flex items-start">
              <div className="bg-blue-100 text-blue-600 rounded-full w-8 h-8 flex items-center justify-center shrink-0 mr-4 font-bold">2</div>
              <div>
                <h4 className="font-semibold text-gray-800">Telegram Games</h4>
                <p className="text-gray-600 text-sm mt-1">Вместо Web App кнопки мы отправляем саму игру через <code>sendGame</code> (название игры: make100).</p>
              </div>
            </div>

            <div className="flex items-start">
              <div className="bg-blue-100 text-blue-600 rounded-full w-8 h-8 flex items-center justify-center shrink-0 mr-4 font-bold">3</div>
              <div>
                <h4 className="font-semibold text-gray-800">Запуск игры</h4>
                <p className="text-gray-600 text-sm mt-1">При нажатии "Играть", Telegram создает <code>callback_query</code>, и наш сервер отвечает URL-адресом <code>{status?.gameUrl || 'https://gamemake100.pages.dev'}</code>, правильно инициализируя подпись Telegram.</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
