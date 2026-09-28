# Usability Improvements

Four improvements: two in the front end, two in the agent backend. Each was tested in the running app, in Edge.

## 1. Quick-question chips in the chat panel (front end)

**What I added:** four clickable suggestions ("What hoodies do you have?", "Gifts under $30", "What's in stock in size M?", "Where is your store?"). They appear when the chat is empty, and again after the new **Clear chat** button in the panel header. Clicking a chip sends it. For logged-in shoppers, Clear chat also deletes their saved history (`DELETE /api/chat/history`), so the bot really starts fresh.

To make every chip answerable with real data, `search_products` gained an `in_stock_size` filter and accepts an empty query. The prompt also covers budgets with no matches and the store address.

**Why it helps:** shoppers often don't know what the bot can do. The chips show its range at a glance and turn one click into product cards, which shortens the path to a product page.

**Where to see it:** open the chat (round navy button, bottom right) on any page. Tested replies:
- "Where is your store?" → "…57 Broadway, New Haven, CT 06511. I do not have store hours or a phone number."
- "Gifts under $30" → "Nothing is under $30; our lowest-priced items are these $32.00 T-shirts." Shows 6 cards, and the page shows "Assistant results: Lowest-priced items". (The cheapest item in the catalogue is $32.)
- "What's in stock in size M?" → 6 cards, all with M in stock.
- The chips hide once a message is sent and return after Clear chat.

## 2. Stock badges on product cards (front end)

**What I added:** a small badge in the image corner of every product card: the catalogue grid, the Home page, the page's "Assistant results" grid, and the mini cards in the chat. It shows "Sold out" (gray) when total stock is 0 and "Low stock" (gold) when total stock is 5 or less; otherwise there's no badge. The badge uses `total_stock` from the API. The product list already had it, and chat cards (`ProductCard`) now carry it too, filled from the database by the accuracy guard.

**Why it helps:** shoppers see availability before clicking, so they avoid dead ends. A genuine "Low stock" signal adds urgency that nudges a purchase.

**Where to see it:** `/products`, top-left corner of a card's image.

- **With the current data, no badge shows.** Every product has at least 9 units in total (none is at 5 or less, none is at 0), so the rule correctly shows no badge.
- **Demo:** I ran the backend against a *copy* of the database in a scratch folder (`CAMPUS_DB_PATH`), with "2025 Yale Vs Harvard T Shirt" set to 0 and "Baseball Left Chest Crewneck" set to 3. `/products` then showed **SOLD OUT** (gray) and **LOW STOCK** (gold) on those two cards. The real database was not changed.

## 3. In-stock alternatives tool (agent backend)

**What I added:** `find_alternatives(product_id, size=None)` in `backend/tools.py`. It returns up to 3 products in the same category that are in stock in the requested size, ranked by same garment type, then same main color, then closest price. `prompts/prompt.md` now says: whenever something is out of stock, call `find_alternatives` and offer the results as cards.

**Why it helps:** it turns "sorry, sold out" into "here are three that fit you", recovering a sale that would otherwise be lost.

**Where to see it:** ask the chat "Do you have the Crew Left Chest Hoodie in M?" (M is 0 in the DB). Tested reply: "The Crew Left Chest Hoodie is out of stock in size M. Here are similar hoodies currently in stock in M:" with 3 cards: Basic Hoodie Big Yale (M: 5), Fencing Left Chest Hoodie (M: 15) and Sailing Left Chest Hoodie (M: 25), all $68.00 as in the DB. The page shows them as "Assistant results: Similar hoodies in M".

## 4. Price/stock accuracy guard (agent backend)

**What I added:** `guard_reply()` in `backend/main.py` runs on every agent reply before it's sent. It looks up each card by id in `catalogue` and overwrites the name, price and image (plus short_info and total_stock) with the real values. It drops cards whose id doesn't exist, and duplicates. Every correction prints one console line:

```
WARNING:     card-guard: corrected basic-hoodie-big-yale: price 19.99 -> 68.0
WARNING:     card-guard: dropped card for unknown product id 'made-up-sweater' ('Imaginary Sweater')
```

**Why it helps:** even if the model slips, the shopper never sees a wrong price or a product that doesn't exist. That protects trust and avoids pricing disputes.

**Where to see it:** the backend terminal (`uvicorn main:app --reload --port 8000`). During the live tests the model's cards were all correct, so the guard logged nothing. To see it fire, I passed `guard_reply()` a `ChatReply` with a wrong price ($19.99 for a $68.00 hoodie) and a made-up product. It printed the two lines above and returned only real cards with database prices: `basic-hoodie-big-yale $68.00`, `branford-1-4-zip $72.00`.
