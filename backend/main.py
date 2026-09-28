"""Campus Customs API. Run from hw4/backend with: uvicorn main:app --reload --port 8000"""

import hashlib
import hmac
import logging
import os
import re
import secrets
import sqlite3
from contextlib import closing

from dotenv import load_dotenv
from fastapi import FastAPI, Header, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from itsdangerous import BadSignature, SignatureExpired, URLSafeTimedSerializer

from models import (
    AuthResponse,
    ChatHistoryMessage,
    ChatReply,
    ChatRequest,
    ChatTurn,
    CustomerInfo,
    LoginRequest,
    PageContext,
    Product,
    SignupRequest,
    User,
)
from tools import (
    CATEGORY_RULES,
    DB_PATH,
    IMAGES_DIR,
    ROOT_DIR,
    card_for,
    cards_from_ids,
    connect,
    delete_chat_history,
    ensure_chat_table,
    load_chat_rows,
    load_products,
    matches,
    save_chat_exchange,
)

load_dotenv(ROOT_DIR / ".env")

from agent import (  # noqa: E402  (after load_dotenv)
    MAX_HISTORY_TURNS,
    AgentRunError,
    ShopDeps,
    answer,
    append_audit,
    audit_entries,
)

logger = logging.getLogger("campus_customs")
# Print guard corrections to the console next to uvicorn's own log lines.
if not logger.handlers:
    _handler = logging.StreamHandler()
    _handler.setFormatter(logging.Formatter("%(levelname)s:     %(message)s"))
    logger.addHandler(_handler)
    logger.setLevel(logging.INFO)
    logger.propagate = False

MAX_CARDS = 6
MAX_CHAT_MESSAGE_CHARS = 1000
TOO_LONG_REPLY = "That message is too long. Please keep it under 1,000 characters."
UNAVAILABLE_REPLY = "Our assistant is unavailable right now. Please try again in a moment."

# Password hashing matches the seed users: pbkdf2_sha256$<salt>$<hex digest>,
# PBKDF2-HMAC-SHA256, 120,000 iterations, salt used as UTF-8 text, 16-hex-char salts.
HASH_ALGORITHM = "pbkdf2_sha256"
HASH_ITERATIONS = 120_000
MIN_PASSWORD_LENGTH = 8
EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")

# Signed session tokens. Set SESSION_SECRET in .env so logins survive a server restart.
SESSION_MAX_AGE = 7 * 24 * 3600
_serializer = URLSafeTimedSerializer(
    os.environ.get("SESSION_SECRET") or secrets.token_urlsafe(32), salt="campus-customs-session"
)

app = FastAPI(title="Campus Customs API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# Only the images folder is served, never the data folder (it holds the database).
app.mount("/media/products", StaticFiles(directory=IMAGES_DIR), name="product-images")

# Chat memory table; created only if missing, other tables untouched.
ensure_chat_table()
CHAT_HISTORY_LIMIT = 50


@app.get("/api/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.get("/api/products")
def list_products(q: str | None = None, category: str | None = None) -> list[Product]:
    products = load_products()
    if category:
        products = [p for p in products if p.category.lower() == category.lower()]
    if q:
        products = [p for p in products if matches(p, q)]
    return products


@app.get("/api/categories")
def list_categories() -> list[str]:
    found = {p.category for p in load_products()}
    return [c for c, _ in CATEGORY_RULES if c in found] + (["Other"] if "Other" in found else [])


@app.get("/api/products/{product_id}")
def get_product(product_id: str) -> Product:
    products = load_products(product_id)
    if not products:
        raise HTTPException(status_code=404, detail="Product not found")
    return products[0]


# ---------- Authentication ----------


def hash_password(password: str, salt: str | None = None) -> str:
    salt = salt or secrets.token_hex(8)
    digest = hashlib.pbkdf2_hmac("sha256", password.encode(), salt.encode(), HASH_ITERATIONS).hex()
    return f"{HASH_ALGORITHM}${salt}${digest}"


def verify_password(password: str, stored: str) -> bool:
    try:
        algorithm, salt, _ = stored.split("$")
    except ValueError:
        return False
    if algorithm != HASH_ALGORITHM:
        return False
    return hmac.compare_digest(hash_password(password, salt), stored)


# Checked when the email is unknown, so a missing account takes as long as a wrong password.
_DUMMY_HASH = hash_password(secrets.token_hex(16))


def to_user(row: sqlite3.Row) -> User:
    first, last = row["first_name"], row["last_name"]
    if not first:
        first, _, last = row["name"].partition(" ")
    return User(id=row["id"], first_name=first, last_name=last or "", email=row["email"])


def issue_token(user_id: int) -> str:
    return _serializer.dumps({"uid": user_id})


@app.post("/api/signup", status_code=201)
def signup(body: SignupRequest) -> AuthResponse:
    first, last = body.first_name.strip(), body.last_name.strip()
    email = body.email.strip().lower()
    if not first or not last:
        raise HTTPException(status_code=400, detail="Please enter your first and last name.")
    if not EMAIL_RE.match(email):
        raise HTTPException(status_code=400, detail="Please enter a valid email address.")
    if len(body.password) < MIN_PASSWORD_LENGTH:
        raise HTTPException(
            status_code=400, detail=f"Password must be at least {MIN_PASSWORD_LENGTH} characters."
        )

    with closing(connect(write=True)) as conn:
        if conn.execute("SELECT 1 FROM users WHERE lower(email) = ?", (email,)).fetchone():
            raise HTTPException(status_code=409, detail="An account with this email already exists.")
        try:
            with conn:
                cur = conn.execute(
                    "INSERT INTO users (name, email, password_hash, first_name, last_name) VALUES (?, ?, ?, ?, ?)",
                    (f"{first} {last}", email, hash_password(body.password), first, last),
                )
        except sqlite3.IntegrityError:
            raise HTTPException(status_code=409, detail="An account with this email already exists.")
        user_id = cur.lastrowid

    return AuthResponse(user=User(id=user_id, first_name=first, last_name=last, email=email), token=issue_token(user_id))


@app.post("/api/login")
def login(body: LoginRequest) -> AuthResponse:
    email = body.email.strip().lower()
    with closing(connect()) as conn:
        row = conn.execute("SELECT * FROM users WHERE lower(email) = ?", (email,)).fetchone()
    if row is None:
        verify_password(body.password, _DUMMY_HASH)
        raise HTTPException(status_code=401, detail="Incorrect email or password.")
    if not verify_password(body.password, row["password_hash"]):
        raise HTTPException(status_code=401, detail="Incorrect email or password.")
    return AuthResponse(user=to_user(row), token=issue_token(row["id"]))


def current_user(authorization: str | None) -> User:
    scheme, _, token = (authorization or "").partition(" ")
    if scheme.lower() != "bearer" or not token:
        raise HTTPException(status_code=401, detail="Not logged in.")
    try:
        user_id = _serializer.loads(token, max_age=SESSION_MAX_AGE)["uid"]
    except SignatureExpired:
        raise HTTPException(status_code=401, detail="Session expired. Please log in again.")
    except (BadSignature, KeyError, TypeError):
        raise HTTPException(status_code=401, detail="Not logged in.")
    with closing(connect()) as conn:
        row = conn.execute("SELECT * FROM users WHERE id = ?", (user_id,)).fetchone()
    if row is None:
        raise HTTPException(status_code=401, detail="Not logged in.")
    return to_user(row)


@app.get("/api/me")
def me(authorization: str | None = Header(default=None)) -> User:
    return current_user(authorization)


# ---------- Chat ----------


def optional_user(authorization: str | None) -> User | None:
    """The logged-in user, or None for guests (a missing or invalid token just means guest)."""
    if not authorization:
        return None
    try:
        return current_user(authorization)
    except HTTPException:
        return None


def resolve_page(page: PageContext | None) -> PageContext | None:
    """Trust only the product id from the browser; take the name from the database.

    This way a tampered product_name can't inject text into the system prompt, and an unknown id
    doesn't pretend the shopper is on a product page.
    """
    if page is None or not page.product_id:
        return page
    products = load_products(page.product_id)
    if not products:
        return PageContext(path=page.path)
    return PageContext(path=page.path, product_id=products[0].product_id, product_name=products[0].name)


def guard_reply(reply: ChatReply) -> ChatReply:
    """Accuracy guard: re-check every card against the database by id before the shopper sees it.

    Name, price, image, short_info, and stock are overwritten with the real values; cards whose id
    doesn't exist, and duplicates, are dropped. Every correction is logged on one line.
    """
    catalogue = {p.product_id: p for p in load_products()}
    cards = []
    seen: set[str] = set()
    for card in reply.products:
        p = catalogue.get(card.id)
        if p is None:
            logger.warning("card-guard: dropped card for unknown product id %r (%r)", card.id, card.name)
            continue
        if p.product_id in seen:
            continue
        seen.add(p.product_id)
        fixes = [
            f"{field} {got!r} -> {real!r}"
            for field, got, real in (("name", card.name, p.name), ("price", card.price, p.price),
                                     ("image_url", card.image_url, p.image_url))
            if got != real
        ]
        if fixes:
            logger.warning("card-guard: corrected %s: %s", p.product_id, "; ".join(fixes))
        cards.append(card_for(p))
    cards = cards[:MAX_CARDS]
    # A label only makes sense when there are results to title.
    label = ((reply.search_label or "").strip()[:60] or None) if cards else None
    return ChatReply(message=reply.message, products=cards, search_label=label)


def history_from_db(user_id: int) -> list[ChatTurn]:
    """Agent history for logged-in users. Assistant turns note which products were shown,
    so follow-ups like "the second one" still work."""
    turns = []
    for row in load_chat_rows(user_id, MAX_HISTORY_TURNS):
        content = row["content"]
        if row["role"] == "assistant" and row["product_ids"]:
            content += "\n[Products shown: " + ", ".join(row["product_ids"]) + "]"
        turns.append(ChatTurn(role=row["role"], content=content[:4000]))
    return turns


# POST /api/chat contract
#
# Request (ChatRequest): the new message, earlier turns (oldest first; ignored for logged-in
# users, whose history comes from chat_messages), and the page the shopper is on.
# Optional header: Authorization: Bearer <token>. With a valid token both messages are saved.
#   {
#     "message": "do you have this in pink?",
#     "history": [{"role": "user", "content": "hi"}, {"role": "assistant", "content": "Hello..."}],
#     "page": {"path": "/products/basic-hoodie-big-yale", "product_id": "basic-hoodie-big-yale",
#              "product_name": "Basic Hoodie Big Yale"}
#   }
#
# Response (ChatReply): products come only from tool results and are re-checked against the
# database before sending (guard_reply); search_label is null when products is empty.
#   {
#     "message": "Here are some of our hoodies.",
#     "products": [
#       {"id": "basic-hoodie-big-yale", "name": "Basic Hoodie Big Yale", "price": 68.0,
#        "image_url": "/media/products/basic-hoodie-big-yale.jpg",
#        "short_info": "Navy pullover hoodie with a front kangaroo pocket, drawstring hood, and large…"}
#     ],
#     "search_label": "Hoodies"
#   }
#
# Errors: 422 invalid body; 502 {"detail": "Our assistant is unavailable right now..."} if the agent fails.
@app.post("/api/chat")
async def chat(body: ChatRequest, authorization: str | None = Header(default=None)) -> ChatReply:
    user = optional_user(authorization)
    customer = (
        CustomerInfo(user_id=user.id, first_name=user.first_name, last_name=user.last_name, email=user.email)
        if user
        else None
    )
    audit_user = str(user.id) if user else "guest"  # never the email or anything password-related

    # Input cap: very long messages are refused before reaching the model.
    if len(body.message) > MAX_CHAT_MESSAGE_CHARS:
        record_audit(audit_user, body.message, [], TOO_LONG_REPLY, "blocked")
        raise HTTPException(status_code=400, detail=TOO_LONG_REPLY)

    deps = ShopDeps(customer=customer, page=resolve_page(body.page), db_path=DB_PATH)
    history = history_from_db(user.id) if user else body.history
    try:
        raw, new_messages, stop_reason = await answer(body.message, history, deps)
    except AgentRunError as exc:
        # Log the error type only; message content can hold shopper details.
        logger.error("Chat agent failed: %r", exc.__cause__)
        record_audit(audit_user, body.message, exc.new_messages, UNAVAILABLE_REPLY, "error")
        raise HTTPException(status_code=502, detail=UNAVAILABLE_REPLY)

    reply = guard_reply(raw)
    record_audit(audit_user, body.message, new_messages, reply.message, stop_reason)
    if user:
        save_chat_exchange(user.id, body.message, reply.message, reply.products)
    return reply


def record_audit(user: str, message: str, new_messages: list, reply_text: str, stop_reason: str) -> None:
    """Append this request's steps to output/audit_trail.json. An audit failure never breaks the chat."""
    try:
        append_audit(audit_entries(user, message, new_messages, reply_text, stop_reason))
    except Exception:
        logger.exception("Could not write the audit trail")


@app.get("/api/chat/history")
def chat_history(authorization: str | None = Header(default=None)) -> list[ChatHistoryMessage]:
    """The logged-in user's last 50 messages, oldest first. Cards are rebuilt from the database."""
    user = current_user(authorization)
    return [
        ChatHistoryMessage(
            role=row["role"],
            content=row["content"],
            products=cards_from_ids(row["product_ids"]),
            created_at=row["created_at"],
        )
        for row in load_chat_rows(user.id, CHAT_HISTORY_LIMIT)
    ]


@app.delete("/api/chat/history")
def clear_chat_history(authorization: str | None = Header(default=None)) -> dict[str, int]:
    """'Clear chat' for logged-in users: deletes their saved messages so the bot starts fresh."""
    user = current_user(authorization)
    return {"deleted": delete_chat_history(user.id)}
