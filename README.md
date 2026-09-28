# Campus Customs Shop + Chatbot

Customer website for **Yale Bulldog Blue by Campus Customs**, a Yale merchandise store at 57 Broadway, New Haven. Shoppers browse products, create an account, and chat with a concierge. The concierge answers price and stock questions from the database, and its product results appear on the page as cards.

- **Front end:** React + Vite + TypeScript (`frontend/`)
- **Backend:** Python FastAPI (`backend/`)
- **Chatbot:** a PydanticAI agent with tools that read the SQLite database, calling OpenAI through Portkey

**How the system works:** see [output/harness.md](output/harness.md), which covers the database, models, tools, agent, safety rules and limits, the audit trail, and how to run it.

## Setup

### 1. Data pack (not included in this repo)

Unzip `data.zip` into this folder so you have:

```
hw4/data/campus_customs.db
hw4/data/products/        (102 product images)
```

### 2. Environment

Copy `.env.example` to `.env` and fill in:

```
PORTKEY_API_KEY=your-portkey-key
MODEL=gpt-5.6-luna
SESSION_SECRET=any-long-random-string   # optional; keeps logins valid across restarts
```

`.env` is gitignored. Never commit it.

### 3. Backend (terminal 1, from `hw4/`)

```powershell
python -m venv .venv
.\.venv\Scripts\Activate.ps1          # macOS/Linux: source .venv/bin/activate
pip install -r requirements.txt
cd backend
uvicorn main:app --reload --port 8000
```

### 4. Front end (terminal 2, from `hw4/`)

```powershell
cd frontend
npm install
npm run dev
```

Open **http://localhost:5173**. The Vite dev server forwards `/api` and `/media` to the backend on port 8000.

### 5. Test login

`test@campuscustoms.yale.edu` / `password`

## API

| Endpoint | Returns |
|---|---|
| `GET /api/products?q=&category=` | All products with price and stock by size; optional search and category filter |
| `GET /api/products/{product_id}` | One product (404 if unknown) |
| `GET /api/categories` | Shopper-facing categories |
| `GET /media/products/{file}` | Product image |
| `POST /api/signup` | Creates an account, returns `{user, token}` |
| `POST /api/login` | Checks email + password, returns `{user, token}` |
| `GET /api/me` | Logged-in user (`Authorization: Bearer <token>`) |
| `POST /api/chat` | Shop concierge: `{message, history, page}` → `{message, products, search_label}`; saves the exchange when a Bearer token is sent |
| `GET /api/chat/history` | Logged-in user's last 50 chat messages (token required) |
| `DELETE /api/chat/history` | "Clear chat": deletes the logged-in user's saved messages |

## Project files

- `AI_prompts.md`: every prompt used to build this project, by problem.
- `output/harness.md`: how the system works.
- `output/design.md`: the design pass.
- `output/usability.md`: the four usability improvements.
- `output/app_check.html` and `output/app_check_images/`: screenshots of the running site.
- `output/audit_trail.json`: an append-only log of every chat step.
