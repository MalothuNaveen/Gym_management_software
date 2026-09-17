"""Validation and compression for uploaded photos.

Anything the browser sends is re-encoded through Pillow. That both shrinks the
file (a 4 MB phone photo becomes roughly 60 KB) and guarantees the stored bytes
are a real image rather than a renamed script.
"""
import io

from PIL import Image, ImageOps, UnidentifiedImageError

from app.config import settings
from app.errors import AppError

ALLOWED_CONTENT_TYPES = {
    "image/jpeg", "image/jpg", "image/png", "image/webp", "image/heic",
    "image/heif",
}
ALLOWED_FORMATS = {"JPEG", "PNG", "WEBP", "MPO", "HEIF", "HEIC"}


def process_photo(raw: bytes, content_type: str | None,
                  max_dimension: int | None = None) -> tuple[bytes, str]:
    """Return (jpeg_bytes, 'image/jpeg'). Raises AppError with a plain message."""
    if not raw:
        raise AppError("No image was received. Please try again.")
    if len(raw) > settings.MAX_UPLOAD_BYTES:
        mb = settings.MAX_UPLOAD_BYTES // (1024 * 1024)
        raise AppError(f"That image is too large. Please use a photo under {mb} MB.")
    if content_type and content_type.split(";")[0].strip().lower() \
            not in ALLOWED_CONTENT_TYPES:
        raise AppError("Please upload a JPG, PNG or WEBP image.")

    try:
        img = Image.open(io.BytesIO(raw))
        img.verify()                       # cheap structural check
        img = Image.open(io.BytesIO(raw))  # re-open: verify() consumes the file
    except (UnidentifiedImageError, OSError, ValueError) as exc:
        raise AppError("That file is not a valid image.") from exc

    if (img.format or "").upper() not in ALLOWED_FORMATS:
        raise AppError("Please upload a JPG, PNG or WEBP image.")

    # Honour the phone's rotation flag, then flatten to RGB for JPEG.
    img = ImageOps.exif_transpose(img)
    if img.mode not in ("RGB", "L"):
        background = Image.new("RGB", img.size, (255, 255, 255))
        rgba = img.convert("RGBA")
        background.paste(rgba, mask=rgba.split()[-1])
        img = background
    else:
        img = img.convert("RGB")

    limit = max_dimension or settings.PHOTO_MAX_DIMENSION
    img.thumbnail((limit, limit), Image.LANCZOS)

    out = io.BytesIO()
    img.save(out, format="JPEG", quality=settings.PHOTO_JPEG_QUALITY,
             optimize=True, progressive=True)
    return out.getvalue(), "image/jpeg"
