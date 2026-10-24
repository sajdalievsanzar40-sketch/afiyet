import os, asyncio, json, sqlite3
from contextlib import asynccontextmanager
from fastapi import FastAPI, HTTPException, Depends, Header
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from pydantic import BaseModel
from jose import jwt, JWTError
from passlib.context import CryptContext
from aiogram import Bot, Dispatcher, F
from aiogram.types import InlineKeyboardMarkup, InlineKeyboardButton, CallbackQuery
from dotenv import load_dotenv

load_dotenv()

# --- НАСТРОЙКИ ---
BOT_TOKEN = os.getenv("BOT_TOKEN", "8344334859:AAF-cNVL_-f8XnD1Ewrs6VvIFAuuBk5xKCg")
GROUP_ID = int(os.getenv("GROUP_ID", "-1004460505310"))
SECRET_KEY = os.getenv("SECRET_KEY", "super_secret_key_123")
ADMIN_LOGIN = os.getenv("ADMIN_LOGIN", "admin")
ADMIN_PASS = os.getenv("ADMIN_PASS", "Afiyet2026!")

pwd_ctx = CryptContext(schemes=["bcrypt"], deprecated="auto")
DB_PATH = "afiyet.db"
ALGO = "HS256"

def get_conn():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn

def init_db():
    conn = get_conn()
    c = conn.cursor()
    c.executescript("""
    CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        login TEXT UNIQUE NOT NULL,
        password_hash TEXT NOT NULL,
        role TEXT NOT NULL CHECK(role IN ('user','admin'))
    );
    CREATE TABLE IF NOT EXISTS orders (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER, name TEXT, phone TEXT, order_type TEXT,
        address TEXT, comment TEXT, items_json TEXT, total INTEGER,
        status TEXT DEFAULT 'new', created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS menu (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        cat TEXT, name_ru TEXT, name_uz TEXT, name_en TEXT,
        desc_ru TEXT, desc_uz TEXT, desc_en TEXT,
        price INTEGER, old_price INTEGER DEFAULT 0, discount INTEGER DEFAULT 0, img TEXT
    );
    """)
    conn.commit()
    row = c.execute("SELECT id FROM users WHERE login=?", (ADMIN_LOGIN,)).fetchone()
    if not row:
        c.execute("INSERT INTO users (login,password_hash,role) VALUES (?,?,?)", (ADMIN_LOGIN, pwd_ctx.hash(ADMIN_PASS), "admin"))
        conn.commit()
    n = c.execute("SELECT COUNT(*) FROM menu").fetchone()[0]
    if n == 0:
        seed = [
            ("Донеры","Донер Кебаб","Doner Kabob","Doner Kebab","Сочный донер","Sabzavotli","Juicy",45000,50000,10,"https://images.unsplash.com/photo-1529006557810-274b9b2fc783?w=300"),
            ("Пиде","Пиде с мясом","Go'shtli pide","Meat Pide","Турецкая лодочка","Qayiq","Boat",55000,0,0,"https://images.unsplash.com/photo-1513104890138-7c749659a591?w=300"),
            ("Салаты","Чобан","Choban","Shepherd","Помидоры, огурцы","Sabzavot","Veggies",35000,0,0,"https://images.unsplash.com/photo-1512621776951-a57141f2eefd?w=300")
        ]
        c.executemany("INSERT INTO menu (cat,name_ru,name_uz,name_en,desc_ru,desc_uz,desc_en,price,old_price,discount,img) VALUES (?,?,?,?,?,?,?,?,?,?,?)", seed)
        conn.commit()
    conn.close()

def get_user(uid):
    conn = get_conn(); r = conn.execute("SELECT id,login,role FROM users WHERE id=?", (uid,)).fetchone(); conn.close()
    return dict(r) if r else None

# --- TELEGRAM BOT ---
bot = Bot(token=BOT_TOKEN)
dp = Dispatcher()

def order_kb(oid):
    return InlineKeyboardMarkup(inline_keyboard=[
        [InlineKeyboardButton(text="👨‍🍳 Готовится", callback_data=f"st:{oid}:preparing")],
        [InlineKeyboardButton(text="🚗 В пути", callback_data=f"st:{oid}:delivering")],
        [InlineKeyboardButton(text="✅ Доставлен", callback_data=f"st:{oid}:done")]
    ])

async def send_order(order):
    items = "\n".join([f"• {i['name']} x{i['qty']} = {i['price']*i['qty']:,} сум".replace(",", " ") for i in order["items"]])
    text = f"🔔 <b>НОВЫЙ ЗАКАЗ #{order['id']}</b>\n\n👤 {order['name']}\n📞 {order['phone']}\n🚚 {order['order_type']}\n📍 {order.get('address','-')}\n\n{items}\n\n💰 <b>Итого: {order['total']:,} сум</b>".replace(",", " ")
    await bot.send_message(GROUP_ID, text, parse_mode="HTML", reply_markup=order_kb(order["id"]))

@dp.callback_query(F.data.startswith("st:"))
async def on_status(cb: CallbackQuery):
    _, oid, status = cb.data.split(":")
    conn = get_conn(); conn.execute("UPDATE orders SET status=? WHERE id=?", (status, int(oid))); conn.commit(); conn.close()
    await cb.answer("Статус обновлен!")
    await cb.message.edit_text(cb.message.html_text + f"\n\n<b>Статус: {status}</b>", parse_mode="HTML")

async def start_bot():
    await dp.start_polling(bot)

# --- FASTAPI SERVER ---
@asynccontextmanager
async def lifespan(app):
    init_db()
    task = asyncio.create_task(start_bot())
    yield
    task.cancel()
    await bot.session.close()

app = FastAPI(lifespan=lifespan)

class AuthReq(BaseModel): login: str; password: str
class OrderReq(BaseModel): name: str; phone: str; order_type: str; address: str = ""; comment: str = ""; items: list; total: int

def make_token(u): return jwt.encode({"uid": u["id"], "role": u["role"]}, SECRET_KEY, algorithm=ALGO)
def current_user(authorization: str = Header(None)):
    if not authorization or not authorization.startswith("Bearer "): raise HTTPException(401)
    try: data = jwt.decode(authorization.split(" ")[1], SECRET_KEY, algorithms=[ALGO])
    except JWTError: raise HTTPException(401)
    u = get_user(data["uid"])
    if not u: raise HTTPException(401)
    return u

@app.post("/api/login")
def login(req: AuthReq):
    conn = get_conn(); r = conn.execute("SELECT * FROM users WHERE login=?", (req.login,)).fetchone(); conn.close()
    if r and pwd_ctx.verify(req.password, r["password_hash"]):
        u = {"id": r["id"], "login": r["login"], "role": r["role"]}
        return {"token": make_token(u), "user": u}
    raise HTTPException(401, "Неверный логин или пароль")

@app.post("/api/order")
async def create_order(req: OrderReq, u=Depends(current_user)):
    conn = get_conn(); c = conn.cursor()
    c.execute("INSERT INTO orders (user_id,name,phone,order_type,address,comment,items_json,total) VALUES (?,?,?,?,?,?,?,?)",
              (u["id"], req.name, req.phone, req.order_type, req.address, req.comment, json.dumps(req.items, ensure_ascii=False), req.total))
    conn.commit(); oid = c.lastrowid; conn.close()
    await send_order({"id": oid, "name": req.name, "phone": req.phone, "order_type": req.order_type, "address": req.address, "items": req.items, "total": req.total})
    return {"ok": True, "id": oid}

@app.get("/api/orders")
def get_orders(u=Depends(current_user)):
    conn = get_conn()
    if u["role"] == "admin": rows = conn.execute("SELECT * FROM orders ORDER BY id DESC").fetchall()
    else: rows = conn.execute("SELECT * FROM orders WHERE user_id=? ORDER BY id DESC", (u["id"],)).fetchall()
    conn.close()
    return [dict(r) | {"items": json.loads(r["items_json"])} for r in rows]

@app.get("/api/menu")
def get_menu():
    conn = get_conn(); rows = conn.execute("SELECT * FROM menu").fetchall(); conn.close()
    res = {}
    for r in rows: res.setdefault(r["cat"], []).append(dict(r))
    return res

@app.get("/")
def root(): return FileResponse("index.html")
