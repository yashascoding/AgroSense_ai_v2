from __future__ import annotations

import logging

import cloudinary
import cloudinary.uploader
from config.settings import Config
from utils.errors import PredictionPipelineError

logger = logging.getLogger(__name__)

_CLOUDINARY_CONFIG_CODE = "CLOUDINARY_CONFIG"
_USER_TOAST_HINT = "Image upload configuration is missing. Check Cloudinary env setup."


def configure_cloudinary() -> None:
    if not Config.cloudinary_credentials_present():
        logger.warning(
            "Cloudinary: incomplete env — need CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET"
        )
        raise PredictionPipelineError(_USER_TOAST_HINT, 503, error_code=_CLOUDINARY_CONFIG_CODE)
    if not Config.cloudinary_cloud_name_plausible():
        logger.warning(
            "Cloudinary: CLOUDINARY_CLOUD_NAME fails validation — use the dashboard cloud name, not e.g. MySQL 'root'"
        )
        raise PredictionPipelineError(_USER_TOAST_HINT, 503, error_code=_CLOUDINARY_CONFIG_CODE)
    cloudinary.config(
        cloud_name=Config.cloudinary_cloud_name(),
        api_key=Config.cloudinary_api_key(),
        api_secret=Config.cloudinary_api_secret(),
    )


def upload_image_bytes(raw: bytes, folder: str = "cropguard") -> str:
    if not raw:
        raise PredictionPipelineError("No image data to upload", 400)
    configure_cloudinary()
    try:
        result = cloudinary.uploader.upload(
            raw,
            folder=folder,
            resource_type="image",
        )
    except Exception as exc:
        msg = str(exc).lower()
        if "invalid cloud_name" in msg or "invalid cloud name" in msg:
            logger.warning("Cloudinary API rejected cloud_name — check CLOUDINARY_CLOUD_NAME in backend/.env")
            raise PredictionPipelineError(_USER_TOAST_HINT, 502, error_code=_CLOUDINARY_CONFIG_CODE) from exc
        logger.exception("Cloudinary upload failed")
        raise PredictionPipelineError(f"Cloudinary upload failed: {exc}", 502) from exc
    url = result.get("secure_url")
    if not url:
        raise PredictionPipelineError("Cloudinary did not return a secure_url", 502)
    return str(url)
