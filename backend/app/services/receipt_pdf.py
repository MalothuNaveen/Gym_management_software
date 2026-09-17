"""Professional PDF receipt rendering with ReportLab.

Two page sizes are supported: A4 (default, for filing and email) and an 80 mm
thermal roll (for a counter printer). Both are driven by the same frozen
snapshot, so a reprint always matches the original.
"""
from __future__ import annotations

import io
import logging
import os

from reportlab.lib.colors import Color, HexColor
from reportlab.lib.pagesizes import A4
from reportlab.lib.utils import ImageReader
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.pdfgen import canvas as pdfcanvas

logger = logging.getLogger("gym")

MM = 72.0 / 25.4
RUPEE = "\u20b9"

INK = HexColor("#111827")
MUTED = HexColor("#6B7280")
LINE = HexColor("#E5E7EB")
PANEL = HexColor("#F9FAFB")
DUE = HexColor("#B45309")
CREDIT = HexColor("#047857")

# Fonts known to carry the Indian Rupee sign (U+20B9). The Docker image installs
# fonts-dejavu-core; the Windows and macOS entries cover local development.
_FONT_CANDIDATES = [
    ("/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
     "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"),
    ("/usr/share/fonts/dejavu/DejaVuSans.ttf",
     "/usr/share/fonts/dejavu/DejaVuSans-Bold.ttf"),
    ("C:/Windows/Fonts/segoeui.ttf", "C:/Windows/Fonts/segoeuib.ttf"),
    ("C:/Windows/Fonts/Nirmala.ttf", "C:/Windows/Fonts/NirmalaB.ttf"),
    ("/System/Library/Fonts/Supplemental/Arial Unicode.ttf",
     "/System/Library/Fonts/Supplemental/Arial Unicode.ttf"),
]

_fonts: tuple[str, str, bool] | None = None


def _resolve_fonts() -> tuple[str, str, bool]:
    """Return (regular, bold, supports_rupee_glyph).

    Falls back to built-in Helvetica, which cannot draw the rupee sign; in that
    case amounts print as 'Rs.' instead, which every printer handles.
    """
    global _fonts
    if _fonts is not None:
        return _fonts

    for regular_path, bold_path in _FONT_CANDIDATES:
        if not os.path.exists(regular_path):
            continue
        try:
            pdfmetrics.registerFont(TTFont("GymSans", regular_path))
            bold_name = "GymSans"
            if os.path.exists(bold_path) and bold_path != regular_path:
                pdfmetrics.registerFont(TTFont("GymSans-Bold", bold_path))
                bold_name = "GymSans-Bold"
            face = pdfmetrics.getFont("GymSans").face
            if ord(RUPEE) not in getattr(face, "charToGlyph", {}):
                continue
            _fonts = ("GymSans", bold_name, True)
            return _fonts
        except Exception as exc:  # pragma: no cover - font-specific
            logger.debug("Font %s unusable: %s", regular_path, exc)

    _fonts = ("Helvetica", "Helvetica-Bold", False)
    return _fonts


def _amount(text: str, has_rupee: bool) -> str:
    return text if has_rupee else text.replace(RUPEE, "Rs.")


def _is_zero(text: str) -> bool:
    return text.replace(RUPEE, "").replace("Rs.", "").strip() in ("0", "0.00")


class _Renderer:
    """A cursor that walks down the page, so layout reads top to bottom."""

    def __init__(self, c: pdfcanvas.Canvas, width: float, margin: float):
        self.c = c
        self.width = width
        self.margin = margin
        self.regular, self.bold, self.has_rupee = _resolve_fonts()
        self.right = width - margin
        self.y = 0.0

    def text(self, x: float, size: float, value: str, *, bold: bool = False,
             color: Color = INK, align: str = "left") -> None:
        self.c.setFont(self.bold if bold else self.regular, size)
        self.c.setFillColor(color)
        if align == "right":
            self.c.drawRightString(x, self.y, value)
        elif align == "center":
            self.c.drawCentredString(x, self.y, value)
        else:
            self.c.drawString(x, self.y, value)

    def rule(self, gap: float = 10, color: Color = LINE) -> None:
        self.y -= gap
        self.c.setStrokeColor(color)
        self.c.setLineWidth(0.7)
        self.c.line(self.margin, self.y, self.right, self.y)
        self.y -= gap

    def row(self, label: str, value: str, *, size: float = 9.5,
            bold_value: bool = False, gap: float = 15) -> None:
        """Label on the left, value right-aligned to the margin."""
        self.text(self.margin, size, label, color=MUTED)
        self.text(self.right, size, value, bold=bold_value, align="right")
        self.y -= gap

    def money_row(self, label: str, value: str, *, size: float = 10,
                  bold: bool = False, gap: float = 16,
                  color: Color = INK) -> None:
        self.text(self.margin, size, label, color=INK if bold else MUTED,
                  bold=bold)
        self.text(self.right, size, _amount(value, self.has_rupee), bold=bold,
                  color=color, align="right")
        self.y -= gap


def render_receipt_pdf(snapshot: dict, logo_bytes: bytes | None = None,
                       size: str = "a4") -> bytes:
    """Render a frozen receipt snapshot to PDF bytes."""
    thermal = size == "thermal"
    if thermal:
        page_w, page_h, margin = 80 * MM, 250 * MM, 6 * MM
    else:
        page_w, page_h = A4
        margin = 18 * MM

    buf = io.BytesIO()
    c = pdfcanvas.Canvas(buf, pagesize=(page_w, page_h))
    gym = snapshot["gym"]
    c.setTitle("Receipt " + snapshot["receipt_no"] + " - " + gym["name"])
    c.setAuthor(gym["name"])
    c.setSubject("Payment Receipt")

    r = _Renderer(c, page_w, margin)
    r.y = page_h - margin

    # ---- Header: logo + gym identity ------------------------------------
    header_top = r.y
    text_x = margin
    logo_height = 0.0
    if logo_bytes:
        try:
            img = ImageReader(io.BytesIO(logo_bytes))
            box = 34 if thermal else 46
            iw, ih = img.getSize()
            scale = min(box / iw, box / ih)
            w, h = iw * scale, ih * scale
            if thermal:
                c.drawImage(img, (page_w - w) / 2, r.y - h, w, h,
                            mask="auto", preserveAspectRatio=True)
                r.y -= h + 8
            else:
                c.drawImage(img, margin, r.y - h, w, h, mask="auto",
                            preserveAspectRatio=True)
                text_x = margin + w + 12
                logo_height = h
        except Exception as exc:  # pragma: no cover - a bad logo must not break
            logger.warning("Could not draw logo on receipt: %s", exc)

    align = "center" if thermal else "left"
    anchor = page_w / 2 if thermal else text_x
    r.y -= 13
    r.text(anchor, 15 if thermal else 17, gym["name"].upper(), bold=True,
           align=align)
    r.y -= 13
    for line in [x for x in (gym.get("address"), gym.get("phone"),
                             gym.get("email")) if x]:
        r.text(anchor, 8.5, line, color=MUTED, align=align)
        r.y -= 11

    if logo_height:
        r.y = min(r.y, header_top - logo_height - 4)

    r.rule(12)

    # ---- Title ----------------------------------------------------------
    r.y -= 4
    r.text(page_w / 2, 12.5, "PAYMENT RECEIPT", bold=True, align="center")
    r.y -= 20

    # ---- Receipt number + date ------------------------------------------
    if thermal:
        r.row("Receipt No", snapshot["receipt_no"], bold_value=True, gap=13)
        r.row("Date", snapshot["issued_on"], gap=13)
    else:
        panel_h = 36
        c.setFillColor(PANEL)
        c.setStrokeColor(LINE)
        c.roundRect(margin, r.y - panel_h + 13, r.right - margin, panel_h,
                    4, stroke=1, fill=1)
        r.y -= 4
        r.text(margin + 10, 8, "RECEIPT NO.", color=MUTED)
        r.text(r.right - 10, 8, "DATE", color=MUTED, align="right")
        r.y -= 14
        r.text(margin + 10, 11, snapshot["receipt_no"], bold=True)
        r.text(r.right - 10, 11, snapshot["issued_on"], bold=True, align="right")
        r.y -= 24

    # ---- Member ---------------------------------------------------------
    r.y -= 4
    r.text(margin, 8, "MEMBER", color=MUTED)
    r.y -= 15
    member = snapshot["member"]
    r.text(margin, 12, member["name"], bold=True)
    r.text(r.right, 10, member["code"], align="right", color=MUTED)
    r.y -= 14
    if member.get("phone"):
        r.text(margin, 9, member["phone"], color=MUTED)
        r.y -= 14

    ms = snapshot["membership"]
    if ms.get("plan") and ms["plan"] != "-":
        r.rule(9)
        r.y -= 2
        r.row("Membership Plan", ms["plan"], bold_value=True, gap=14)
        r.row("Start Date", ms["start"], gap=14)
        r.row("Expiry Date", ms["end"], gap=14)

    # ---- Amounts --------------------------------------------------------
    r.rule(10)
    amounts = snapshot["amounts"]
    r.y -= 2
    r.money_row("Membership Fee", amounts["fee_text"])
    if not _is_zero(amounts["discount_text"]):
        r.money_row("Discount", "- " + amounts["discount_text"])
        r.money_row("Net Amount", amounts["final_amount_text"])

    r.rule(8)
    r.y -= 2
    r.money_row("PAID NOW", amounts["paid_text"], size=12.5, bold=True, gap=18)

    credit_text = RUPEE + str(amounts.get("credit", "0"))
    if not _is_zero(amounts["balance_text"]):
        r.money_row("Balance Due", amounts["balance_text"], size=10.5,
                    bold=True, color=DUE)
    elif not _is_zero(credit_text):
        r.money_row("Advance Credit", credit_text, size=10, color=CREDIT)
    else:
        r.money_row("Balance", RUPEE + "0", size=10)

    r.rule(8)
    r.y -= 2
    r.row("Payment Method", snapshot["payment"]["method"], bold_value=True)
    if snapshot["payment"].get("notes"):
        r.y -= 2
        r.text(margin, 8.5, "Note: " + snapshot["payment"]["notes"][:120],
               color=MUTED)
        r.y -= 14

    # ---- Footer ---------------------------------------------------------
    r.rule(12)
    r.y -= 6
    r.text(page_w / 2, 10, snapshot.get("footer") or "Thank you!",
           align="center")
    r.y -= 14
    r.text(page_w / 2, 7.5, "This is a computer generated receipt.",
           color=MUTED, align="center")

    c.showPage()
    c.save()
    return buf.getvalue()
