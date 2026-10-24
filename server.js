const express = require('express');
const cors = require('cors');
const TelegramBot = require('node-telegram-bot-api');
const path = require('path');

const app = express();
app.use(cors());
app.use(express.json());

const BOT_TOKEN = process.env.BOT_TOKEN || '8344334859:AAF-cNVL_-f8XnD1Ewrs6VvIFAuuBk5xKCg';
const GROUP_ID = process.env.GROUP_ID || '-1004460505310';

const bot = new TelegramBot(BOT_TOKEN, { polling: true });

// Бот отвечает на кнопки статусов в группе
bot.on('callback_query', async (query) => {
  const [_, oid, status] = query.data.split(':');
  const statusLabels = { preparing: '👨‍🍳 Готовится', delivering: '🚗 В пути', done: '✅ Доставлен' };
  await bot.answerCallbackQuery(query.id, { text: 'Статус обновлен!' });
  await bot.editMessageText(query.message.text + `\n\n<b>Статус: ${statusLabels[status]}</b>`, {
    chat_id: query.message.chat.id,
    message_id: query.message.message_id,
    parse_mode: 'HTML'
  });
});

// Вход без базы данных (пускает всех)
app.post('/api/login', (req, res) => {
  const { login } = req.body;
  res.json({ token: "test-token", user: { login: login || "admin", role: "admin" } });
});

// Меню (встроенное)
app.get('/api/menu', (req, res) => {
  res.json({
    "Донеры": [
      { id: 1, name_ru: "Донер Кебаб", desc_ru: "Сочный донер", price: 45000, img: "https://images.unsplash.com/photo-1529006557810-274b9b2fc783?w=300" },
      { id: 2, name_ru: "Донер Бургер", desc_ru: "Люля и сюзьма", price: 50000, img: "https://images.unsplash.com/photo-1568901346375-23c9450c58cd?w=300" }
    ],
    "Пиде": [
      { id: 3, name_ru: "Пиде с мясом", desc_ru: "Турецкая лодочка", price: 55000, img: "https://images.unsplash.com/photo-1513104890138-7c749659a591?w=300" }
    ],
    "Салаты": [
      { id: 4, name_ru: "Чобан", desc_ru: "Помидоры, огурцы", price: 35000, img: "https://images.unsplash.com/photo-1512621776951-a57141f2eefd?w=300" }
    ]
  });
});

// Прием заказа
app.post('/api/order', async (req, res) => {
  try {
    const { name, phone, order_type, address, items, total } = req.body;
    const orderId = Math.floor(Math.random() * 100000);
    
    const itemsStr = items.map(i => `• ${i.name} x${i.qty} = ${(i.price * i.qty).toLocaleString()} сум`).join('\n');
    const text = `🔔 <b>НОВЫЙ ЗАКАЗ #${orderId}</b>\n\n👤 ${name}\n📞 ${phone}\n🚚 ${order_type === 'delivery' ? 'Доставка' : 'Самовывоз'}\n📍 ${address || '-'}\n\n${itemsStr}\n\n💰 <b>Итого: ${total.toLocaleString()} сум</b>`;

    await bot.sendMessage(GROUP_ID, text, {
      parse_mode: 'HTML',
      reply_markup: {
        inline_keyboard: [
          [{ text: "👨‍🍳 Готовится", callback_data: `st:${orderId}:preparing` }],
          [{ text: "🚗 В пути", callback_data: `st:${orderId}:delivering` }],
          [{ text: "✅ Доставлен", callback_data: `st:${orderId}:done` }]
        ]
      }
    });

    res.json({ ok: true, id: orderId });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message });
  }
});

app.use(express.static(__dirname));
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'index.html')));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
