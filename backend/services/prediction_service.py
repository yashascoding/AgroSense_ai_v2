from __future__ import annotations

import logging
from werkzeug.datastructures import FileStorage

from config.settings import Config
from models.disease_predictions import fetch_last_prediction, insert_prediction
from services.cloudinary_service import upload_image_bytes
from services.gemini_service import (
    compare_previous_vs_current,
    gemini_classify_from_image_bytes,
    generate_insights_and_validate,
)
from services.huggingface_service import classify_image, humanize_label
from utils.errors import PredictionPipelineError

logger = logging.getLogger(__name__)


def run_crop_prediction(
    image: FileStorage | None,
    plant_id: str,
    *,
    client_image_url: str | None = None,
) -> dict:
    if not image or image.filename == "":
        raise PredictionPipelineError('Missing image file. Send multipart form-data with field "image".', 400)

    plant_id = (plant_id or "default").strip()[:64] or "default"

    image.stream.seek(0)
    raw = image.read()
    if not raw:
        raise PredictionPipelineError("Empty image file.", 400)

    # Prefer URL from client only if provided; default is signed server upload (no unsigned upload preset).
    image_url = (client_image_url or "").strip()
    if not image_url:
        image_url = upload_image_bytes(raw)

    try:
        hf_label, hf_score = classify_image(raw)
    except PredictionPipelineError as hf_exc:
        if not Config.gemini_ready():
            raise
        logger.warning(
            "Hugging Face classification failed (%s): %s — using Gemini vision fallback on upload bytes",
            hf_exc.error_code,
            (hf_exc.message or "")[:160],
        )
        hf_label, hf_score = gemini_classify_from_image_bytes(raw)
    disease_display = humanize_label(hf_label)

    gemini_block = generate_insights_and_validate(
        image_url,
        disease_display,
        hf_score,
        image_bytes=raw,
    )

    if not gemini_block.get("is_crop_leaf_image", True):
        note = gemini_block.get("validation_note") or "Please upload a clear photograph of a plant leaf."
        raise PredictionPipelineError(note, 400)

    insights = {
        "causes": gemini_block.get("causes", ""),
        "treatment": gemini_block.get("treatment", ""),
        "prevention": gemini_block.get("prevention", ""),
        "fertilizers": gemini_block.get("fertilizers", ""),
        "recovery_time": gemini_block.get("recovery_time", ""),
        "validation_note": gemini_block.get("validation_note", ""),
    }
    severity = str(gemini_block.get("severity", "Moderate"))

    previous = fetch_last_prediction(plant_id)
    trend = "Same"
    comparison_analysis = "First record for this plant — no prior comparison."

    if previous:
        trend, comparison_analysis = compare_previous_vs_current(
            previous,
            disease_display,
            float(hf_score),
            severity,
        )

    insert_prediction(
        plant_id=plant_id,
        image_url=image_url,
        disease_name=disease_display,
        confidence=float(hf_score),
        severity=severity,
        insights=insights,
        trend=trend,
        comparison_analysis=comparison_analysis,
    )

    return {
        "disease": disease_display,
        "confidence": round(float(hf_score), 4),
        "severity": severity,
        "insights": insights,
        "trend": trend,
        "comparison_analysis": comparison_analysis,
        "image_url": image_url,
        "plant_id": plant_id,
    }
