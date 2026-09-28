"""Builds the Campus Customs shop agent: system prompt + deps + tools + model via Portkey."""

import json
import os
import threading
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path

from dotenv import load_dotenv
from openai import AsyncOpenAI
from pydantic_ai import Agent, RunContext, capture_run_messages
from pydantic_ai.exceptions import ModelHTTPError, UsageLimitExceeded
from pydantic_ai.messages import (
    ModelMessage,
    ModelRequest,
    ModelResponse,
    RetryPromptPart,
    SystemPromptPart,
    TextPart,
    ToolCallPart,
    ToolReturnPart,
    UserPromptPart,
)
from pydantic_ai.usage import UsageLimits
from pydantic_ai.models.openai import OpenAIChatModel
from pydantic_ai.providers.openai import OpenAIProvider

from models import ChatReply, ChatTurn, CustomerInfo, PageContext
from tools import (
    DB_PATH,
    check_size_stock,
    find_alternatives,
    get_current_product,
    get_product_details,
    search_products,
)

HERE = Path(__file__).resolve().parent
PROMPT_PATH = HERE / "prompts" / "prompt.md"
AUDIT_PATH = HERE.parent / "output" / "audit_trail.json"
MAX_HISTORY_TURNS = 20

# Guardrails: at most 8 model requests per chat message (stops tool-call loops).
REQUEST_LIMIT = 8
LIMIT_REACHED_REPLY = "Sorry, that took too long. Could you rephrase?"
BLOCKED_REPLY = "I can't help with that request. I'm happy to help with Campus Customs products, sizes, stock, and prices."
AUDIT_TEXT_CHARS = 200
# PydanticAI's structured-output tool; it carries the ChatReply, it isn't a real shop tool.
OUTPUT_TOOL_PREFIX = "final_result"

load_dotenv(HERE.parent / ".env")

MODEL_NAME = os.environ.get("MODEL") or "gpt-5.6-luna"
PORTKEY_BASE_URL = os.environ.get("PORTKEY_BASE_URL", "https://api.portkey.ai/v1")


@dataclass
class ShopDeps:
    """Per-request context: who is chatting and what page they're on. Built in main.py."""

    customer: CustomerInfo | None
    page: PageContext | None
    db_path: Path = DB_PATH


def build_model() -> OpenAIChatModel:
    """Point PydanticAI at OpenAI through Portkey (same setup as Homework 3).

    The key is read from hw4/.env and is never written into code or printed.
    """
    portkey_api_key = os.environ.get("PORTKEY_API_KEY")
    if not portkey_api_key:
        raise RuntimeError("PORTKEY_API_KEY is required. Copy .env.example to .env and add your key.")
    client = AsyncOpenAI(
        api_key=portkey_api_key,
        base_url=PORTKEY_BASE_URL,
        default_headers={"x-portkey-api-key": portkey_api_key},
    )
    return OpenAIChatModel(MODEL_NAME, provider=OpenAIProvider(openai_client=client))


agent = Agent(
    build_model(),
    deps_type=ShopDeps,
    output_type=ChatReply,
    tools=[search_products, get_product_details, check_size_stock, find_alternatives, get_current_product],
    retries=2,
)


@agent.instructions
def shop_prompt() -> str:
    # Read on every run so edits to prompts/prompt.md apply without restarting the server.
    return PROMPT_PATH.read_text(encoding="utf-8")


@agent.system_prompt(dynamic=True)
def shopper_context(ctx: RunContext[ShopDeps]) -> str:
    """Who is chatting and what they're looking at. Only name and email, never the password hash."""
    customer, page = ctx.deps.customer, ctx.deps.page
    if customer:
        lines = [f"The shopper is {customer.first_name} {customer.last_name} ({customer.email}), logged in."]
    else:
        lines = ["The shopper is a guest (not logged in)."]
    if page and page.product_id:
        lines.append(f"The shopper is currently viewing {page.product_name} (id {page.product_id}).")
    elif page:
        lines.append(f"The shopper is on the page {page.path}, not a product page.")
    return "\n".join(lines)


def to_message_history(history: list[ChatTurn]) -> list[ModelMessage]:
    turns = history[-MAX_HISTORY_TURNS:]
    if not turns:
        return []
    # PydanticAI skips system prompts when history is passed, unless the history holds a
    # dynamic system prompt part; this placeholder makes it re-run shopper_context every request.
    messages: list[ModelMessage] = [
        ModelRequest(parts=[SystemPromptPart(content="", dynamic_ref=shopper_context.__qualname__)])
    ]
    for turn in turns:
        if turn.role == "user":
            messages.append(ModelRequest(parts=[UserPromptPart(content=turn.content)]))
        else:
            messages.append(ModelResponse(parts=[TextPart(content=turn.content)]))
    return messages


class AgentRunError(Exception):
    """The agent failed; carries the messages from this run so the audit trail can still record them."""

    def __init__(self, new_messages: list[ModelMessage]):
        super().__init__("agent run failed")
        self.new_messages = new_messages


async def answer(message: str, history: list[ChatTurn], deps: ShopDeps) -> tuple[ChatReply, list[ModelMessage], str]:
    """Run the agent with the loop limit.

    Returns (raw reply, this run's new messages, stop reason). main.py guards the cards before sending.
    """
    message_history = to_message_history(history)
    with capture_run_messages() as captured:
        try:
            result = await agent.run(
                message,
                message_history=message_history,
                deps=deps,
                usage_limits=UsageLimits(request_limit=REQUEST_LIMIT),
            )
        except UsageLimitExceeded:
            return ChatReply(message=LIMIT_REACHED_REPLY), captured[len(message_history):], "limit_reached"
        except ModelHTTPError as exc:
            # The provider's content filter (Azure OpenAI via Portkey) refused the prompt, e.g. a jailbreak.
            if "content_filter" in str(exc.body):
                return ChatReply(message=BLOCKED_REPLY), captured[len(message_history):], "blocked"
            raise AgentRunError(captured[len(message_history):]) from exc
        except Exception as exc:
            raise AgentRunError(captured[len(message_history):]) from exc
    return result.output, result.new_messages(), "completed"


# ---------- Audit trail (output/audit_trail.json) ----------

_audit_lock = threading.Lock()


def _short(value: object) -> str:
    """Compact JSON (or text) cut to 200 characters."""
    if isinstance(value, str):
        text = value
    else:
        try:
            text = json.dumps(value, default=lambda o: o.model_dump() if hasattr(o, "model_dump") else str(o))
        except (TypeError, ValueError):
            text = str(value)
    return text if len(text) <= AUDIT_TEXT_CHARS else text[: AUDIT_TEXT_CHARS - 1] + "…"


def _iso(ts: datetime | None) -> str:
    return (ts or datetime.now(timezone.utc)).astimezone(timezone.utc).isoformat(timespec="seconds")


def _entry(ts: datetime | None, user: str, event: str, tool: str | None = None, args: object = None,
           result: object = None, stop_reason: str | None = None) -> dict:
    return {
        "timestamp": _iso(ts),
        "user": user,
        "event": event,
        "tool": tool,
        "args": None if args is None else _short(args),
        "result": None if result is None else _short(result),
        "stop_reason": stop_reason,
    }


def audit_entries(user: str, message: str, new_messages: list[ModelMessage], reply_text: str,
                  stop_reason: str) -> list[dict]:
    """One entry per agent step, built from PydanticAI's messages for this run.

    The structured-output tool (ChatReply) is not a real tool, so it's recorded as the final_reply.
    """
    entries = []
    saw_user_message = False
    for msg in new_messages:
        if isinstance(msg, ModelRequest):
            for part in msg.parts:
                if isinstance(part, UserPromptPart):
                    saw_user_message = True
                    entries.append(_entry(part.timestamp, user, "user_message", args={"message": part.content}))
                elif isinstance(part, ToolReturnPart) and not part.tool_name.startswith(OUTPUT_TOOL_PREFIX):
                    entries.append(_entry(part.timestamp, user, "tool_result", part.tool_name, result=part.content))
                elif (isinstance(part, RetryPromptPart) and part.tool_name
                      and not part.tool_name.startswith(OUTPUT_TOOL_PREFIX)):
                    entries.append(_entry(part.timestamp, user, "tool_result", part.tool_name,
                                          result={"retry": part.model_response()}))
        elif isinstance(msg, ModelResponse):
            for part in msg.parts:
                if isinstance(part, ToolCallPart) and not part.tool_name.startswith(OUTPUT_TOOL_PREFIX):
                    entries.append(_entry(msg.timestamp, user, "tool_call", part.tool_name, args=part.args_as_dict()))
    if not saw_user_message:
        entries.insert(0, _entry(None, user, "user_message", args={"message": message}))
    entries.append(_entry(None, user, "final_reply", result=reply_text, stop_reason=stop_reason))
    return entries


def append_audit(entries: list[dict], path: Path = AUDIT_PATH) -> None:
    """Append-only: read the JSON array, add entries, write it back. Old entries are never removed.

    If the file exists but can't be parsed, nothing is written, so a damaged trail is never overwritten.
    """
    with _audit_lock:
        existing: list = []
        if path.exists():
            try:
                existing = json.loads(path.read_text(encoding="utf-8") or "[]")
            except json.JSONDecodeError:
                raise RuntimeError(f"{path.name} is not valid JSON; refusing to overwrite it")
            if not isinstance(existing, list):
                raise RuntimeError(f"{path.name} is not a JSON array; refusing to overwrite it")
        path.parent.mkdir(parents=True, exist_ok=True)
        tmp = path.with_suffix(".json.tmp")
        tmp.write_text(json.dumps(existing + entries, indent=2, ensure_ascii=False), encoding="utf-8")
        tmp.replace(path)  # atomic swap: a crash mid-write can't leave a half-written trail
