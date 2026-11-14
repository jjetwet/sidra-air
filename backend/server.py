import asyncio
import json
import math
import uuid
from contextlib import suppress
from datetime import datetime, timedelta, timezone
from typing import Annotated, Any, List, Literal, Optional

import hmac
import secrets

import bcrypt
import jwt
import stripe
from bson import ObjectId
from dotenv import load_dotenv
from fastapi import APIRouter, BackgroundTasks, Depends, FastAPI, HTTPException, Query, Request

import emailer
from fastapi.responses import StreamingResponse
from motor.motor_asyncio import AsyncIOMotorClient
from pydantic import BaseModel, BeforeValidator, ConfigDict, EmailStr, Field
from pymongo import ASCENDING, DESCENDING, IndexModel
from pymongo.errors import DuplicateKeyError
from starlette.middleware.cors import CORSMiddleware
import logging
import os
from pathlib import Path

from emergentintegrations.llm.chat import LlmChat, StreamDone, TextDelta, UserMessage

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / ".env")

mongo_url = os.environ["MONGO_URL"]
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ["DB_NAME"]]
EMERGENT_LLM_KEY = os.environ["EMERGENT_LLM_KEY"]
AUTO_CONFIRM_TESTING = os.environ.get("AUTO_CONFIRM_TESTING", "false").lower() == "true"
TEAM_ALERT_EMAILS = [e.strip() for e in os.environ.get("TEAM_ALERT_EMAILS", "").split(",") if e.strip()]
ADMIN_EMAILS = {e.strip().lower() for e in os.environ.get("ADMIN_EMAILS", "").split(",") if e.strip()}
JWT_SECRET = os.environ["JWT_SECRET"]
JWT_TTL_DAYS = 30
INVITE_CODE = os.environ["INVITE_CODE"]
STRIPE_API_KEY = os.environ.get("STRIPE_API_KEY", "")

logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(name)s - %(levelname)s - %(message)s")
logger = logging.getLogger(__name__)

INDEXES: dict[str, list[IndexModel]] = {
    "quotes": [
        IndexModel([("device_id", ASCENDING), ("created_at", DESCENDING)], name="device_created"),
        IndexModel([("user_id", ASCENDING), ("created_at", DESCENDING)], name="user_created"),
        IndexModel([("status", ASCENDING), ("created_at", DESCENDING)], name="status_created"),
    ],
    "concierge_messages": [
        IndexModel([("device_id", ASCENDING), ("created_at", ASCENDING)], name="device_created"),
        IndexModel([("user_id", ASCENDING), ("created_at", ASCENDING)], name="user_created"),
    ],
    "access_codes": [IndexModel([("code", ASCENDING)], name="code", unique=True)],
    "travellers": [IndexModel([("user_id", ASCENDING), ("passport_number", ASCENDING)], name="user_passport", unique=True)],
    "users": [
        IndexModel([("email", ASCENDING)], name="email", unique=True),
        IndexModel([("user_id", ASCENDING)], name="user_id", unique=True),
    ],
    "user_sessions": [
        IndexModel([("session_token", ASCENDING)], name="session_token", unique=True),
        IndexModel([("user_id", ASCENDING)], name="user_id"),
        IndexModel([("expires_at", ASCENDING)], name="expires_ttl", expireAfterSeconds=0),
    ],
}


async def ensure_indexes() -> None:
    for collection, models in INDEXES.items():
        for model in models:
            try:
                await db[collection].create_indexes([model])
            except Exception as exc:
                logger.error("ensure_indexes(%s.%s): %s", collection, model.document["name"], exc)


# ---------------------------------------------------------------- Mongo base
PyObjectId = Annotated[str, BeforeValidator(lambda v: str(v) if isinstance(v, ObjectId) else v)]


class BaseDocument(BaseModel):
    model_config = ConfigDict(populate_by_name=True)
    id: Optional[PyObjectId] = Field(default=None, alias="_id")

    @classmethod
    def from_mongo(cls, doc: dict[str, Any]):
        return cls.model_validate(doc)

    def to_mongo(self) -> dict[str, Any]:
        data = self.model_dump(by_alias=True, exclude_none=True)
        data.pop("_id", None)
        return data

    def public(self) -> dict[str, Any]:
        return self.model_dump(by_alias=False)


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


# ---------------------------------------------------------------- Static data
FLEET = [
    {"id": "global-7500", "maker": "Bombardier", "family": "Global", "name": "Global 7500", "pax": 19, "range_nm": 7700, "speed_kts": 516, "hourly_usd": 16500, "cabin_ft": 54.0, "cabin_height_ft": 6.2, "living_spaces": 4,
     "tagline": "The flagship. Four true living spaces and a dedicated crew suite.",
     "highlights": ["Master suite with optional shower", "Nuage seats with deep recline", "High speed Ka band connectivity", "Nonstop range from Dubai to Los Angeles"]},
    {"id": "global-6500", "maker": "Bombardier", "family": "Global", "name": "Global 6500", "pax": 17, "range_nm": 6600, "speed_kts": 488, "hourly_usd": 13500, "cabin_ft": 43.3, "cabin_height_ft": 6.2, "living_spaces": 3,
     "tagline": "Smooth Flex Wing and an exceptionally quiet cabin for long sectors.",
     "highlights": ["Three-zone cabin with private stateroom", "Lowest cabin altitude in class", "Nuage seating", "Nonstop from London to Hong Kong"]},
    {"id": "global-5500", "maker": "Bombardier", "family": "Global", "name": "Global 5500", "pax": 16, "range_nm": 5900, "speed_kts": 488, "hourly_usd": 12000, "cabin_ft": 40.7, "cabin_height_ft": 6.2, "living_spaces": 3,
     "tagline": "Intercontinental reach with a wide, light-filled cabin.",
     "highlights": ["Three living zones", "Full galley with oven", "High speed Ka band connectivity", "Dubai to London with ease"]},
    {"id": "challenger-650", "maker": "Bombardier", "family": "Challenger", "name": "Challenger 650", "pax": 12, "range_nm": 4000, "speed_kts": 470, "hourly_usd": 8500, "cabin_ft": 25.6, "cabin_height_ft": 6.0, "living_spaces": 2,
     "tagline": "The widest cabin in its class. Proven, spacious and dependable.",
     "highlights": ["Widest cabin among large business jets", "Divan converts to full bed", "Forward galley", "Nonstop from Dubai to Geneva"]},
    {"id": "challenger-3500", "maker": "Bombardier", "family": "Challenger", "name": "Challenger 3500", "pax": 10, "range_nm": 3400, "speed_kts": 470, "hourly_usd": 7000, "cabin_ft": 25.2, "cabin_height_ft": 6.0, "living_spaces": 2,
     "tagline": "The benchmark super midsize jet, with Nuage seating and a flat floor cabin.",
     "highlights": ["Nuage seating throughout", "Voice controlled cabin", "Flat floor cabin", "Transcontinental range"]},
    {"id": "g700", "maker": "Gulfstream", "family": "Gulfstream", "name": "Gulfstream G700", "pax": 19, "range_nm": 7750, "speed_kts": 516, "hourly_usd": 17500, "cabin_ft": 56.11, "cabin_height_ft": 6.25, "living_spaces": 5,
     "tagline": "The tallest, widest, longest cabin in the industry.",
     "highlights": ["Up to five living areas", "Ultragalley and crew rest area", "Circadian lighting", "20 panoramic oval windows"]},
    {"id": "g650er", "maker": "Gulfstream", "family": "Gulfstream", "name": "Gulfstream G650ER", "pax": 18, "range_nm": 7500, "speed_kts": 516, "hourly_usd": 15500, "cabin_ft": 46.83, "cabin_height_ft": 6.25, "living_spaces": 4,
     "tagline": "An icon of ultra long range travel, flying close to the speed of sound.",
     "highlights": ["Four living areas", "100% fresh air system", "Panoramic oval windows", "Nonstop from Dubai to New York"]},
    {"id": "g500", "maker": "Gulfstream", "family": "Gulfstream", "name": "Gulfstream G500", "pax": 13, "range_nm": 5300, "speed_kts": 488, "hourly_usd": 11000, "cabin_ft": 41.5, "cabin_height_ft": 6.17, "living_spaces": 3,
     "tagline": "Fast, quiet and highly capable over long distances.",
     "highlights": ["Three living areas", "Active control sidesticks", "Low cabin altitude", "Fresh air, every 2 minutes"]},
    {"id": "g280", "maker": "Gulfstream", "family": "Gulfstream", "name": "Gulfstream G280", "pax": 10, "range_nm": 3600, "speed_kts": 459, "hourly_usd": 6800, "cabin_ft": 25.10, "cabin_height_ft": 6.25, "living_spaces": 2,
     "tagline": "Super midsize agility with Gulfstream refinement.",
     "highlights": ["19 oval windows", "Baggage accessible in flight", "Full size galley", "Short runway capable"]},
]
FLEET.append(
    {"id": "bbj", "maker": "Boeing", "family": "Boeing", "name": "Boeing Business Jet", "pax": 19, "range_nm": 7000, "speed_kts": 470, "hourly_usd": 22000, "cabin_ft": 79.0, "cabin_height_ft": 7.0, "living_spaces": 5,
     "tagline": "An airliner configured for business. Space to meet, work and rest in complete privacy.",
     "highlights": ["Private stateroom with ensuite shower", "Conference and dining suite", "Full size galley and crew rest", "Over 1,000 sq ft of cabin"]}
)
FLEET_BY_ID = {j["id"]: j for j in FLEET}

AIRPORTS = json.loads((ROOT_DIR / "airports.json").read_text(encoding="utf-8"))
AIRPORTS_BY_CODE = {a["code"]: a for a in AIRPORTS}


def haversine_nm(a: dict, b: dict) -> float:
    r_nm = 3440.065
    p1, p2 = math.radians(a["lat"]), math.radians(b["lat"])
    dp = p2 - p1
    dl = math.radians(b["lon"] - a["lon"])
    h = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * r_nm * math.asin(math.sqrt(h))


def estimate(from_code: str, to_code: str, jet_id: str, trip_type: str) -> dict:
    a = AIRPORTS_BY_CODE.get(from_code)
    b = AIRPORTS_BY_CODE.get(to_code)
    jet = FLEET_BY_ID.get(jet_id)
    if not a or not b:
        raise HTTPException(400, "Unknown airport")
    if from_code == to_code:
        raise HTTPException(400, "Origin and destination must differ")
    if not jet:
        raise HTTPException(400, "Unknown aircraft")
    dist = haversine_nm(a, b)
    stops = max(0, math.ceil(dist / (jet["range_nm"] * 0.92)) - 1)
    hours = dist / jet["speed_kts"] + 0.4 + stops * 1.0
    legs = 2 if trip_type == "return" else 1
    billable = max(hours, 2.0) * legs
    price = round(billable * jet["hourly_usd"], -2)
    return {
        "distance_nm": round(dist),
        "flight_minutes": round(hours * 60),
        "fuel_stops": stops,
        "estimated_price_usd": price,
        "legs": legs,
    }


# ---------------------------------------------------------------- Models
# ---------------------------------------------------------------- Guest manifest
_DATE_RE = r"^\d{4}-\d{2}-\d{2}$"


class Guest(BaseModel):
    id: str = Field(default_factory=lambda: uuid.uuid4().hex[:10])
    full_name: str = Field(min_length=1, max_length=120)
    nationality: str = Field(min_length=2, max_length=60)
    date_of_birth: str = Field(pattern=_DATE_RE)
    passport_number: str = Field(min_length=4, max_length=20, pattern=r"^[A-Za-z0-9]+$")
    passport_expiry: str = Field(pattern=_DATE_RE)


class GuestsIn(BaseModel):
    guests: List[Guest] = Field(max_length=19)


def _valid_date(s: str, label: str):
    try:
        return datetime.strptime(s, "%Y-%m-%d").date()
    except ValueError:
        raise HTTPException(400, f"{label} is not a valid date")


def _check_guests(guests: List["Guest"], depart_date: str, return_date: Optional[str]) -> None:
    depart = _valid_date(depart_date, "Departure")
    last_day = _valid_date(return_date, "Return") if return_date else depart
    today = datetime.now(timezone.utc).date()
    for g in guests:
        if _valid_date(g.date_of_birth, f"{g.full_name}'s date of birth") >= today:
            raise HTTPException(400, f"{g.full_name}'s date of birth must be in the past")
        if _valid_date(g.passport_expiry, f"{g.full_name}'s passport expiry") <= last_day:
            raise HTTPException(400, f"{g.full_name}'s passport expires before the trip ends")
        g.passport_number = g.passport_number.upper()


class QuoteIn(BaseModel):
    from_code: str
    to_code: str
    jet_id: str
    trip_type: Literal["one_way", "return"] = "one_way"
    depart_date: str
    return_date: Optional[str] = None
    depart_window: Literal["Morning", "Afternoon", "Evening", "Flexible"] = "Flexible"
    pax: int = Field(ge=1, le=19)
    name: str = Field(min_length=1, max_length=120)
    email: EmailStr
    notes: str = Field(default="", max_length=1000)
    lead_passenger: Guest


class EstimateIn(BaseModel):
    from_code: str
    to_code: str
    jet_id: str
    trip_type: Literal["one_way", "return"] = "one_way"


class Quote(BaseDocument):
    user_id: Optional[str] = None
    device_id: Optional[str] = None
    from_code: str
    to_code: str
    jet_id: str
    jet_name: str
    trip_type: str
    depart_date: str
    return_date: Optional[str] = None
    depart_window: str
    pax: int
    name: str
    email: str
    notes: str = ""
    distance_nm: int
    flight_minutes: int
    fuel_stops: int
    estimated_price_usd: float
    status: str = "Requested"
    final_price_usd: Optional[float] = None
    team_message: Optional[str] = None
    email_status: Optional[str] = None
    payment_status: Optional[str] = None
    stripe_session_id: Optional[str] = None
    paid_at: Optional[str] = None
    manifest_reminder_sent_at: Optional[str] = None
    guests: list[dict] = []
    created_at: str
    updated_at: Optional[str] = None


class ConciergeMessage(BaseDocument):
    user_id: Optional[str] = None
    device_id: Optional[str] = None
    role: Literal["user", "assistant"]
    content: str
    created_at: str


class ChatIn(BaseModel):
    message: str = Field(min_length=1, max_length=2000)


class User(BaseModel):
    user_id: str
    email: str
    name: str = ""
    picture: Optional[str] = None
    is_admin: bool = False


class ClaimIn(BaseModel):
    device_id: str = Field(min_length=6, max_length=64)


class AdminUpdateIn(BaseModel):
    status: Literal["Requested", "Confirmed", "Unavailable"]
    final_price_usd: Optional[float] = Field(default=None, gt=0)
    team_message: str = Field(default="", max_length=1000)


# ---------------------------------------------------------------- App
app = FastAPI()


@app.get("/health", include_in_schema=False)
@app.head("/health", include_in_schema=False)
async def health():
    return {"status": "ok"}


api = APIRouter(prefix="/api")


@api.get("/")
async def root():
    return {"message": "SIDRA API"}


# ---------------------------------------------------------------- Auth
def _user_out(doc: dict) -> User:
    return User(
        user_id=doc["user_id"],
        email=doc["email"],
        name=doc.get("name", ""),
        picture=doc.get("picture"),
        is_admin=doc["email"].lower() in ADMIN_EMAILS,
    )


def _make_token(user_id: str) -> str:
    now = datetime.now(timezone.utc)
    claims = {"sub": user_id, "iat": now, "exp": now + timedelta(days=JWT_TTL_DAYS), "iss": "sidra-api", "aud": "sidra-app"}
    return jwt.encode(claims, JWT_SECRET, algorithm="HS256")


async def current_user(request: Request) -> User:
    auth = request.headers.get("Authorization", "")
    if not auth.startswith("Bearer "):
        raise HTTPException(401, "Not authenticated")
    try:
        claims = jwt.decode(auth[7:].strip(), JWT_SECRET, algorithms=["HS256"], issuer="sidra-api", audience="sidra-app",
                            options={"require": ["sub", "exp", "iat", "iss", "aud"]})
    except jwt.PyJWTError:
        raise HTTPException(401, "Session expired. Please sign in again.")
    doc = await db.users.find_one({"user_id": claims["sub"]}, {"_id": 0})
    if not doc:
        raise HTTPException(401, "Account not found")
    return _user_out(doc)


async def admin_user(user: User = Depends(current_user)) -> User:
    if not user.is_admin:
        raise HTTPException(403, "Team access only")
    return user


class CodeIn(BaseModel):
    invite_code: str = Field(min_length=1, max_length=32)


class RegisterIn(CodeIn):
    name: str = Field(min_length=1, max_length=120)
    email: EmailStr
    password: str = Field(min_length=8, max_length=72)


class LoginIn(BaseModel):
    email: EmailStr
    password: str = Field(min_length=1, max_length=72)


async def _code_ok(code: str) -> bool:
    code = code.strip()
    if hmac.compare_digest(code, INVITE_CODE):
        return True
    return bool(await db.access_codes.find_one({"code": code, "active": True}))


def _auth_response(doc: dict) -> dict:
    return {"access_token": _make_token(doc["user_id"]), "user": _user_out(doc).model_dump()}


@api.post("/auth/verify-code")
async def verify_code(body: CodeIn):
    if not await _code_ok(body.invite_code):
        raise HTTPException(400, "That access code is not recognised")
    return {"ok": True}


@api.post("/auth/register", status_code=201)
async def register(body: RegisterIn):
    if not await _code_ok(body.invite_code):
        raise HTTPException(400, "That access code is not recognised")
    email = body.email.lower().strip()
    if await db.users.find_one({"email": email}):
        raise HTTPException(409, "An account with this email already exists. Please sign in.")
    pw_hash = await asyncio.to_thread(lambda: bcrypt.hashpw(body.password.encode(), bcrypt.gensalt(rounds=12)).decode())
    doc = {"user_id": f"user_{uuid.uuid4().hex[:12]}", "email": email, "name": body.name.strip(), "picture": None,
           "password_hash": pw_hash, "referral_code": body.invite_code.strip(), "created_at": datetime.now(timezone.utc)}
    try:
        await db.users.insert_one(doc)
    except DuplicateKeyError:
        raise HTTPException(409, "An account with this email already exists. Please sign in.")
    return _auth_response(doc)


@api.post("/auth/login")
async def login(body: LoginIn):
    doc = await db.users.find_one({"email": body.email.lower().strip()}, {"_id": 0})
    ok = bool(doc and doc.get("password_hash")) and await asyncio.to_thread(
        lambda: bcrypt.checkpw(body.password.encode(), doc["password_hash"].encode())
    )
    if not ok:
        raise HTTPException(401, "Incorrect email or password")
    return _auth_response(doc)


@api.get("/auth/me")
async def auth_me(user: User = Depends(current_user)):
    return user.model_dump()


@api.post("/me/claim")
async def claim_device_data(body: ClaimIn, user: User = Depends(current_user)):
    """Move trips and chats made before sign-in (keyed by device) onto this member."""
    q = await db.quotes.update_many({"device_id": body.device_id, "user_id": None}, {"$set": {"user_id": user.user_id}})
    m = await db.concierge_messages.update_many({"device_id": body.device_id, "user_id": None}, {"$set": {"user_id": user.user_id}})
    return {"quotes": q.modified_count, "messages": m.modified_count}


@api.get("/fleet")
async def get_fleet():
    return FLEET


@api.get("/fleet/{jet_id}")
async def get_jet(jet_id: str):
    jet = FLEET_BY_ID.get(jet_id)
    if not jet:
        raise HTTPException(404, "Aircraft not found")
    return jet


@api.get("/airports")
async def get_airports():
    return AIRPORTS


POPULAR_ROUTES = [("FAB", "NCE"), ("MAN", "IBZ"), ("LTN", "GVA"), ("LAS", "VNY"), ("DXB", "LBG"), ("LIN", "OLB"), ("TEB", "PBI"), ("LPL", "PMI")]


@api.get("/routes/popular")
async def popular_routes():
    """Featured routes with the most economical nonstop aircraft and its estimate."""
    out = []
    for a, b in POPULAR_ROUTES:
        best = None
        for j in FLEET:
            e = estimate(a, b, j["id"], "one_way")
            if e["fuel_stops"] == 0 and (best is None or e["estimated_price_usd"] < best[1]["estimated_price_usd"]):
                best = (j, e)
        j, e = best
        out.append({
            "from_code": a, "to_code": b,
            "from_city": AIRPORTS_BY_CODE[a]["city"], "to_city": AIRPORTS_BY_CODE[b]["city"],
            "jet_id": j["id"], "jet_name": j["name"],
            "flight_minutes": e["flight_minutes"], "estimated_price_usd": e["estimated_price_usd"],
        })
    return out


@api.post("/quotes/estimate")
async def post_estimate(body: EstimateIn):
    return estimate(body.from_code, body.to_code, body.jet_id, body.trip_type)


@api.post("/quotes")
async def create_quote(body: QuoteIn, background: BackgroundTasks, user: User = Depends(current_user)):
    est = estimate(body.from_code, body.to_code, body.jet_id, body.trip_type)
    jet = FLEET_BY_ID[body.jet_id]
    if body.pax > jet["pax"]:
        raise HTTPException(400, f"{jet['name']} seats up to {jet['pax']} passengers")
    if body.trip_type == "return" and not body.return_date:
        raise HTTPException(400, "Return date required")
    _check_guests([body.lead_passenger], body.depart_date, body.return_date if body.trip_type == "return" else None)
    data = body.model_dump(exclude={"lead_passenger"})
    if AUTO_CONFIRM_TESTING:
        # Testing stage: confirm instantly at the estimated price so flows can be tried end to end.
        data.update(status="Confirmed", final_price_usd=est["estimated_price_usd"],
                    team_message="Auto-confirmed while SIDRA is in testing.")
    quote = Quote(
        **data,
        guests=[body.lead_passenger.model_dump()],
        user_id=user.user_id,
        jet_name=jet["name"],
        distance_nm=est["distance_nm"],
        flight_minutes=est["flight_minutes"],
        fuel_stops=est["fuel_stops"],
        estimated_price_usd=est["estimated_price_usd"],
        created_at=now_iso(),
    )
    res = await db.quotes.insert_one(quote.to_mongo())
    await _save_travellers(user.user_id, [body.lead_passenger.model_dump()])
    quote.id = str(res.inserted_id)
    background.add_task(_send_request_received, quote.id)
    return quote.public()


@api.get("/quotes")
async def list_quotes(user: User = Depends(current_user)):
    docs = await db.quotes.find({"user_id": user.user_id}).sort("created_at", -1).to_list(200)
    return [Quote.from_mongo(d).public() for d in docs]


def _oid(quote_id: str) -> ObjectId:
    if not ObjectId.is_valid(quote_id):
        raise HTTPException(404, "Trip not found")
    return ObjectId(quote_id)


@api.get("/quotes/{quote_id}")
async def get_quote(quote_id: str, user: User = Depends(current_user)):
    doc = await db.quotes.find_one({"_id": _oid(quote_id), "user_id": user.user_id})
    if not doc:
        raise HTTPException(404, "Trip not found")
    return Quote.from_mongo(doc).public()


@api.post("/quotes/{quote_id}/cancel")
async def cancel_quote(quote_id: str, user: User = Depends(current_user)):
    doc = await db.quotes.find_one_and_update(
        {"_id": _oid(quote_id), "user_id": user.user_id},
        {"$set": {"status": "Cancelled", "updated_at": now_iso()}},
        return_document=True,
    )
    if not doc:
        raise HTTPException(404, "Trip not found")
    return Quote.from_mongo(doc).public()


# ---------------------------------------------------------------- Payments (Stripe Checkout: card + Apple Pay)
class CheckoutIn(BaseModel):
    quote_id: str


def _stripe_ready():
    if not STRIPE_API_KEY:
        raise HTTPException(503, "Payments are not yet enabled")
    stripe.api_key = STRIPE_API_KEY


async def _mark_paid_if_complete(doc: dict) -> dict:
    sid = doc.get("stripe_session_id")
    if not sid or doc.get("payment_status") == "paid":
        return doc
    _stripe_ready()
    s = await asyncio.to_thread(stripe.checkout.Session.retrieve, sid)
    expected = int(round((doc.get("final_price_usd") or 0) * 100))
    if s.payment_status == "paid" and s.amount_total == expected and (s.metadata or {}).get("quote_id") == str(doc["_id"]):
        doc = await db.quotes.find_one_and_update(
            {"_id": doc["_id"], "payment_status": {"$ne": "paid"}},
            {"$set": {"payment_status": "paid", "paid_at": now_iso()}}, return_document=True,
        )
        if doc:  # first time we saw it paid: send the receipt once
            q = Quote.from_mongo(doc).public()
            subject, html = emailer.payment_receipt(q, AIRPORTS_BY_CODE, s.id)
            status = await _try_send(q["email"], subject, html, "Receipt email sent", "Receipt email failed")
            doc = await db.quotes.find_one_and_update({"_id": doc["_id"]}, {"$set": {"email_status": status}}, return_document=True)
            subject, html = emailer.team_payment_alert(q, AIRPORTS_BY_CODE)
            for to in TEAM_ALERT_EMAILS:
                await _try_send(to, subject, html, "ok", "failed")
        else:
            doc = await db.quotes.find_one({"_id": ObjectId(str((s.metadata or {}).get("quote_id")))})
    return doc


async def _create_session(**kwargs):
    return await asyncio.to_thread(stripe.checkout.Session.create, **kwargs)


@api.post("/payments/checkout")
async def create_checkout(body: CheckoutIn, request: Request, user: User = Depends(current_user)):
    doc = await db.quotes.find_one({"_id": _oid(body.quote_id), "user_id": user.user_id})
    if not doc:
        raise HTTPException(404, "Trip not found")
    if doc.get("status") != "Confirmed" or not doc.get("final_price_usd"):
        raise HTTPException(409, "Payment opens once the SIDRA team confirms your charter")
    if doc.get("payment_status") == "paid":
        raise HTTPException(409, "This charter has already been paid")
    _stripe_ready()
    base = f"{request.headers.get('x-forwarded-proto', request.url.scheme)}://{request.headers.get('x-forwarded-host', request.url.netloc)}"
    amount = int(round(doc["final_price_usd"] * 100))
    try:
        session = await _create_session(
        mode="payment",
        line_items=[{"price_data": {"currency": "usd", "unit_amount": amount,
                                    "product_data": {"name": f"SIDRA charter {doc['from_code']} to {doc['to_code']}",
                                                     "description": f"{doc['jet_name']} departing {doc['depart_date']}"}},
                     "quantity": 1}],
        customer_email=doc["email"],
        success_url=f"{base}/api/payments/return?status=success",
        cancel_url=f"{base}/api/payments/return?status=cancelled",
        metadata={"quote_id": str(doc["_id"]), "user_id": user.user_id},
            payment_intent_data={"metadata": {"quote_id": str(doc["_id"])}},
        )
    except stripe.StripeError as exc:
        logger.error("stripe checkout failed: %s", exc)
        raise HTTPException(503, "Payments are temporarily unavailable. Please try again shortly.")
    await db.quotes.update_one({"_id": doc["_id"]}, {"$set": {"stripe_session_id": session.id, "payment_status": "pending"}})
    return {"checkout_url": session.url}


@api.post("/payments/refresh/{quote_id}")
async def refresh_payment(quote_id: str, user: User = Depends(current_user)):
    doc = await db.quotes.find_one({"_id": _oid(quote_id), "user_id": user.user_id})
    if not doc:
        raise HTTPException(404, "Trip not found")
    return Quote.from_mongo(await _mark_paid_if_complete(doc)).public()


@api.get("/payments/return", include_in_schema=False)
async def payment_return(status: str = "success"):
    from fastapi.responses import HTMLResponse
    msg = "Payment received. Thank you." if status == "success" else "Payment was not completed."
    return HTMLResponse(f"""<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1">
<title>SIDRA</title></head><body style="margin:0;font-family:Helvetica,Arial,sans-serif;background:#111;color:#fff;display:flex;
align-items:center;justify-content:center;height:100vh;text-align:center"><div><div style="letter-spacing:8px;color:#A7A9AC">SIDRA</div>
<h2 style="font-weight:600">{msg}</h2><p style="color:#A7A9AC">You may close this window and return to the SIDRA app.</p></div></body></html>""")


# ---------------------------------------------------------------- Saved travellers
def _traveller_out(d: dict) -> dict:
    return {k: d.get(k) for k in ("id", "full_name", "nationality", "date_of_birth", "passport_number", "passport_expiry")}


@api.get("/travellers")
async def list_travellers(user: User = Depends(current_user)):
    docs = await db.travellers.find({"user_id": user.user_id}, {"_id": 0}).sort("full_name", 1).to_list(200)
    return [_traveller_out(d) for d in docs]


async def _save_travellers(user_id: str, guests: list[dict]) -> None:
    for g in guests:
        data = {k: g[k] for k in ("full_name", "nationality", "date_of_birth", "passport_number", "passport_expiry")}
        await db.travellers.update_one(
            {"user_id": user_id, "passport_number": data["passport_number"]},
            {"$set": {**data, "updated_at": now_iso()}, "$setOnInsert": {"id": uuid.uuid4().hex[:10], "user_id": user_id}},
            upsert=True,
        )


@api.delete("/travellers/{traveller_id}")
async def delete_traveller(traveller_id: str, user: User = Depends(current_user)):
    res = await db.travellers.delete_one({"user_id": user.user_id, "id": traveller_id})
    if not res.deleted_count:
        raise HTTPException(404, "Traveller not found")
    return {"ok": True}


# ---------------------------------------------------------------- Client access codes (team)
class AccessCodeIn(BaseModel):
    client_name: str = Field(min_length=1, max_length=120)
    code: Optional[str] = Field(default=None, pattern=r"^[A-Za-z0-9]{4,16}$")


@api.get("/admin/codes")
async def admin_codes(_: User = Depends(admin_user)):
    codes = [{"code": INVITE_CODE, "client_name": "SIDRA general access", "active": True, "is_default": True}]
    codes += [{**d, "is_default": False} for d in await db.access_codes.find({}, {"_id": 0}).sort("created_at", -1).to_list(500)]
    out = []
    for c in codes:
        users = await db.users.find({"referral_code": c["code"]}, {"user_id": 1, "_id": 0}).to_list(5000)
        ids = [u["user_id"] for u in users]
        charters, confirmed, revenue = 0, 0, 0.0
        if ids:
            async for q in db.quotes.find({"user_id": {"$in": ids}}, {"status": 1, "payment_status": 1, "final_price_usd": 1}):
                charters += 1
                if q.get("status") == "Confirmed":
                    confirmed += 1
                if q.get("payment_status") == "paid":
                    revenue += q.get("final_price_usd") or 0
        out.append({"code": c["code"], "client_name": c["client_name"], "active": c.get("active", True), "is_default": c["is_default"],
                    "members": len(ids), "charters": charters, "confirmed": confirmed, "paid_revenue_usd": revenue})
    out.sort(key=lambda r: (r["charters"], r["members"]), reverse=True)
    return out


@api.post("/admin/codes", status_code=201)
async def create_code(body: AccessCodeIn, _: User = Depends(admin_user)):
    code = (body.code or "").strip().upper() or str(secrets.randbelow(9_000_000) + 1_000_000)
    if code == INVITE_CODE or await db.access_codes.find_one({"code": code}):
        raise HTTPException(409, "That code is already in use")
    doc = {"code": code, "client_name": body.client_name.strip(), "active": True, "created_at": now_iso()}
    await db.access_codes.insert_one(doc)
    doc.pop("_id", None)
    return doc


@api.post("/admin/codes/{code}/toggle")
async def toggle_code(code: str, _: User = Depends(admin_user)):
    doc = await db.access_codes.find_one({"code": code})
    if not doc:
        raise HTTPException(404, "Code not found")
    await db.access_codes.update_one({"code": code}, {"$set": {"active": not doc.get("active", True)}})
    return {"code": code, "active": not doc.get("active", True)}


# ---------------------------------------------------------------- Team dashboard
@api.get("/admin/quotes")
async def admin_quotes(status: Optional[str] = None, _: User = Depends(admin_user)):
    filt = {"status": status} if status else {}
    docs = await db.quotes.find(filt).sort("created_at", -1).to_list(500)
    return [Quote.from_mongo(d).public() for d in docs]


@api.get("/admin/stats")
async def admin_stats(_: User = Depends(admin_user)):
    counts = {s: 0 for s in ["Requested", "Confirmed", "Unavailable", "Cancelled"]}
    async for row in db.quotes.aggregate([{"$group": {"_id": "$status", "n": {"$sum": 1}}}]):
        counts[row["_id"]] = row["n"]
    return counts


@api.get("/admin/quotes/{quote_id}")
async def admin_quote(quote_id: str, _: User = Depends(admin_user)):
    doc = await db.quotes.find_one({"_id": _oid(quote_id)})
    if not doc:
        raise HTTPException(404, "Trip not found")
    return Quote.from_mongo(doc).public()


@api.post("/admin/quotes/{quote_id}")
async def admin_update_quote(quote_id: str, body: AdminUpdateIn, _: User = Depends(admin_user)):
    if body.status == "Confirmed" and not body.final_price_usd:
        raise HTTPException(400, "Add a final price to confirm")
    doc = await db.quotes.find_one({"_id": _oid(quote_id)})
    if not doc:
        raise HTTPException(404, "Trip not found")
    if doc.get("status") == "Cancelled":
        raise HTTPException(400, "The member cancelled this request")
    update = {"status": body.status, "team_message": body.team_message.strip() or None, "updated_at": now_iso()}
    update["final_price_usd"] = body.final_price_usd if body.status == "Confirmed" else None
    doc = await db.quotes.find_one_and_update({"_id": doc["_id"]}, {"$set": update}, return_document=True)
    if body.status == "Confirmed":
        subject, html = emailer.flight_confirmed(Quote.from_mongo(doc).public(), AIRPORTS_BY_CODE)
        status = await _try_send(doc["email"], subject, html, "Confirmation email sent", "Confirmation email failed")
        doc = await db.quotes.find_one_and_update({"_id": doc["_id"]}, {"$set": {"email_status": status}}, return_document=True)
    return Quote.from_mongo(doc).public()


async def _try_send(to: str, subject: str, html: str, ok: str, fail: str) -> str:
    try:
        await emailer.send_email(to=to, subject=subject, html=html)
        return ok
    except Exception as exc:
        logger.error("member email failed: %s", exc)
        return fail


async def _send_request_received(quote_id: str) -> None:
    doc = await db.quotes.find_one({"_id": ObjectId(quote_id)})
    q = Quote.from_mongo(doc).public()
    if q["status"] == "Confirmed":
        subject, html = emailer.flight_confirmed(q, AIRPORTS_BY_CODE)
        status = await _try_send(doc["email"], subject, html, "Confirmation email sent", "Confirmation email failed")
    else:
        subject, html = emailer.request_received(q, AIRPORTS_BY_CODE)
        status = await _try_send(doc["email"], subject, html, "Request email sent", "Request email failed")
    await db.quotes.update_one({"_id": doc["_id"]}, {"$set": {"email_status": status}})
    # Alert the team inbox(es) straight away
    subject, html = emailer.team_alert(q, AIRPORTS_BY_CODE)
    for to in TEAM_ALERT_EMAILS:
        await _try_send(to, subject, html, "ok", "failed")


@api.put("/quotes/{quote_id}/guests")
async def save_guests(quote_id: str, body: GuestsIn, user: User = Depends(current_user)):
    doc = await db.quotes.find_one({"_id": _oid(quote_id), "user_id": user.user_id})
    if not doc:
        raise HTTPException(404, "Trip not found")
    if doc.get("status") == "Cancelled":
        raise HTTPException(400, "This request was cancelled")
    if len(body.guests) > doc["pax"]:
        raise HTTPException(400, f"This trip is for {doc['pax']} guests")
    _check_guests(body.guests, doc["depart_date"], doc.get("return_date"))
    guests = [g.model_dump() for g in body.guests]
    await _save_travellers(user.user_id, guests)
    doc = await db.quotes.find_one_and_update(
        {"_id": doc["_id"]}, {"$set": {"guests": guests, "updated_at": now_iso()}}, return_document=True
    )
    return Quote.from_mongo(doc).public()


# ---------------------------------------------------------------- Concierge
FLEET_SUMMARY = "\n".join(
    f"- {j['name']} ({j['maker']}): up to {j['pax']} pax, {j['range_nm']} nm range, from ${j['hourly_usd']:,}/hr" for j in FLEET
)
SYSTEM_PROMPT = f"""You are the SIDRA Concierge for SIDRA, an invitation only private jet charter service for corporate clients and executives.
Members charter Bombardier Global, Bombardier Challenger, Gulfstream and Boeing Business Jet (BBJ) aircraft.

Fleet:
{FLEET_SUMMARY}

You help with: choosing the right aircraft for a route and party size, in-flight catering, chauffeurs and ground transport,
hotels and villas, travelling with pets, special occasions, visas and documents guidance, FBO and lounge info.
Tone: professional, discreet, courteous and concise, suited to executives and executive assistants. Never use hyphens or dashes in your replies. Use short paragraphs or simple hyphen lists. Plain text only: no markdown bold, headings or emojis. Prices in USD.
You cannot confirm bookings or take payments yourself; for a charter, guide members to the Charter tab to send a quote request,
and say the SIDRA flight team will confirm availability. For service requests (catering, cars, hotels), acknowledge, gather key details,
and confirm the team will arrange it and follow up."""


@api.get("/concierge/history")
async def concierge_history(user: User = Depends(current_user)):
    docs = await db.concierge_messages.find({"user_id": user.user_id}).sort("created_at", 1).to_list(200)
    return [ConciergeMessage.from_mongo(d).public() for d in docs]


@api.delete("/concierge/history")
async def clear_history(user: User = Depends(current_user)):
    await db.concierge_messages.delete_many({"user_id": user.user_id})
    return {"ok": True}


@api.post("/concierge/stream")
async def concierge_stream(body: ChatIn, user: User = Depends(current_user)):
    prior = await db.concierge_messages.find({"user_id": user.user_id}).sort("created_at", -1).to_list(20)
    prior.reverse()
    transcript = "\n".join(f"{'Member' if m['role'] == 'user' else 'Concierge'}: {m['content']}" for m in prior)
    system = SYSTEM_PROMPT + (f"\n\nThe member's name is {user.name}." if user.name else "")
    system += f"\n\nConversation so far:\n{transcript}" if transcript else ""

    user_msg = ConciergeMessage(user_id=user.user_id, role="user", content=body.message, created_at=now_iso())
    await db.concierge_messages.insert_one(user_msg.to_mongo())

    chat = LlmChat(api_key=EMERGENT_LLM_KEY, session_id=f"concierge-{user.user_id}-{now_iso()}", system_message=system)
    chat.with_model("anthropic", "claude-sonnet-5-5")

    async def gen():
        parts: list[str] = []
        try:
            async for ev in chat.stream_message(UserMessage(text=body.message)):
                if isinstance(ev, TextDelta):
                    parts.append(ev.content)
                    yield f"data: {json.dumps({'delta': ev.content})}\n\n"
                elif isinstance(ev, StreamDone):
                    break
        except Exception as exc:
            logger.error("concierge stream failed: %s", exc)
            yield f"data: {json.dumps({'error': 'The concierge is momentarily unavailable. Please try again.'})}\n\n"
        full = "".join(parts).strip()
        if full:
            msg = ConciergeMessage(user_id=user.user_id, role="assistant", content=full, created_at=now_iso())
            await db.concierge_messages.insert_one(msg.to_mongo())
        yield f"data: {json.dumps({'done': True})}\n\n"

    return StreamingResponse(gen(), media_type="text/event-stream", headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"})


app.include_router(api)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
async def start_index_build():
    app.state.index_task = asyncio.create_task(ensure_indexes())
    app.state.reminder_task = asyncio.create_task(manifest_reminder_loop())


# ---------------------------------------------------------------- Manifest reminders
WINDOW_HOUR = {"Morning": 8, "Afternoon": 13, "Evening": 18, "Flexible": 9}
REMINDER_HOURS = 72
REMINDER_INTERVAL_SECONDS = 30 * 60


def departure_at(q: dict) -> datetime:
    d = datetime.strptime(q["depart_date"], "%Y-%m-%d")
    return d.replace(hour=WINDOW_HOUR.get(q.get("depart_window"), 9), tzinfo=timezone.utc)


async def send_manifest_reminders() -> int:
    """Email members whose trip departs within 72h and whose manifest is incomplete. Once per trip."""
    now = datetime.now(timezone.utc)
    horizon = (now + timedelta(hours=REMINDER_HOURS)).date().isoformat()
    cursor = db.quotes.find({
        "status": {"$in": ["Requested", "Confirmed"]},
        "depart_date": {"$gte": now.date().isoformat(), "$lte": horizon},
        "manifest_reminder_sent_at": None,
    })
    sent = 0
    async for doc in cursor:
        q = Quote.from_mongo(doc).public()
        dep = departure_at(q)
        if not (now < dep <= now + timedelta(hours=REMINDER_HOURS)):
            continue
        if len(q.get("guests") or []) >= q["pax"]:
            continue
        if datetime.fromisoformat(q["created_at"]) > now - timedelta(hours=1):
            continue  # give brand-new requests an hour first
        subject, html = emailer.manifest_reminder(q, AIRPORTS_BY_CODE)
        status = await _try_send(q["email"], subject, html, "sent", "failed")
        if status == "sent":
            await db.quotes.update_one({"_id": doc["_id"]}, {"$set": {"manifest_reminder_sent_at": now_iso()}})
            sent += 1
    return sent


async def manifest_reminder_loop():
    while True:
        try:
            n = await send_manifest_reminders()
            if n:
                logger.info("manifest reminders sent: %s", n)
        except Exception as exc:
            logger.error("manifest reminder sweep failed: %s", exc)
        await asyncio.sleep(REMINDER_INTERVAL_SECONDS)


@app.on_event("shutdown")
async def shutdown_db_client():
    app.state.index_task.cancel()
    app.state.reminder_task.cancel()
    with suppress(asyncio.CancelledError):
        await app.state.index_task
    with suppress(asyncio.CancelledError):
        await app.state.reminder_task
    client.close()
