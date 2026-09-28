"""Catalogue data access and the tools the shop agent can call.

Everything here reads data/campus_customs.db. The agent gets prices and stock only
from these functions, so it never has to guess.
"""

import json
import os
import re
import sqlite3
from contextlib import closing
from pathlib import Path

from pydantic_ai import RunContext

from models import InventoryItem, Product, ProductCard, ProductDetails, ProductSummary, SizeStock

ROOT_DIR = Path(__file__).resolve().parent.parent
DATA_DIR = ROOT_DIR / "data"
# CAMPUS_DB_PATH lets tests point at a copy of the database; normally unset.
DB_PATH = Path(os.environ.get("CAMPUS_DB_PATH") or DATA_DIR / "campus_customs.db")
IMAGES_DIR = DATA_DIR / "products"
MAX_ALTERNATIVES = 3

SIZE_ORDER = ["XS", "S", "M", "L", "XL", "XXL"]
# Result caps: no tool returns more than 6 products, and descriptions sent to the agent stop at 300 chars.
MAX_SEARCH_RESULTS = 6
MAX_TOOL_DESCRIPTION_CHARS = 300


def _cap(text: str, limit: int) -> str:
    return text if len(text) <= limit else text[: limit - 1].rstrip() + "…"

# garment_type is free text (22 variants); group it into shopper-facing categories.
# Order matters: "full-zip hooded sweatshirt" is a hoodie, "long-sleeve ... shirt" is not a tee.
CATEGORY_RULES = [
    ("Hoodies", ("hood",)),
    ("Quarter-Zips", ("quarter-zip",)),
    ("Jackets & Fleece", ("jacket",)),
    ("Long Sleeve", ("long-sleeve",)),
    ("Sweatshirts", ("crewneck", "mockneck")),
    ("T-Shirts", ("t-shirt",)),
]

# Words that don't help find a product ("do you have a hoodie for me").
STOP_WORDS = {
    "a", "an", "and", "any", "do", "for", "have", "i", "in", "is", "me", "my", "of", "or",
    "please", "show", "some", "the", "to", "under", "with", "you", "your",
}


SHORT_INFO_CHARS = 80


def short_info_for(description: str) -> str:
    """One line from the description: the first sentence, cut at a word boundary if it's long."""
    first = description.split(". ")[0].strip().rstrip(".")
    if len(first) <= SHORT_INFO_CHARS:
        return first
    cut = first[:SHORT_INFO_CHARS].rsplit(" ", 1)[0].rstrip(",;:- ")
    return cut + "…"


def connect(write: bool = False, db_path: Path = DB_PATH) -> sqlite3.Connection:
    mode = "rw" if write else "ro"
    conn = sqlite3.connect(f"file:{db_path.as_posix()}?mode={mode}", uri=True)
    conn.row_factory = sqlite3.Row
    return conn


def category_for(garment_type: str) -> str:
    g = garment_type.lower()
    for category, keywords in CATEGORY_RULES:
        if any(k in g for k in keywords):
            return category
    return "Other"


def load_products(product_id: str | None = None, db_path: Path = DB_PATH) -> list[Product]:
    with closing(connect(db_path=db_path)) as conn:
        if product_id is None:
            rows = conn.execute("SELECT * FROM catalogue ORDER BY name").fetchall()
            stock_rows = conn.execute("SELECT product_id, size, quantity FROM inventory").fetchall()
        else:
            rows = conn.execute("SELECT * FROM catalogue WHERE product_id = ?", (product_id,)).fetchall()
            stock_rows = conn.execute(
                "SELECT product_id, size, quantity FROM inventory WHERE product_id = ?", (product_id,)
            ).fetchall()

    stock: dict[str, list[InventoryItem]] = {}
    for r in stock_rows:
        stock.setdefault(r["product_id"], []).append(InventoryItem(size=r["size"], quantity=r["quantity"]))

    products = []
    for r in rows:
        inventory = sorted(
            stock.get(r["product_id"], []),
            key=lambda i: SIZE_ORDER.index(i.size) if i.size in SIZE_ORDER else len(SIZE_ORDER),
        )
        total = sum(i.quantity for i in inventory)
        products.append(
            Product(
                product_id=r["product_id"],
                name=r["name"],
                garment_type=r["garment_type"],
                category=category_for(r["garment_type"]),
                description=r["description"],
                short_info=short_info_for(r["description"]),
                colors=json.loads(r["colors"]),
                search_tags=json.loads(r["search_tags"]),
                image_url="/media/" + r["image_file_path"],
                price=r["price"],
                inventory=inventory,
                total_stock=total,
                in_stock=total > 0,
            )
        )
    return products


def _haystack(product: Product) -> str:
    return " ".join(
        [product.name, product.garment_type, product.category, product.description, *product.colors, *product.search_tags]
    ).lower()


def matches(product: Product, query: str) -> bool:
    haystack = _haystack(product)
    return all(word in haystack for word in query.lower().split())


def _terms(query: str) -> list[str]:
    words = re.findall(r"[a-z0-9]+", query.lower().replace("grey", "gray"))
    # "hoodies" -> "hoodie" so plurals still match; keep short words like "gas" intact.
    return [w[:-1] if len(w) > 3 and w.endswith("s") else w for w in words if w not in STOP_WORDS]


def _color_words(products: list[Product]) -> set[str]:
    return {word for p in products for color in p.colors for word in color.lower().split()}


def _matches_all(product: Product, terms: list[str], color_words: set[str]) -> bool:
    haystack = _haystack(product)
    # A color word must match the garment's main (first) color, so a gray hoodie with
    # navy lettering is not returned for "navy hoodie".
    main_color = product.colors[0].lower() if product.colors else ""
    return all((term in main_color) if term in color_words else (term in haystack) for term in terms)


# Shopper wording -> the size codes used in the inventory table.
SIZE_ALIASES = {
    "extra small": "XS", "x-small": "XS", "xsmall": "XS",
    "small": "S", "medium": "M", "med": "M", "large": "L",
    "extra large": "XL", "x-large": "XL", "xlarge": "XL",
    "extra extra large": "XXL", "xx-large": "XXL", "xxlarge": "XXL", "2xl": "XXL", "2x": "XXL",
}


def _normalize_size(size: str) -> str:
    s = " ".join(size.strip().lower().split())
    return SIZE_ALIASES.get(s, s.upper())


def _size_stock(item: InventoryItem) -> SizeStock:
    return SizeStock(size=item.size, quantity=item.quantity, in_stock=item.quantity > 0)


# ---------- Agent tools (each call reads the database; nothing is cached) ----------


def _in_stock_in(product: Product, size: str | None) -> bool:
    if size is None:
        return product.in_stock
    return any(i.size == size and i.quantity > 0 for i in product.inventory)


def search_products(
    query: str, max_price: float | None = None, in_stock_size: str | None = None
) -> list[ProductSummary]:
    """Find products in the Campus Customs catalogue.

    Matches every word of the query against product name, description, garment type, and tags.
    Color words (navy, gray, white, ...) must match the garment's main color.
    An empty query matches every product (useful with max_price or in_stock_size).
    Returns up to 6 products (in-stock first, then cheapest), or an empty list if nothing matches;
    if empty, try again with fewer or simpler words before saying nothing was found.

    Args:
        query: What the shopper wants, e.g. "navy hoodie" or "Branford quarter-zip"; may be "".
        max_price: Optional highest price in US dollars.
        in_stock_size: Optional size (e.g. "M"); only products with that size in stock are returned.
    """
    products = load_products()
    terms = _terms(query)
    color_words = _color_words(products)
    size = _normalize_size(in_stock_size) if in_stock_size else None
    hits = [
        p
        for p in products
        if (max_price is None or p.price <= max_price)
        and (size is None or _in_stock_in(p, size))
        and _matches_all(p, terms, color_words)
    ]
    hits.sort(key=lambda p: (not p.in_stock, p.price, p.name))
    return [
        ProductSummary(id=p.product_id, name=p.name, price=p.price, image_url=p.image_url)
        for p in hits[:MAX_SEARCH_RESULTS]
    ]


def get_product_details(product_id: str) -> ProductDetails | str:
    """Get the full description, price, colors, image, and stock for every size of one product.

    Returns a message instead if the product id doesn't exist.

    Args:
        product_id: A product id from search_products, e.g. "basic-hoodie-big-yale".
    """
    return _product_details(product_id)


def _product_details(product_id: str, db_path: Path = DB_PATH) -> ProductDetails | str:
    products = load_products(product_id, db_path)
    if not products:
        return f"No product with id '{product_id}' exists in the catalogue."
    p = products[0]
    return ProductDetails(
        id=p.product_id,
        name=p.name,
        description=_cap(p.description, MAX_TOOL_DESCRIPTION_CHARS),
        price=p.price,
        colors=p.colors,
        image_url=p.image_url,
        sizes=[_size_stock(i) for i in p.inventory],
    )


def check_size_stock(product_id: str, size: str) -> SizeStock | str:
    """Check the quantity in stock for one size of one product.

    Returns size, quantity, and in_stock. If the product doesn't exist, or doesn't come in that
    size, returns a message saying so and listing the sizes it does come in.

    Args:
        product_id: A product id from search_products, e.g. "basic-hoodie-big-yale".
        size: The size to check, e.g. "M", "medium", or "XXL".
    """
    products = load_products(product_id)
    if not products:
        return f"No product with id '{product_id}' exists in the catalogue."
    p = products[0]
    wanted = _normalize_size(size)
    for item in p.inventory:
        if item.size == wanted:
            return _size_stock(item)
    available = ", ".join(i.size for i in p.inventory)
    return f"{p.name} does not come in size '{size}'. Sizes it comes in: {available}."


def find_alternatives(product_id: str, size: str | None = None) -> list[ProductSummary] | str:
    """Find up to 3 similar products that ARE in stock, to offer when something is sold out.

    Similar means the same category (e.g. hoodies); the same garment type and main color rank
    first, then the closest price. With a size, only products in stock in that size are returned.
    Returns a message if the product id doesn't exist.

    Args:
        product_id: The product that is out of stock, e.g. "crew-left-chest-hoodie".
        size: Optional size the shopper needs, e.g. "M".
    """
    products = load_products()
    original = next((p for p in products if p.product_id == product_id), None)
    if original is None:
        return f"No product with id '{product_id}' exists in the catalogue."
    wanted = _normalize_size(size) if size else None
    main_color = original.colors[0].lower() if original.colors else ""
    candidates = [
        p
        for p in products
        if p.product_id != product_id and p.category == original.category and _in_stock_in(p, wanted)
    ]
    candidates.sort(
        key=lambda p: (
            p.garment_type != original.garment_type,
            (p.colors[0].lower() if p.colors else "") != main_color,
            abs(p.price - original.price),
            p.name,
        )
    )
    return [
        ProductSummary(id=p.product_id, name=p.name, price=p.price, image_url=p.image_url)
        for p in candidates[:MAX_ALTERNATIVES]
    ]


def get_current_product(ctx: RunContext) -> ProductDetails | str:
    """Get full details (description, price, colors, stock for every size) of the product the shopper
    is viewing right now. Use it when they say "this", "it", or "this one" on a product page.

    Returns a message instead if the shopper is not on a product page.
    """
    page = ctx.deps.page
    if page is None or not page.product_id:
        return "The shopper is not viewing a product page right now."
    return _product_details(page.product_id, ctx.deps.db_path)


def cards_from_ids(product_ids: list[str], limit: int = 6) -> list[ProductCard]:
    """Build product cards straight from the database (name, price, image, short_info, stock)."""
    catalogue = {p.product_id: p for p in load_products()}
    cards: list[ProductCard] = []
    for pid in dict.fromkeys(product_ids):
        p = catalogue.get(pid)
        if p is not None:
            cards.append(card_for(p))
    return cards[:limit]


def card_for(p: Product) -> ProductCard:
    return ProductCard(
        id=p.product_id,
        name=p.name,
        price=p.price,
        image_url=p.image_url,
        short_info=p.short_info,
        total_stock=p.total_stock,
    )


# ---------- Chat memory (chat_messages table) ----------

CHAT_TABLE_SQL = """
CREATE TABLE IF NOT EXISTS chat_messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    role TEXT NOT NULL,
    content TEXT NOT NULL,
    products_json TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (user_id) REFERENCES users(id)
)
"""


def ensure_chat_table(db_path: Path = DB_PATH) -> None:
    """Create chat_messages if it's missing. Existing tables and rows are left alone."""
    with closing(connect(write=True, db_path=db_path)) as conn, conn:
        conn.execute(CHAT_TABLE_SQL)


def delete_chat_history(user_id: int) -> int:
    with closing(connect(write=True)) as conn, conn:
        return conn.execute("DELETE FROM chat_messages WHERE user_id = ?", (user_id,)).rowcount


def save_chat_exchange(user_id: int, user_text: str, reply_text: str, cards: list[ProductCard]) -> None:
    products_json = json.dumps([c.model_dump() for c in cards]) if cards else None
    with closing(connect(write=True)) as conn, conn:
        conn.executemany(
            "INSERT INTO chat_messages (user_id, role, content, products_json) VALUES (?, ?, ?, ?)",
            [(user_id, "user", user_text, None), (user_id, "assistant", reply_text, products_json)],
        )


def load_chat_rows(user_id: int, limit: int) -> list[dict]:
    """The user's last `limit` messages, oldest first. Card data is reduced to product ids."""
    with closing(connect()) as conn:
        rows = conn.execute(
            "SELECT role, content, products_json, created_at FROM chat_messages "
            "WHERE user_id = ? ORDER BY id DESC LIMIT ?",
            (user_id, limit),
        ).fetchall()
    result = []
    for r in reversed(rows):
        try:
            items = json.loads(r["products_json"]) if r["products_json"] else []
        except json.JSONDecodeError:
            items = []
        # Older rows store full products ("product_id"); new rows store cards ("id").
        ids = [i.get("id") or i.get("product_id") for i in items if isinstance(i, dict)]
        result.append(
            {"role": r["role"], "content": r["content"], "product_ids": [i for i in ids if i], "created_at": r["created_at"]}
        )
    return result
