"""Transactional member emails via Emergent managed email (Resend).

Recipients come from server-side quote records and bodies from the fixed templates below.
No route accepts a recipient, subject or HTML from the caller.
"""
import ipaddress
import logging
import os
import re
from html import escape
from html.parser import HTMLParser
from urllib.parse import urlparse

import httpx
from dotenv import load_dotenv
from pathlib import Path

load_dotenv(Path(__file__).parent / ".env")
logger = logging.getLogger(__name__)

EMAIL_BASE_URL = "https://integrations.emergentagent.com"
EMAIL_KEY = os.environ["EMERGENT_EMAIL_KEY"]
EMAIL_FROM_NAME = os.environ["EMAIL_FROM_NAME"]
EMAIL_REPLY_TO = os.environ.get("EMAIL_REPLY_TO")


class EmailError(Exception):
    pass


# ---------------------------------------------------------------- Guardrail gate (G2 + G3)
_SHORTENERS = ("bit.ly", "tinyurl.com", "t.co", "is.gd", "cutt.ly", "goo.gl", "rebrand.ly")
_CRED_ASK = ("reply with your password", "reply with the code", "send your password", "cvv",
             "send us your password", "enter your password below", "confirm your card number",
             "your full card number", "seed phrase", "recovery phrase", "verify your card",
             "social security number", "confirm your bank details")
_HOSTISH = re.compile(r"\b(?:https?://)?((?:[a-z0-9-]+\.)+[a-z]{2,})", re.I)


def _host_ok(host: str) -> bool:
    if not host or "xn--" in host:
        return False
    try:
        ipaddress.ip_address(host)
        return False
    except ValueError:
        pass
    return not any(host == s or host.endswith("." + s) for s in _SHORTENERS)


def _same_site(shown: str, real: str) -> bool:
    return shown == real or real.endswith("." + shown) or shown.endswith("." + real)


class _EmailScan(HTMLParser):
    def __init__(self):
        super().__init__()
        self.tags, self.urls, self.anchors = set(), [], []
        self._href, self._text = None, []

    def handle_starttag(self, tag, attrs):
        self.tags.add(tag.lower())
        self.urls += [v for k, v in attrs if k.lower() in ("href", "src") and v]
        if tag.lower() == "a":
            self._href = dict((k.lower(), v) for k, v in attrs).get("href")
            self._text = []

    def handle_data(self, data):
        if self._href is not None:
            self._text.append(data)

    def handle_endtag(self, tag):
        if tag.lower() == "a" and self._href is not None:
            self.anchors.append((self._href, "".join(self._text)))
            self._href, self._text = None, []


def _assert_safe_email(subject: str, html: str) -> None:
    scan = _EmailScan()
    scan.feed(html)
    if scan.tags & {"form", "input", "textarea", "select"}:
        raise ValueError("No forms or input fields in email (G2)")
    body = f"{subject}\n{html}".lower()
    for p in _CRED_ASK:
        if p in body:
            raise ValueError(f"Email asks the recipient for credentials: {p!r} (G2)")
    for url in scan.urls:
        low = url.strip().lower()
        if low.startswith(("mailto:", "tel:", "cid:", "#")):
            continue
        if not low.startswith("https://"):
            raise ValueError(f"Email links/assets must be absolute https: {url!r} (G3)")
        host = urlparse(low).hostname or ""
        if not _host_ok(host) or urlparse(low).username is not None:
            raise ValueError(f"Shortened, numeric-host or credential-bearing URL: {url!r} (G3)")
    for href, text in scan.anchors:
        real = urlparse(href.strip().lower()).hostname or ""
        if not real:
            continue
        for m in _HOSTISH.finditer(text):
            if not _same_site(m.group(1).lower(), real):
                raise ValueError(f"Anchor text {m.group(1)!r} ≠ real link host {real!r} (G3)")


async def send_email(*, to: str, subject: str, html: str) -> str | None:
    _assert_safe_email(subject, html)
    payload = {"to": [to], "subject": subject, "html": html, "from_name": EMAIL_FROM_NAME}
    if EMAIL_REPLY_TO:
        payload["contact_email"] = EMAIL_REPLY_TO
    try:
        async with httpx.AsyncClient(timeout=30) as client:
            resp = await client.post(f"{EMAIL_BASE_URL}/api/v1/email/send", headers={"X-Email-Key": EMAIL_KEY}, json=payload)
        resp.raise_for_status()
        return resp.json().get("id")
    except httpx.HTTPStatusError as e:
        try:
            body = e.response.json()
        except ValueError:
            body = {}
        code = body.get("code", "")
        if code in ("insufficient_credits", "integration_disabled", "daily_limit_reached"):
            logger.warning("Email paused: %s (%s): %s", code, e.response.status_code, body.get("message", ""))
            raise EmailError("Email is temporarily unavailable")
        logger.error("Email send failed: %s %s", e.response.status_code, e.response.text)
        raise EmailError("Failed to send email")
    except Exception as e:
        logger.error("Email send error: %s", e)
        raise EmailError("Failed to send email")


# ---------------------------------------------------------------- Templates
def _fmt_date(iso: str) -> str:
    from datetime import date
    y, m, d = (int(x) for x in iso.split("-"))
    return date(y, m, d).strftime("%a %d %b %Y")


def _row(label: str, value: str) -> str:
    return (
        f'<tr><td style="padding:10px 0;border-bottom:1px solid #EEEEEE;font-size:12px;color:#888888;'
        f'letter-spacing:1px;text-transform:uppercase;width:42%">{escape(label)}</td>'
        f'<td style="padding:10px 0;border-bottom:1px solid #EEEEEE;font-size:15px;color:#111111">{escape(value)}</td></tr>'
    )


def _layout(preheader: str, heading: str, intro: str, q: dict, airports: dict, extra_rows: list[tuple[str, str]], closing: str) -> str:
    a, b = airports.get(q["from_code"], {}), airports.get(q["to_code"], {})
    mins = q["flight_minutes"]
    rows = [
        ("Departs", f"{_fmt_date(q['depart_date'])} · {q['depart_window']}"),
        ("Return", _fmt_date(q["return_date"]) if q.get("trip_type") == "return" and q.get("return_date") else "One way"),
        ("Aircraft", q["jet_name"]),
        ("Guests", str(q["pax"])),
        ("Flight time", f"{mins // 60}h {mins % 60:02d}m" + (f" · {q['fuel_stops']} fuel stop" if q.get("fuel_stops") else " · Nonstop")),
    ] + extra_rows
    return f"""<!doctype html><html><body style="margin:0;padding:0;background:#F7F7F7">
<span style="display:none;max-height:0;overflow:hidden">{escape(preheader)}</span>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F7F7F7"><tr><td align="center" style="padding:32px 16px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#FFFFFF;font-family:Helvetica,Arial,sans-serif">
<tr><td style="background:#111111;padding:22px 32px;color:#A7A9AC;font-size:13px;letter-spacing:8px">{escape(EMAIL_FROM_NAME.upper())}</td></tr>
<tr><td style="padding:36px 32px 8px 32px">
<div style="font-family:Georgia,'Times New Roman',serif;font-size:28px;line-height:34px;color:#111111">{escape(heading)}</div>
<p style="font-size:15px;line-height:23px;color:#333333;margin:14px 0 0 0">{intro}</p>
</td></tr>
<tr><td style="padding:24px 32px 0 32px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
<td style="font-size:34px;font-weight:bold;letter-spacing:2px;color:#111111">{escape(q['from_code'])}<div style="font-size:12px;font-weight:normal;letter-spacing:0;color:#666666">{escape(a.get('city', ''))}</div></td>
<td align="center" style="color:#9A9DA3;font-size:20px">&#8594;</td>
<td align="right" style="font-size:34px;font-weight:bold;letter-spacing:2px;color:#111111">{escape(q['to_code'])}<div style="font-size:12px;font-weight:normal;letter-spacing:0;color:#666666">{escape(b.get('city', ''))}</div></td>
</tr></table></td></tr>
<tr><td style="padding:16px 32px 8px 32px"><table role="presentation" width="100%" cellpadding="0" cellspacing="0">{''.join(_row(l, v) for l, v in rows)}</table></td></tr>
<tr><td style="padding:16px 32px 32px 32px;font-size:14px;line-height:22px;color:#333333">{closing}</td></tr>
<tr><td style="padding:18px 32px;border-top:1px solid #EEEEEE;font-size:11px;line-height:17px;color:#888888">
Sent by {escape(EMAIL_FROM_NAME)} Private Charter. Reply to this email to reach the team. We never ask for passwords or card details by email.</td></tr>
</table></td></tr></table></body></html>"""


def usd(n: float) -> str:
    return f"${round(n):,}"


def request_received(q: dict, airports: dict) -> tuple[str, str]:
    first = escape(q["name"].split(" ")[0])
    subject = f"Quote request received · {q['from_code']} to {q['to_code']}"
    html = _layout(
        "Your SIDRA charter request is with our flight team.",
        "Your request is with us.",
        f"Thank you, {first}. Our flight team is checking aircraft availability and will send your final quote shortly.",
        q,
        airports,
        [("Estimate", f"{usd(q['estimated_price_usd'])} USD")],
        "The estimate above is indicative. Open the SIDRA app to follow your trip or speak with the concierge about catering, chauffeurs or anything else.",
    )
    return subject, html


def flight_confirmed(q: dict, airports: dict) -> tuple[str, str]:
    first = escape(q["name"].split(" ")[0])
    subject = f"Your flight is confirmed · {q['from_code']} to {q['to_code']}"
    note = (
        f'<div style="background:#F3F4F5;padding:16px;margin-bottom:16px"><div style="font-size:11px;letter-spacing:1px;color:#5E6166;'
        f'text-transform:uppercase;margin-bottom:6px">From the SIDRA team</div>{escape(q["team_message"])}</div>'
        if q.get("team_message")
        else ""
    )
    html = _layout(
        "Your SIDRA flight is confirmed with your final price.",
        "Your flight is confirmed.",
        f"Wonderful news, {first}. Your aircraft is secured and your final price is below.",
        q,
        airports,
        [("Final price", f"{usd(q['final_price_usd'])} USD")],
        note + "You can share the itinerary with your guests from the trip in the SIDRA app.",
    )
    return subject, html
