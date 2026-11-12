import asyncio
import json
import math
from contextlib import suppress
from datetime import datetime, timezone
from typing import Annotated, Any, List, Literal, Optional

from bson import ObjectId
from dotenv import load_dotenv
from fastapi import APIRouter, FastAPI, HTTPException, Query
from fastapi.responses import StreamingResponse
from motor.motor_asyncio import AsyncIOMotorClient
from pydantic import BaseModel, BeforeValidator, ConfigDict, EmailStr, Field
from pymongo import ASCENDING, DESCENDING, IndexModel
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

logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(name)s - %(levelname)s - %(message)s")
logger = logging.getLogger(__name__)

INDEXES: dict[str, list[IndexModel]] = {
    "quotes": [
        IndexModel([("device_id", ASCENDING), ("created_at", DESCENDING)], name="device_created"),
    ],
    "concierge_messages": [
        IndexModel([("device_id", ASCENDING), ("created_at", ASCENDING)], name="device_created"),
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
     "highlights": ["Full-size master suite with shower option", "Nuage seats with zero-gravity recline", "Ka-band Wi-Fi throughout", "Range for Dubai–Los Angeles nonstop"]},
    {"id": "global-6500", "maker": "Bombardier", "family": "Global", "name": "Global 6500", "pax": 17, "range_nm": 6600, "speed_kts": 488, "hourly_usd": 13500, "cabin_ft": 43.3, "cabin_height_ft": 6.2, "living_spaces": 3,
     "tagline": "Smooth Flex Wing and a whisper-quiet cabin for long sectors.",
     "highlights": ["Three-zone cabin with private stateroom", "Lowest cabin altitude in class", "Nuage seating", "London–Hong Kong nonstop"]},
    {"id": "global-5500", "maker": "Bombardier", "family": "Global", "name": "Global 5500", "pax": 16, "range_nm": 5900, "speed_kts": 488, "hourly_usd": 12000, "cabin_ft": 40.7, "cabin_height_ft": 6.2, "living_spaces": 3,
     "tagline": "Intercontinental reach with a wide, light-filled cabin.",
     "highlights": ["Three living zones", "Full galley with oven", "Ka-band Wi-Fi", "Dubai–London with ease"]},
    {"id": "challenger-650", "maker": "Bombardier", "family": "Challenger", "name": "Challenger 650", "pax": 12, "range_nm": 4000, "speed_kts": 470, "hourly_usd": 8500, "cabin_ft": 25.6, "cabin_height_ft": 6.0, "living_spaces": 2,
     "tagline": "The widest cabin in its class. Proven, spacious, effortless.",
     "highlights": ["Widest large-jet cabin in class", "Divan converts to full bed", "Forward galley", "Dubai–Geneva nonstop"]},
    {"id": "challenger-3500", "maker": "Bombardier", "family": "Challenger", "name": "Challenger 3500", "pax": 10, "range_nm": 3400, "speed_kts": 470, "hourly_usd": 7000, "cabin_ft": 25.2, "cabin_height_ft": 6.0, "living_spaces": 2,
     "tagline": "Super-midsize perfected. Nuage seats and a flat-floor cabin.",
     "highlights": ["Nuage seats in a super-midsize", "Voice-controlled cabin", "Flat-floor cabin", "Transcontinental range"]},
    {"id": "g700", "maker": "Gulfstream", "family": "Gulfstream", "name": "Gulfstream G700", "pax": 19, "range_nm": 7750, "speed_kts": 516, "hourly_usd": 17500, "cabin_ft": 56.11, "cabin_height_ft": 6.25, "living_spaces": 5,
     "tagline": "The tallest, widest, longest cabin in the industry.",
     "highlights": ["Up to five living areas", "Ultragalley with crew rest", "Circadian lighting", "20 panoramic oval windows"]},
    {"id": "g650er", "maker": "Gulfstream", "family": "Gulfstream", "name": "Gulfstream G650ER", "pax": 18, "range_nm": 7500, "speed_kts": 516, "hourly_usd": 15500, "cabin_ft": 46.83, "cabin_height_ft": 6.25, "living_spaces": 4,
     "tagline": "An icon of ultra-long-range travel, near the speed of sound.",
     "highlights": ["Four living areas", "100% fresh air system", "Panoramic oval windows", "Dubai–New York nonstop"]},
    {"id": "g500", "maker": "Gulfstream", "family": "Gulfstream", "name": "Gulfstream G500", "pax": 13, "range_nm": 5300, "speed_kts": 488, "hourly_usd": 11000, "cabin_ft": 41.5, "cabin_height_ft": 6.17, "living_spaces": 3,
     "tagline": "Fast, quiet and quietly brilliant over long distances.",
     "highlights": ["Three living areas", "Active-control sidesticks", "Low cabin altitude", "Fresh air, every 2 minutes"]},
    {"id": "g280", "maker": "Gulfstream", "family": "Gulfstream", "name": "Gulfstream G280", "pax": 10, "range_nm": 3600, "speed_kts": 459, "hourly_usd": 6800, "cabin_ft": 25.10, "cabin_height_ft": 6.25, "living_spaces": 2,
     "tagline": "Super-midsize agility with Gulfstream refinement.",
     "highlights": ["19 oval windows", "Baggage accessible in flight", "Full-size galley", "Short-runway capable"]},
]
FLEET_BY_ID = {j["id"]: j for j in FLEET}

AIRPORTS = [
    {"code": "DXB", "city": "Dubai", "name": "Dubai International", "country": "UAE", "lat": 25.2532, "lon": 55.3657},
    {"code": "DWC", "city": "Dubai", "name": "Al Maktoum International", "country": "UAE", "lat": 24.8964, "lon": 55.1614},
    {"code": "AUH", "city": "Abu Dhabi", "name": "Zayed International", "country": "UAE", "lat": 24.4330, "lon": 54.6511},
    {"code": "DOH", "city": "Doha", "name": "Hamad International", "country": "Qatar", "lat": 25.2731, "lon": 51.6081},
    {"code": "RUH", "city": "Riyadh", "name": "King Khalid International", "country": "Saudi Arabia", "lat": 24.9576, "lon": 46.6988},
    {"code": "JED", "city": "Jeddah", "name": "King Abdulaziz International", "country": "Saudi Arabia", "lat": 21.6796, "lon": 39.1565},
    {"code": "FAB", "city": "London", "name": "Farnborough", "country": "United Kingdom", "lat": 51.2758, "lon": -0.7763},
    {"code": "LTN", "city": "London", "name": "Luton", "country": "United Kingdom", "lat": 51.8747, "lon": -0.3683},
    {"code": "LBG", "city": "Paris", "name": "Le Bourget", "country": "France", "lat": 48.9694, "lon": 2.4414},
    {"code": "NCE", "city": "Nice", "name": "Côte d'Azur", "country": "France", "lat": 43.6584, "lon": 7.2159},
    {"code": "GVA", "city": "Geneva", "name": "Geneva", "country": "Switzerland", "lat": 46.2381, "lon": 6.1090},
    {"code": "ZRH", "city": "Zurich", "name": "Zurich", "country": "Switzerland", "lat": 47.4647, "lon": 8.5492},
    {"code": "CIA", "city": "Rome", "name": "Ciampino", "country": "Italy", "lat": 41.7994, "lon": 12.5949},
    {"code": "LIN", "city": "Milan", "name": "Linate", "country": "Italy", "lat": 45.4451, "lon": 9.2767},
    {"code": "MAD", "city": "Madrid", "name": "Barajas", "country": "Spain", "lat": 40.4983, "lon": -3.5676},
    {"code": "IBZ", "city": "Ibiza", "name": "Ibiza", "country": "Spain", "lat": 38.8729, "lon": 1.3731},
    {"code": "IST", "city": "Istanbul", "name": "Istanbul", "country": "Türkiye", "lat": 41.2753, "lon": 28.7519},
    {"code": "TEB", "city": "New York", "name": "Teterboro", "country": "USA", "lat": 40.8501, "lon": -74.0608},
    {"code": "VNY", "city": "Los Angeles", "name": "Van Nuys", "country": "USA", "lat": 34.2098, "lon": -118.4897},
    {"code": "OPF", "city": "Miami", "name": "Opa-locka Executive", "country": "USA", "lat": 25.9070, "lon": -80.2784},
    {"code": "ASE", "city": "Aspen", "name": "Aspen/Pitkin County", "country": "USA", "lat": 39.2232, "lon": -106.8690},
    {"code": "BOM", "city": "Mumbai", "name": "Chhatrapati Shivaji", "country": "India", "lat": 19.0896, "lon": 72.8656},
    {"code": "MLE", "city": "Malé", "name": "Velana International", "country": "Maldives", "lat": 4.1918, "lon": 73.5291},
    {"code": "SIN", "city": "Singapore", "name": "Seletar", "country": "Singapore", "lat": 1.4172, "lon": 103.8678},
    {"code": "HKG", "city": "Hong Kong", "name": "Hong Kong International", "country": "Hong Kong", "lat": 22.3080, "lon": 113.9185},
    {"code": "HND", "city": "Tokyo", "name": "Haneda", "country": "Japan", "lat": 35.5494, "lon": 139.7798},
    {"code": "SYD", "city": "Sydney", "name": "Kingsford Smith", "country": "Australia", "lat": -33.9399, "lon": 151.1753},
    {"code": "CPT", "city": "Cape Town", "name": "Cape Town International", "country": "South Africa", "lat": -33.9715, "lon": 18.6021},
    {"code": "RAK", "city": "Marrakech", "name": "Menara", "country": "Morocco", "lat": 31.6069, "lon": -8.0363},
    {"code": "SEZ", "city": "Mahé", "name": "Seychelles International", "country": "Seychelles", "lat": -4.6743, "lon": 55.5218},
]
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
class QuoteIn(BaseModel):
    device_id: str = Field(min_length=6, max_length=64)
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


class EstimateIn(BaseModel):
    from_code: str
    to_code: str
    jet_id: str
    trip_type: Literal["one_way", "return"] = "one_way"


class Quote(BaseDocument):
    device_id: str
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
    created_at: str


class ConciergeMessage(BaseDocument):
    device_id: str
    role: Literal["user", "assistant"]
    content: str
    created_at: str


class ChatIn(BaseModel):
    device_id: str = Field(min_length=6, max_length=64)
    message: str = Field(min_length=1, max_length=2000)


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


@api.post("/quotes/estimate")
async def post_estimate(body: EstimateIn):
    return estimate(body.from_code, body.to_code, body.jet_id, body.trip_type)


@api.post("/quotes")
async def create_quote(body: QuoteIn):
    est = estimate(body.from_code, body.to_code, body.jet_id, body.trip_type)
    jet = FLEET_BY_ID[body.jet_id]
    if body.pax > jet["pax"]:
        raise HTTPException(400, f"{jet['name']} seats up to {jet['pax']} passengers")
    if body.trip_type == "return" and not body.return_date:
        raise HTTPException(400, "Return date required")
    quote = Quote(
        **body.model_dump(),
        jet_name=jet["name"],
        distance_nm=est["distance_nm"],
        flight_minutes=est["flight_minutes"],
        fuel_stops=est["fuel_stops"],
        estimated_price_usd=est["estimated_price_usd"],
        created_at=now_iso(),
    )
    res = await db.quotes.insert_one(quote.to_mongo())
    quote.id = str(res.inserted_id)
    return quote.public()


@api.get("/quotes")
async def list_quotes(device_id: str = Query(min_length=6)):
    docs = await db.quotes.find({"device_id": device_id}).sort("created_at", -1).to_list(200)
    return [Quote.from_mongo(d).public() for d in docs]


def _oid(quote_id: str) -> ObjectId:
    if not ObjectId.is_valid(quote_id):
        raise HTTPException(404, "Trip not found")
    return ObjectId(quote_id)


@api.get("/quotes/{quote_id}")
async def get_quote(quote_id: str, device_id: str = Query(min_length=6)):
    doc = await db.quotes.find_one({"_id": _oid(quote_id), "device_id": device_id})
    if not doc:
        raise HTTPException(404, "Trip not found")
    return Quote.from_mongo(doc).public()


@api.post("/quotes/{quote_id}/cancel")
async def cancel_quote(quote_id: str, device_id: str = Query(min_length=6)):
    doc = await db.quotes.find_one_and_update(
        {"_id": _oid(quote_id), "device_id": device_id},
        {"$set": {"status": "Cancelled"}},
        return_document=True,
    )
    if not doc:
        raise HTTPException(404, "Trip not found")
    return Quote.from_mongo(doc).public()


# ---------------------------------------------------------------- Concierge
FLEET_SUMMARY = "\n".join(
    f"- {j['name']} ({j['maker']}): up to {j['pax']} pax, {j['range_nm']} nm range, from ${j['hourly_usd']:,}/hr" for j in FLEET
)
SYSTEM_PROMPT = f"""You are the SIDRA Concierge, the private aviation concierge for SIDRA, an ad-hoc luxury jet charter service.
Members charter Bombardier Global, Bombardier Challenger and Gulfstream aircraft.

Fleet:
{FLEET_SUMMARY}

You help with: choosing the right aircraft for a route and party size, in-flight catering, chauffeurs and ground transport,
hotels and villas, travelling with pets, special occasions, visas and documents guidance, FBO and lounge info.
Tone: warm, discreet, refined, concise. Use short paragraphs or simple hyphen lists. Plain text only: no markdown bold, headings or emojis. Prices in USD.
You cannot confirm bookings or take payments yourself; for a charter, guide members to the Charter tab to send a quote request,
and say the SIDRA flight team will confirm availability. For service requests (catering, cars, hotels), acknowledge, gather key details,
and confirm the team will arrange it and follow up."""


@api.get("/concierge/history")
async def concierge_history(device_id: str = Query(min_length=6)):
    docs = await db.concierge_messages.find({"device_id": device_id}).sort("created_at", 1).to_list(200)
    return [ConciergeMessage.from_mongo(d).public() for d in docs]


@api.delete("/concierge/history")
async def clear_history(device_id: str = Query(min_length=6)):
    await db.concierge_messages.delete_many({"device_id": device_id})
    return {"ok": True}


@api.post("/concierge/stream")
async def concierge_stream(body: ChatIn):
    prior = await db.concierge_messages.find({"device_id": body.device_id}).sort("created_at", -1).to_list(20)
    prior.reverse()
    transcript = "\n".join(f"{'Member' if m['role'] == 'user' else 'Concierge'}: {m['content']}" for m in prior)
    system = SYSTEM_PROMPT + (f"\n\nConversation so far:\n{transcript}" if transcript else "")

    user_msg = ConciergeMessage(device_id=body.device_id, role="user", content=body.message, created_at=now_iso())
    await db.concierge_messages.insert_one(user_msg.to_mongo())

    chat = LlmChat(api_key=EMERGENT_LLM_KEY, session_id=f"concierge-{body.device_id}-{now_iso()}", system_message=system)
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
            msg = ConciergeMessage(device_id=body.device_id, role="assistant", content=full, created_at=now_iso())
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


@app.on_event("shutdown")
async def shutdown_db_client():
    app.state.index_task.cancel()
    with suppress(asyncio.CancelledError):
        await app.state.index_task
    client.close()
