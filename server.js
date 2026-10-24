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

let orders = [];
let menuData = {
  "Донеры": [
    { id: 1, name_ru: "Донер Кебаб", desc_ru: "Сочный донер с овощами и соусом", price: 45000, img: "https://images.unsplash.com/photo-1529006557810-274b9b2fc783?w=400" },
    { id: 2, name_ru: "Донер Бургер", desc_ru: "Люля-кебаб, сюзьма, свежие овощи", price: 50000, img: "https://images.unsplash.com/photo-1568901346375-23c9450c58cd?w=400" }
  ],
  "Пиде": [
    { id: 3, name_ru: "Пиде с мясом", desc_ru: "Турецкая лодочка с говядиной", price: 55000, img: "https://images.unsplash.com/photo-1513104890138-7c749659a591?w=400" }
  ],
  "Напитки": [
    { id: 5, name_ru: "Айран", desc_ru: "Освежающий кисломолочный напиток", price: 12000, img: "https://images.unsplash.com/photo-1623065425906-c0d1d0c0c0c0?w=400" },
    { id: 6, name_ru: "Кола", desc_ru: "0.5 л, холодная", price: 10000, img: "https://images.unsplash.com/photo-1622483767028-3f66f32aef97?w=400" }
  ]
};

// Бот отвечает на кнопки статусов
bot.on('callback_query', async (query) => {
  if (!query.data.startsWith('st:')) return;
  const [_, oid, status] = query.data.split(':');
  const statusLabels = { preparing: '👨‍🍳 Готовится', delivering: '🚗 В пути', done: '✅ Доставлен' };
  await bot.answerCallbackQuery(query.id, { text: 'Статус обновлен!' });
  await bot.editMessageText(query.message.text + `\n\n<b>Статус: ${statusLabels[status]}</b>`, {
    chat_id: query.message.chat.id,
    message_id: query.message.message_id,
    parse_mode: 'HTML'
  });
});

app.get('/api/menu', (req, res) => res.json(menuData));

app.post('/api/menu/add', (req, res) => {
  const { cat, name_ru, desc_ru, price, img } = req.body;
  if (!menuData[cat]) menuData[cat] = [];
  const newItem = { id: Date.now(), name_ru, desc_ru, price, img };
  menuData[cat].push(newItem);
  res.json({ ok: true, item: newItem });
});

app.post('/api/menu/edit', (req, res) => {
  const { id, cat, name_ru, desc_ru, price, img } = req.body;
  for (const c in menuData) {
    const item = menuData[c].find(i => i.id == id);
    if (item) {
      if (c !== cat) {
        menuData[c] = menuData[c].filter(i => i.id != id);
        if (!menuData[cat]) menuData[cat] = [];
        menuData[cat].push({ id: Number(id), name_ru, desc_ru, price, img });
      } else {
        item.name_ru = name_ru; item.desc_ru = desc_ru; item.price = price; item.img = img;
      }
      return res.json({ ok: true });
    }
  }
  res.status(404).json({ error: 'Not found' });
});

app.delete('/api/menu/:id', (req, res) => {
  for (const c in menuData) menuData[c] = menuData[c].filter(i => i.id != req.params.id);
  res.json({ ok: true });
});

app.get('/api/orders', (req, res) => res.json(orders));

app.post('/api/order', async (req, res) => {
  try {
    const { name, phone, order_type, address, items, total } = req.body;
    const orderId = Math.floor(Math.random() * 100000);
    orders.push({ id: orderId, name, phone, order_type, address, items, total, status: 'new' });
    const itemsStr = items.map(i => `• ${i.name} x${i.qty} = ${(i.price * i.qty).toLocaleString()} сум`).join('\n');
    const text = `🔔 <b>НОВЫЙ ЗАКАЗ #${orderId}</b>\n\n👤 ${name}\n📞 ${phone}\n🚚 Доставка\n📍 ${address || '-'}\n\n${itemsStr}\n\n💰 <b>Итого: ${total.toLocaleString()} сум</b>`;
    await bot.sendMessage(GROUP_ID, text, {
      parse_mode: 'HTML',
      reply_markup: { inline_keyboard: [[{ text: "👨‍🍳 Готовится", callback_data: `st:${orderId}:preparing` }], [{ text: "🚗 В пути", callback_data: `st:${orderId}:delivering` }], [{ text: "✅ Доставлен", callback_data: `st:${orderId}:done` }]] }
    });
    res.json({ ok: true, id: orderId });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.use(express.static(__dirname));
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'index.html')));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
