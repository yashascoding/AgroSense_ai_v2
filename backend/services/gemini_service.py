from __future__ import annotations

import json
import logging
import re
import traceback
from io import BytesIO
from typing import Any

import google.generativeai as genai
import requests
from PIL import Image

from config.settings import Config
from utils.errors import PredictionPipelineError

try:
    from google.api_core import exceptions as google_api_exceptions
except ImportError:  # pragma: no cover
    google_api_exceptions = None

logger = logging.getLogger(__name__)

_GEMINI_AUTH_CODE = "GEMINI_AUTH"
_GEMINI_MODEL_CODE = "GEMINI_MODEL"


def _exception_details(exc: BaseException) -> str:
    """Concise server-side reason for JSON `details` (not shown to users unless frontend opts in)."""
    parts = [f"{type(exc).__name__}: {exc}"]
    if exc.__cause__:
        parts.append(f"caused_by: {type(exc.__cause__).__name__}: {exc.__cause__}")
    return " | ".join(parts)[:2000]


def _ensure_genai_configured() -> None:
    if not Config.gemini_ready():
        raise PredictionPipelineError(
            "Gemini is not configured (GEMINI_API_KEY)",
            503,
            details="No GEMINI_API_KEY or GOOGLE_API_KEY in backend/.env after load_dotenv.",
        )
    kwargs: dict[str, Any] = {"api_key": Config.gemini_api_key()}
    client_opts = Config.gemini_client_options()
    if client_opts is not None:
        kwargs["client_options"] = client_opts
    genai.configure(**kwargs)


def _is_model_not_found(exc: BaseException) -> bool:
    msg = str(exc).lower()
    if "404" in msg and ("not found" in msg or "is not found" in msg):
        return True
    if "not found for api version" in msg:
        return True
    if "is not found" in msg and "model" in msg:
        return True
    if google_api_exceptions and isinstance(exc, google_api_exceptions.NotFound):
        return True
    return False


def _is_auth_error(exc: BaseException) -> bool:
    msg = str(exc).lower()
    if "api key not valid" in msg or "invalid api key" in msg:
        return True
    if google_api_exceptions:
        if isinstance(exc, (google_api_exceptions.Unauthenticated, google_api_exceptions.PermissionDenied)):
            return True
    if "403" in msg and ("permission" in msg or "forbidden" in msg):
        return True
    if "401" in msg:
        return True
    return False


def _log_available_gemini_models() -> None:
    """After a model 404, log models that advertise generateContent (helps fix GEMINI_MODEL)."""
    try:
        names: list[str] = []
        for m in genai.list_models():
            methods = getattr(m, "supported_generation_methods", None) or []
            if "generateContent" in methods:
                n = getattr(m, "name", "") or ""
                if n.startswith("models/"):
                    n = n[7:]
                names.append(n)
        if names:
            logger.warning(
                "Gemini list_models: generateContent-capable models (sample): %s",
                ", ".join(names[:50]),
            )
        else:
            logger.warning("Gemini list_models: no generateContent models returned (check API key / project).")
    except Exception as list_exc:
        logger.warning("Gemini list_models failed (API key, network, or quota): %s", list_exc)


def _generate_content_with_model_fallback(contents: Any) -> tuple[Any, str]:
    """
    Run generateContent using GEMINI_MODEL (+ optional GEMINI_MODEL_FALLBACKS) from backend/.env only.
    Returns (response, model_id_that_succeeded).
    """
    _ensure_genai_configured()
    chain = Config.gemini_model_candidates()
    last_exc: BaseException | None = None
    errors_tried: list[str] = []

    for idx, model_name in enumerate(chain):
        try:
            model = genai.GenerativeModel(model_name)
            response = model.generate_content(contents)
            if idx > 0:
                logger.warning("Gemini generateContent succeeded with fallback model %r", model_name)
            return response, model_name
        except Exception as exc:
            last_exc = exc
            errors_tried.append(f"{model_name}: {type(exc).__name__}: {str(exc)[:180]}")
            if _is_auth_error(exc):
                logger.error("Gemini authentication/permission error for model %r: %s", model_name, exc)
                raise PredictionPipelineError(
                    "Gemini API key is invalid or lacks access. Verify GEMINI_API_KEY at "
                    "https://aistudio.google.com/apikey and restart the backend.",
                    502,
                    error_code=_GEMINI_AUTH_CODE,
                    details=_exception_details(exc),
                ) from exc
            if _is_model_not_found(exc):
                logger.warning(
                    "Gemini model %r unavailable (%s); trying next in chain",
                    model_name,
                    str(exc)[:200],
                )
                if idx == 0:
                    _log_available_gemini_models()
                continue
            logger.exception("Gemini generate_content failed for model %r", model_name)
            raise PredictionPipelineError(
                f"Gemini request failed: {exc}",
                503,
                error_code=_GEMINI_MODEL_CODE,
                details=_exception_details(exc) + "\n" + traceback.format_exc()[:800],
            ) from exc

    chain_str = ", ".join(chain)
    tried_str = "\n".join(errors_tried[:12])
    detail = _exception_details(last_exc) if last_exc else "unknown error"
    raise PredictionPipelineError(
        "No Gemini model in GEMINI_MODEL / GEMINI_MODEL_FALLBACKS succeeded. Use Gemini 2.5 ids from "
        "GET /health/gemini (models_preview). See details for the exact API error per model.",
        502,
        error_code=_GEMINI_MODEL_CODE,
        details=f"Tried env chain only: [{chain_str}]\nLast error: {detail}\nPer-model:\n{tried_str}",
    ) from last_exc


def _safe_response_text(out: Any) -> str:
    try:
        return (out.text or "").strip()
    except Exception as exc:
        raise PredictionPipelineError(
            "Gemini returned no usable text (safety filters, empty candidates, or SDK response shape).",
            502,
            error_code=_GEMINI_MODEL_CODE,
            details=_exception_details(exc),
        ) from exc


def gemini_health_probe() -> dict[str, Any]:
    """
    Structured diagnostics: key presence, list_models (key + reachability), generateContent probe.
    """
    chain = Config.gemini_model_candidates()
    result: dict[str, Any] = {
        "ok": False,
        "reachable": False,
        "dotenv": Config.backend_dotenv_status(),
        "gemini_model_primary_resolved": Config.gemini_model_id(),
        "api_key_configured": False,
        "api_key_valid": None,
        "list_models_ok": None,
        "generate_content_ok": None,
        "model_chain": chain,
        "model_used_for_generate": None,
        "models_preview": [],
        "generate_sample": None,
        "hint": None,
    }

    if not Config.gemini_ready():
        result["hint"] = "Set GEMINI_API_KEY or GOOGLE_API_KEY in backend/.env"
        return result

    result["api_key_configured"] = True

    try:
        _ensure_genai_configured()
    except PredictionPipelineError as exc:
        result["api_key_valid"] = False
        result["details"] = exc.details or str(exc)
        result["hint"] = exc.message
        return result

    models_preview: list[str] = []
    try:
        for m in genai.list_models():
            methods = getattr(m, "supported_generation_methods", None) or []
            if "generateContent" in methods:
                n = getattr(m, "name", "") or ""
                if n.startswith("models/"):
                    n = n[7:]
                models_preview.append(n)
        result["list_models_ok"] = True
        result["api_key_valid"] = True
        result["reachable"] = True
    except Exception as exc:
        result["list_models_ok"] = False
        result["api_key_valid"] = False
        result["reachable"] = False
        result["list_models_error"] = str(exc)[:800]
        result["details"] = _exception_details(exc)
        result["hint"] = (
            "list_models failed — usually invalid API key, blocked network, or Generative Language API "
            "disabled for this key. See https://aistudio.google.com/apikey"
        )
        return result

    result["models_preview"] = models_preview[:40]

    try:
        gen_out, model_used = _generate_content_with_model_fallback("Reply with the single word OK.")
        result["generate_content_ok"] = True
        result["model_used_for_generate"] = model_used
        result["generate_sample"] = _safe_response_text(gen_out)[:120]
        result["ok"] = True
    except PredictionPipelineError as exc:
        result["generate_content_ok"] = False
        result["generate_error"] = exc.message
        result["error_code"] = exc.error_code
        result["details"] = exc.details or str(exc)
        result["hint"] = (
            "generateContent failed — check model_chain vs models_preview, or see details for the real error."
        )
    except Exception as exc:
        result["generate_content_ok"] = False
        result["details"] = _exception_details(exc)
        result["generate_error"] = str(exc)

    result["ok"] = bool(result.get("generate_content_ok"))
    return result


def _parse_json_response(text: str) -> dict:
    text = (text or "").strip()
    if text.startswith("```"):
        text = re.sub(r"^```(?:json)?\s*", "", text, flags=re.IGNORECASE)
        text = re.sub(r"\s*```$", "", text)
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        m = re.search(r"\{[\s\S]*\}", text)
        if m:
            return json.loads(m.group())
        raise PredictionPipelineError("Gemini returned non-JSON output", 502, details=text[:1200]) from None


_CLASSIFY_PROMPT = """You are a plant pathologist. Look at this crop or plant leaf image.

Respond with ONLY valid JSON (no markdown code fences) using exactly these keys:
{
  "disease_label": "short English name of the most likely disease, or Healthy_leaf if the plant looks healthy",
  "confidence": number between 0.05 and 0.99 for how sure you are
}

Rules:
- If the image is not a plant leaf or is too unclear, still pick your best guess but use confidence below 0.45.
- Use single-word underscores for spaces in the label if you like (e.g. Tomato_Leaf_Mold).
"""


def _pil_rgb_upload(image_bytes: bytes) -> Image.Image:
    im = Image.open(BytesIO(image_bytes)).convert("RGB")
    im.thumbnail((1024, 1024))
    return im


def gemini_classify_from_image_bytes(image_bytes: bytes) -> tuple[str, float]:
    """Vision-only label from raw upload bytes (no Cloudinary fetch)."""
    try:
        img = _pil_rgb_upload(image_bytes)
    except Exception as exc:
        raise PredictionPipelineError(
            f"Could not decode image for classification: {exc}",
            502,
            details=_exception_details(exc),
        ) from exc
    try:
        out, _m = _generate_content_with_model_fallback([img, _CLASSIFY_PROMPT])
        data = _parse_json_response(_safe_response_text(out))
    except PredictionPipelineError:
        raise
    except Exception as exc:
        raise PredictionPipelineError(
            f"Gemini classification fallback failed: {exc}",
            503,
            details=_exception_details(exc),
        ) from exc

    label = str(data.get("disease_label", "Unknown")).strip() or "Unknown"
    try:
        score = float(data.get("confidence", 0.55))
    except (TypeError, ValueError):
        score = 0.55
    score = max(0.05, min(0.99, score))
    return label, score


def gemini_classify_from_image_url(image_url: str) -> tuple[str, float]:
    """Same as bytes-based classify but loads from URL (e.g. tests)."""
    try:
        resp_img = requests.get(image_url, timeout=25, headers={"User-Agent": "AgroSenseAI/1.0"})
        resp_img.raise_for_status()
        return gemini_classify_from_image_bytes(resp_img.content)
    except PredictionPipelineError:
        raise
    except Exception as exc:
        raise PredictionPipelineError(
            f"Could not load image for classification: {exc}",
            502,
            details=_exception_details(exc),
        ) from exc


def generate_insights_and_validate(
    image_url: str,
    disease_name: str,
    confidence: float,
    *,
    image_bytes: bytes | None = None,
) -> dict:
    """
    Returns dict with: is_crop_leaf_image, severity, causes, treatment, prevention,
    fertilizers, recovery_time (and optional notes).
    When ``image_bytes`` is set, the same upload bytes are used (avoids server-side URL fetch failures).
    """
    try:
        if image_bytes:
            img = _pil_rgb_upload(image_bytes)
        else:
            resp_img = requests.get(
                image_url,
                timeout=20,
                headers={"User-Agent": "AgroSenseAI/1.0"},
            )
            resp_img.raise_for_status()
            img = Image.open(BytesIO(resp_img.content)).convert("RGB")
    except PredictionPipelineError:
        raise
    except Exception as exc:
        raise PredictionPipelineError(
            f"Could not load image for AI analysis: {exc}",
            502,
            details=_exception_details(exc),
        ) from exc

    prompt = f"""You are an agricultural plant-pathology assistant.

The Hugging Face model predicted this label: "{disease_name}" with confidence {confidence:.4f}.

Look at the image. Respond with ONLY valid JSON (no markdown code fences) using exactly these keys:
{{
  "is_crop_leaf_image": true or false,
  "severity": "one of: Low, Mild, Moderate, High, Severe",
  "causes": "short string",
  "treatment": "short actionable string",
  "prevention": "short string",
  "fertilizers": "short string (products or nutrients)",
  "recovery_time": "short string (e.g. 1-2 weeks)",
  "validation_note": "if not a leaf, explain briefly; else empty string"
}}

Rules:
- If the photo is not a plant leaf, flower, or crop close-up suitable for disease diagnosis (e.g. person, car, random object, soil only, very blurry), set "is_crop_leaf_image" to false and set "validation_note" asking the user to upload a clear photograph of a plant leaf.
- If it is suitable, set "is_crop_leaf_image" to true.
- Base severity and agronomic advice on the predicted label and what you see, but do not invent a different disease name — use the given label as the primary condition name context.
"""
    try:
        out, _m = _generate_content_with_model_fallback([img, prompt])
        text = _safe_response_text(out)
    except PredictionPipelineError:
        raise
    except Exception as exc:
        raise PredictionPipelineError(
            f"Gemini insights failed: {exc}",
            502,
            details=_exception_details(exc),
        ) from exc
    return _parse_json_response(text)


def compare_previous_vs_current(
    previous: dict,
    current_disease: str,
    current_confidence: float,
    current_severity: str,
) -> tuple[str, str]:
    """Returns (trend, comparison_analysis). trend: Improving | Worsening | Same"""
    prompt = f"""Previous record:
- disease: {previous.get("disease_name")}
- confidence: {previous.get("confidence")}
- severity: {previous.get("severity")}
- insights summary: {json.dumps(previous.get("insights") or {}, ensure_ascii=False)[:800]}

Current record:
- disease: {current_disease}
- confidence: {current_confidence}
- severity: {current_severity}

Respond with ONLY valid JSON (no markdown): {{
  "trend": "Improving" or "Worsening" or "Same",
  "comparison_analysis": "2-4 sentences: whether the plant situation improved or worsened, and concrete next steps for the farmer"
}}
"""
    try:
        out, _m = _generate_content_with_model_fallback(prompt)
        data = _parse_json_response(_safe_response_text(out))
    except Exception as exc:
        return "Same", f"Trend analysis unavailable: {exc}"
    trend = str(data.get("trend", "Same")).strip()
    if trend not in ("Improving", "Worsening", "Same"):
        trend = "Same"
    analysis = str(data.get("comparison_analysis", "")).strip()
    return trend, analysis or "No additional analysis."


_MAX_CHAT_CHARS = 4000


def gemini_crop_chat(user_message: str, image_bytes: bytes) -> str:
    """Multimodal chat: user question + uploaded crop/plant image."""
    text = (user_message or "").strip()
    if not text:
        raise PredictionPipelineError("Message is empty.", 400)
    if len(text) > _MAX_CHAT_CHARS:
        raise PredictionPipelineError(f"Message exceeds {_MAX_CHAT_CHARS} characters.", 400)
    if not image_bytes:
        raise PredictionPipelineError("Image is required for crop chat.", 400)
    try:
        img = _pil_rgb_upload(image_bytes)
    except Exception as exc:
        raise PredictionPipelineError(f"Could not read image: {exc}", 400) from exc
    prompt = (
        "You are a helpful agricultural assistant for farmers. The user uploaded a photo of a crop or plant. "
        "Answer their question clearly and practically. If the image is unclear or not a plant, say so briefly.\n\n"
        f"User: {text}"
    )
    out, _m = _generate_content_with_model_fallback([img, prompt])
    return _safe_response_text(out)


def _normalize_prognosis_payload(raw: dict) -> dict:
    risk = str(raw.get("risk_level", "moderate")).strip().lower()
    if risk not in ("low", "moderate", "high"):
        risk = "moderate"
    likely = raw.get("disease_outbreak_likely")
    if not isinstance(likely, bool):
        likely = str(likely).lower() in ("true", "1", "yes")

    def _str_list(key: str, min_n: int = 1) -> list[str]:
        v = raw.get(key)
        if not isinstance(v, list):
            return []
        out = [str(x).strip() for x in v if str(x).strip()]
        if len(out) < min_n:
            return []
        return out

    precautions = _str_list("precautions", 1)
    watch = _str_list("watch_signs", 1)
    if not precautions:
        precautions = ["Keep monitoring canopy color and leaf spots daily.", "Improve airflow if humidity stays high."]
    if not watch:
        watch = ["Yellowing or spreading lesions", "Unexpected wilting despite adequate soil moisture"]

    return {
        "risk_level": risk,
        "disease_outbreak_likely": likely,
        "summary": str(raw.get("summary", "")).strip() or "Assessment complete — review precautions below.",
        "visual_changes": str(raw.get("visual_changes", "")).strip() or "No detailed visual comparison returned.",
        "env_interpretation": str(raw.get("env_interpretation", "")).strip()
        or "Environmental data considered with image comparison.",
        "precautions": precautions[:12],
        "watch_signs": watch[:12],
    }


def gemini_two_image_prognosis(
    current_bytes: bytes,
    previous_bytes: bytes,
    *,
    humidity_pct: float,
    temperature_c: float,
    ndvi: float,
) -> dict:
    """
    Compare recent vs older crop photo and interpret with humidity (%), temperature (°C), NDVI (-1..1).
    Images: first PIL slot in the prompt is CURRENT (more recent), second is PREVIOUS (older).
    """
    if not current_bytes or not previous_bytes:
        raise PredictionPipelineError("Both current and previous images are required.", 400)
    try:
        img_current = _pil_rgb_upload(current_bytes)
        img_previous = _pil_rgb_upload(previous_bytes)
    except Exception as exc:
        raise PredictionPipelineError(f"Could not read one of the images: {exc}", 400) from exc

    prompt = f"""You are an expert crop monitoring advisor. Two images are attached IN THIS ORDER:
1) FIRST IMAGE = MORE RECENT photo of the plant or field (current / today).
2) SECOND IMAGE = OLDER photo from about 1–3 days before the first.

Measured conditions (use as context, not as ground truth satellite validation):
- Relative humidity: {humidity_pct:.1f}% (0–100)
- Air temperature: {temperature_c:.1f} °C
- NDVI (canopy vigor index): {ndvi:.3f} (typical range -1 to 1; higher often means greener/denser canopy)

Compare the images for visible stress: leaf spots, color shift, wilting, canopy thinning, spread of damage.
Relate humidity (sustained high humidity can favor some fungal issues), temperature extremes, and NDVI meaning
(lower NDVI may suggest canopy decline — combined with visuals).

Respond with ONLY valid JSON (no markdown code fences) using exactly these keys:
{{
  "risk_level": "low" OR "moderate" OR "high",
  "disease_outbreak_likely": true or false,
  "summary": "2-4 clear sentences for the farmer",
  "visual_changes": "short text: what changed between the older and newer photo",
  "env_interpretation": "short text: how humidity, temperature, and NDVI relate to the visible risk",
  "precautions": [ "at least two short actionable precautions" ],
  "watch_signs": [ "at least two signs to monitor in the next days" ]
}}
If images are unclear or not plants, say so in summary, set risk_level to moderate, disease_outbreak_likely to false."""

    out, _m = _generate_content_with_model_fallback([img_current, img_previous, prompt])
    data = _parse_json_response(_safe_response_text(out))
    if not isinstance(data, dict):
        raise PredictionPipelineError("Gemini returned invalid prognosis structure.", 502)
    return _normalize_prognosis_payload(data)
