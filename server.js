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

// Временная база в памяти (потом можно подключить MongoDB)
let orders = [];

app.post('/api/order', async (req, res) => {
  try {
    const { name, phone, order_type, address, items, total } = req.body;
    const orderId = Math.floor(Math.random() * 100000);
    
    orders.push({ id: orderId, name, phone, order_type, address, items, total });

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

app.get('/api/login', (req, res) => {
  res.json({ token: "test-token", user: { login: "admin", role: "admin" } });
});

app.use(express.static(__dirname));
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'index.html')));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
