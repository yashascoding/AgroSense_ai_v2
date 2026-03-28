from __future__ import annotations

import io
import json
import logging
import time

import requests
from PIL import Image
from requests.adapters import HTTPAdapter
from urllib3.exceptions import IncompleteRead, ProtocolError
from urllib3.util.retry import Retry

from config.settings import Config
from utils.errors import PredictionPipelineError

logger = logging.getLogger(__name__)

# Small payloads + Connection: close reduce IncompleteRead on HF edge / Windows proxies.
_MAX_EDGE = 448
_JPEG_QUALITY = 80

_UX_MESSAGE = "AI analysis service is temporarily unavailable. Please try again."
_ERROR_CODE = "HF_UNAVAILABLE"
_HF_AUTH_CODE = "HF_AUTH"
_HF_AUTH_MESSAGE = (
    "Hugging Face rejected this API key for inference (HTTP 403). "
    "At https://huggingface.co/settings/tokens create a Fine-grained token and enable "
    "\"Make calls to Inference Providers\" (or use a token with that scope). "
    "Set HF_API_KEY, HUGGINGFACEHUB_API_TOKEN, or HF_TOKEN in backend/.env, then restart Flask. "
    "Open GET /health/hf to verify."
)

_MAX_RETRIES = 3
_MAX_ATTEMPTS = _MAX_RETRIES + 1

_RETRYABLE_STATUS = frozenset({429, 502, 503, 504})


def _prepare_image_for_hf(image_bytes: bytes) -> bytes:
    if not image_bytes:
        return image_bytes
    try:
        im = Image.open(io.BytesIO(image_bytes))
        im = im.convert("RGB")
        im.thumbnail((_MAX_EDGE, _MAX_EDGE), Image.Resampling.LANCZOS)
        buf = io.BytesIO()
        im.save(buf, format="JPEG", quality=_JPEG_QUALITY, optimize=True)
        return buf.getvalue()
    except Exception:
        logger.warning("HF image prep skipped (PIL failed), using raw bytes", exc_info=False)
        return image_bytes


def _hf_session() -> requests.Session:
    s = requests.Session()
    s.mount("https://", HTTPAdapter(max_retries=Retry(total=0), pool_connections=1, pool_maxsize=1))
    return s


def _backoff_seconds(attempt: int) -> float:
    return min(90.0, (2.0**attempt) * 1.5)


def classify_image(image_bytes: bytes) -> tuple[str, float]:
    if not Config.hf_ready():
        raise PredictionPipelineError(
            "Hugging Face API is not configured (HF_API_KEY)",
            503,
            error_code=_ERROR_CODE,
        )

    prepared = _prepare_image_for_hf(image_bytes)
    model_id = Config.hf_model_id()
    url = Config.hf_classification_post_url()
    last_err = ""

    logger.info(
        "HF inference start url=%s model=%s bytes_in=%s bytes_out=%s",
        url,
        model_id,
        len(image_bytes),
        len(prepared),
    )

    for attempt in range(_MAX_ATTEMPTS):
        session = _hf_session()
        try:
            headers = {
                "Authorization": f"Bearer {Config.hf_api_key()}",
                "Accept": "application/json",
                "Connection": "close",
            }
            resp = session.post(
                url,
                headers=headers,
                data=prepared,
                timeout=(90, 300),
                stream=False,
            )
            status = resp.status_code

            # Single full read — do not use resp.text before this (avoids double-decode + IncompleteRead races).
            try:
                raw = resp.content
            except (requests.RequestException, IncompleteRead, ProtocolError, OSError) as read_exc:
                last_err = f"body read: {read_exc}"
                logger.warning(
                    "HF IncompleteRead/body read attempt=%s/%s status=%s err=%s",
                    attempt + 1,
                    _MAX_ATTEMPTS,
                    status,
                    read_exc,
                )
                if attempt < _MAX_ATTEMPTS - 1:
                    time.sleep(_backoff_seconds(attempt))
                continue

            preview = raw.decode("utf-8", errors="replace")[:2000] if raw else ""
            logger.info(
                "HF response attempt=%s status=%s body_bytes=%s body_prefix=%s",
                attempt + 1,
                status,
                len(raw),
                preview[:400],
            )

            if status == 403:
                logger.error("HF 403 inference/forbidden body=%s", preview)
                raise PredictionPipelineError(_HF_AUTH_MESSAGE, 503, error_code=_HF_AUTH_CODE)

            if status == 410 or ("no longer supported" in preview.lower() and "inference" in preview.lower()):
                logger.error("HF 410 deprecated inference endpoint body=%s", preview)
                raise PredictionPipelineError(
                    "Hugging Face inference URL is outdated. Update the app or set HF_INFERENCE_MODELS_BASE "
                    "to https://router.huggingface.co/hf-inference/models in backend/.env.",
                    503,
                    error_code=_HF_AUTH_CODE,
                )

            if status in _RETRYABLE_STATUS:
                logger.warning(
                    "HF retryable status=%s attempt=%s/%s body=%s",
                    status,
                    attempt + 1,
                    _MAX_ATTEMPTS,
                    preview,
                )
                last_err = f"HTTP {status}: {preview[:500]}"
                if attempt < _MAX_ATTEMPTS - 1:
                    time.sleep(_backoff_seconds(attempt))
                continue

            if status == 401:
                logger.error("HF auth failed status=401 body=%s", preview)
                raise PredictionPipelineError(
                    "Hugging Face API key rejected.",
                    502,
                    error_code=_HF_AUTH_CODE,
                )

            if status != 200:
                logger.error("HF failure status=%s body=%s", status, preview)
                raise PredictionPipelineError(_UX_MESSAGE, 503, error_code=_ERROR_CODE)

            if not raw:
                logger.warning("HF empty body attempt=%s", attempt + 1)
                last_err = "empty response body"
                if attempt < _MAX_ATTEMPTS - 1:
                    time.sleep(_backoff_seconds(attempt))
                continue

            try:
                data = json.loads(raw.decode("utf-8"))
            except (json.JSONDecodeError, UnicodeDecodeError) as exc:
                logger.warning(
                    "HF JSON parse failed attempt=%s err=%s body_prefix=%s",
                    attempt + 1,
                    exc,
                    preview[:800],
                )
                last_err = f"parse error: {exc}"
                if attempt < _MAX_ATTEMPTS - 1:
                    time.sleep(_backoff_seconds(attempt))
                continue

            label, score = _parse_hf_payload(data)
            if score < 0.0:
                logger.error("HF unparseable scores data=%s", str(data)[:500])
                raise PredictionPipelineError(_UX_MESSAGE, 503, error_code=_ERROR_CODE)
            return label, score

        except PredictionPipelineError:
            raise
        except (requests.Timeout, requests.ConnectionError) as exc:
            last_err = f"network: {exc}"
            logger.warning("HF network error attempt=%s/%s %s", attempt + 1, _MAX_ATTEMPTS, exc)
            if attempt < _MAX_ATTEMPTS - 1:
                time.sleep(_backoff_seconds(attempt))
            continue
        except (requests.RequestException, IncompleteRead, ProtocolError, OSError) as exc:
            last_err = f"transport: {exc}"
            logger.warning("HF transport error attempt=%s/%s %s", attempt + 1, _MAX_ATTEMPTS, exc)
            if attempt < _MAX_ATTEMPTS - 1:
                time.sleep(_backoff_seconds(attempt))
            continue
        finally:
            session.close()

    logger.error("HF exhausted retries (%s attempts) last_err=%s", _MAX_ATTEMPTS, last_err)
    raise PredictionPipelineError(_UX_MESSAGE, 503, error_code=_ERROR_CODE)


def _parse_hf_payload(data) -> tuple[str, float]:
    if isinstance(data, dict) and "error" in data:
        logger.error("HF payload error field=%s", data.get("error"))
        raise PredictionPipelineError(_UX_MESSAGE, 503, error_code=_ERROR_CODE)
    if isinstance(data, list) and len(data) > 0 and isinstance(data[0], dict):
        item = max(data, key=lambda x: float(x.get("score", 0)))
        label = str(item.get("label", "Unknown"))
        score = float(item.get("score", 0))
        return label, score
    if isinstance(data, dict) and "label" in data:
        return str(data["label"]), float(data.get("score", 0))
    logger.error("HF unexpected shape=%s", str(data)[:500])
    raise PredictionPipelineError(_UX_MESSAGE, 503, error_code=_ERROR_CODE)


def humanize_label(label: str) -> str:
    return label.replace("___", " — ").replace("_", " ").strip()
