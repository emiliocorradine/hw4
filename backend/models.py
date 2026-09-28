"""Pydantic models for the Campus Customs API and the shop agent."""

from typing import Literal

from pydantic import BaseModel, Field


class InventoryItem(BaseModel):
    size: str
    quantity: int


class Product(BaseModel):
    product_id: str
    name: str
    garment_type: str
    category: str
    description: str
    short_info: str
    colors: list[str]
    search_tags: list[str]
    image_url: str
    price: float
    inventory: list[InventoryItem]
    total_stock: int
    in_stock: bool


class SignupRequest(BaseModel):
    first_name: str
    last_name: str
    email: str
    password: str


class LoginRequest(BaseModel):
    email: str
    password: str


class User(BaseModel):
    """Public user fields. The password hash is never part of an API response."""

    id: int
    first_name: str
    last_name: str
    email: str


class AuthResponse(BaseModel):
    user: User
    token: str


# ---------- Agent tool results ----------


class ProductSummary(BaseModel):
    """One search hit: enough to show a card and pick a product for a follow-up call."""

    id: str
    name: str
    price: float
    image_url: str


class SizeStock(BaseModel):
    """Stock for one size: answers "do you have it in M?"."""

    size: str
    quantity: int
    in_stock: bool


class ProductDetails(BaseModel):
    """Everything needed for a full product answer in one call."""

    id: str
    name: str
    description: str
    price: float
    colors: list[str]
    image_url: str
    sizes: list[SizeStock]


# ---------- Chat ----------


class ProductCard(BaseModel):
    id: str = Field(description="Product id from a tool result")
    name: str
    price: float
    image_url: str
    short_info: str = Field(default="", description="Leave empty; the server fills it from the database")
    total_stock: int = Field(default=0, description="Leave 0; the server fills it from the database")


class ChatReply(BaseModel):
    """The agent's structured output, and the /api/chat response."""

    message: str = Field(description="Short reply to the shopper")
    products: list[ProductCard] = Field(
        default_factory=list, description="Products to show as cards; only ones returned by tools"
    )
    search_label: str | None = Field(
        default=None, description='Short title for the product results, e.g. "Hoodies" or "Navy hoodies under $50"'
    )


class ChatTurn(BaseModel):
    role: Literal["user", "assistant"]
    content: str = Field(max_length=4000)


class PageContext(BaseModel):
    """Where the shopper is. product_id is a catalogue slug like "basic-hoodie-big-yale" (the id column is TEXT)."""

    path: str = Field(default="/", max_length=300)
    product_id: str | None = Field(default=None, max_length=120)
    product_name: str | None = Field(default=None, max_length=200)


class ChatRequest(BaseModel):
    # The friendly 1,000-character cap is checked in main.py so it can be logged as "blocked";
    # this higher hard limit only stops absurd payloads.
    message: str = Field(min_length=1, max_length=20000)
    history: list[ChatTurn] = Field(default_factory=list)
    page: PageContext | None = None


class CustomerInfo(BaseModel):
    """What the agent may know about the logged-in shopper. Never includes the password hash."""

    user_id: int
    first_name: str
    last_name: str
    email: str


class ChatHistoryMessage(BaseModel):
    role: Literal["user", "assistant"]
    content: str
    products: list[ProductCard] = Field(default_factory=list)
    created_at: str
