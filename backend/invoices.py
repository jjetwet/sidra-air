"""Branded PDF charter invoices (reportlab)."""
from io import BytesIO

from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.units import mm
from reportlab.pdfgen import canvas

INK = colors.HexColor("#111111")
MUTED = colors.HexColor("#888888")
SILVER = colors.HexColor("#9A9DA3")
LINE = colors.HexColor("#E5E5E5")


def _usd(n: float) -> str:
    return f"${n:,.2f}"


def build_invoice(q: dict, company: dict | None, airports: dict) -> bytes:
    buf = BytesIO()
    c = canvas.Canvas(buf, pagesize=A4)
    w, h = A4
    m = 20 * mm

    # Header band
    c.setFillColor(INK)
    c.rect(0, h - 38 * mm, w, 38 * mm, fill=1, stroke=0)
    c.setFillColor(SILVER)
    c.setFont("Helvetica", 18)
    c.drawString(m, h - 22 * mm, "S I D R A")
    c.setFont("Helvetica", 9)
    c.drawString(m, h - 29 * mm, "Private Charter")
    c.setFillColor(colors.white)
    c.setFont("Helvetica-Bold", 20)
    c.drawRightString(w - m, h - 22 * mm, "INVOICE")
    c.setFont("Helvetica", 9)
    c.drawRightString(w - m, h - 29 * mm, f"{q.get('invoice_number') or ''}  ·  Paid {str(q.get('paid_at') or '')[:10]}")

    # Billed to
    y = h - 54 * mm
    c.setFillColor(MUTED)
    c.setFont("Helvetica", 8)
    c.drawString(m, y, "BILLED TO")
    c.setFillColor(INK)
    c.setFont("Helvetica-Bold", 11)
    y -= 6 * mm
    c.drawString(m, y, company["name"] if company else q["name"])
    c.setFont("Helvetica", 9.5)
    lines = []
    if company:
        lines += [l for l in (company.get("billing_address") or "").split("\n") if l.strip()]
        if company.get("vat_number"):
            lines.append(f"VAT / Tax ID: {company['vat_number']}")
        lines.append(f"Booked by {q['name']}")
    lines.append(q["email"])
    for l in lines:
        y -= 5 * mm
        c.drawString(m, y, l[:90])

    # Route
    a, b = airports.get(q["from_code"], {}), airports.get(q["to_code"], {})
    y -= 14 * mm
    c.setFont("Helvetica-Bold", 26)
    c.drawString(m, y, q["from_code"])
    c.drawRightString(w - m, y, q["to_code"])
    c.setFillColor(SILVER)
    c.setDash(3, 3)
    c.line(m + 30 * mm, y + 3 * mm, w - m - 30 * mm, y + 3 * mm)
    c.setDash()
    c.setFillColor(MUTED)
    c.setFont("Helvetica", 9)
    y -= 5 * mm
    c.drawString(m, y, f"{a.get('name', '')}, {a.get('city', '')}"[:60])
    c.drawRightString(w - m, y, f"{b.get('name', '')}, {b.get('city', '')}"[:60])

    # Line items table
    y -= 14 * mm
    c.setStrokeColor(LINE)
    c.line(m, y + 4 * mm, w - m, y + 4 * mm)
    c.setFillColor(MUTED)
    c.setFont("Helvetica", 8)
    c.drawString(m, y, "DESCRIPTION")
    c.drawRightString(w - m, y, "AMOUNT (USD)")
    y -= 4 * mm
    c.line(m, y, w - m, y)
    mins = q["flight_minutes"]
    ret = f", returning {q['return_date']}" if q.get("trip_type") == "return" and q.get("return_date") else ""
    desc = [
        f"Private charter, {q['jet_name']}",
        f"Departing {q['depart_date']} ({q['depart_window']}){ret}",
        f"{q['pax']} passengers  ·  {q['distance_nm']:,} nm  ·  {mins // 60}h {mins % 60:02d}m per leg",
    ]
    c.setFillColor(INK)
    y -= 7 * mm
    c.setFont("Helvetica-Bold", 10)
    c.drawString(m, y, desc[0])
    c.drawRightString(w - m, y, _usd(q["final_price_usd"]))
    c.setFont("Helvetica", 9)
    for d in desc[1:]:
        y -= 5 * mm
        c.setFillColor(MUTED)
        c.drawString(m, y, d)
    y -= 8 * mm
    c.line(m, y, w - m, y)

    # Totals
    y -= 8 * mm
    c.setFillColor(INK)
    c.setFont("Helvetica", 10)
    c.drawString(w - m - 70 * mm, y, "Total")
    c.setFont("Helvetica-Bold", 14)
    c.drawRightString(w - m, y, _usd(q["final_price_usd"]))
    y -= 6 * mm
    c.setFont("Helvetica", 9)
    c.setFillColor(MUTED)
    c.drawString(w - m - 70 * mm, y, f"Amount paid by {(q.get('payment_method') or 'card').lower()}")
    c.drawRightString(w - m, y, _usd(q["final_price_usd"]))
    y -= 5 * mm
    c.drawString(w - m - 70 * mm, y, "Balance due")
    c.drawRightString(w - m, y, _usd(0))

    # Footer
    c.setFont("Helvetica", 8)
    c.drawString(m, 18 * mm, "Thank you for flying with SIDRA. Please retain this invoice for your records.")
    c.drawString(m, 13 * mm, "Questions about this invoice? Reply to your SIDRA receipt email.")
    c.showPage()
    c.save()
    return buf.getvalue()
