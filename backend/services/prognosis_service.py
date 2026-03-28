"""Two-image + environmental observation-based risk prognosis (Gemini only — no MySQL)."""
from __future__ import annotations

from services.gemini_service import gemini_two_image_prognosis
from utils.errors import PredictionPipelineError


def parse_observation_floats(humidity_raw: str, temperature_raw: str, ndvi_raw: str) -> tuple[float, float, float]:
    """Parse and validate humidity %, °C, NDVI. Raises PredictionPipelineError on bad input."""
    errs: list[str] = []
    try:
        humidity = float(humidity_raw)
    except (TypeError, ValueError):
        humidity = float("nan")
        errs.append("humidity must be a number")
    try:
        temperature = float(temperature_raw)
    except (TypeError, ValueError):
        temperature = float("nan")
        errs.append("temperature must be a number")
    try:
        ndvi = float(ndvi_raw)
    except (TypeError, ValueError):
        ndvi = float("nan")
        errs.append("ndvi must be a number")
    if errs:
        raise PredictionPipelineError("; ".join(errs), 400)

    if not 0 <= humidity <= 100:
        raise PredictionPipelineError("humidity must be between 0 and 100 (percent).", 400)
    if not -15 <= temperature <= 55:
        raise PredictionPipelineError("temperature must be between -15 and 55 (°C).", 400)
    if not -1 <= ndvi <= 1:
        raise PredictionPipelineError("NDVI must be between -1 and 1.", 400)

    return humidity, temperature, ndvi


def run_prognosis(
    current_bytes: bytes,
    previous_bytes: bytes,
    *,
    humidity: float,
    temperature: float,
    ndvi: float,
    plant_id: str,
) -> dict:
    core = gemini_two_image_prognosis(
        current_bytes,
        previous_bytes,
        humidity_pct=humidity,
        temperature_c=temperature,
        ndvi=ndvi,
    )
    return {
        **core,
        "inputs": {
            "humidity": humidity,
            "temperature": temperature,
            "ndvi": ndvi,
            "plant_id": plant_id[:64] if plant_id else "default",
        },
    }
