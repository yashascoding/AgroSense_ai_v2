from __future__ import annotations

import json
from datetime import datetime
from typing import Any

import pymysql

from config.settings import Config


def _connect():
    return pymysql.connect(
        host=Config.mysql_host(),
        port=Config.mysql_port(),
        user=Config.mysql_user(),
        password=Config.mysql_password(),
        database=Config.mysql_database(),
        cursorclass=pymysql.cursors.DictCursor,
        autocommit=True,
    )


def ensure_disease_predictions_table(cursor) -> None:
    cursor.execute(
        """
        CREATE TABLE IF NOT EXISTS predictions (
            id BIGINT PRIMARY KEY AUTO_INCREMENT,
            plant_id VARCHAR(64) NOT NULL,
            image_url TEXT NOT NULL,
            disease_name VARCHAR(255) NOT NULL,
            confidence DECIMAL(8, 6) NOT NULL,
            severity VARCHAR(64),
            insights JSON,
            trend VARCHAR(32),
            comparison_analysis TEXT,
            created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            INDEX idx_plant_created (plant_id, created_at)
        )
        """
    )


def fetch_last_prediction(plant_id: str) -> dict | None:
    with _connect() as conn:
        with conn.cursor() as cur:
            ensure_disease_predictions_table(cur)
            cur.execute(
                """
                SELECT id, plant_id, image_url, disease_name, confidence, severity,
                       insights, trend, comparison_analysis, created_at
                FROM predictions
                WHERE plant_id = %s
                ORDER BY created_at DESC
                LIMIT 1
                """,
                (plant_id,),
            )
            row = cur.fetchone()
    if not row:
        return None
    out = dict(row)
    if isinstance(out.get("insights"), str):
        try:
            out["insights"] = json.loads(out["insights"])
        except json.JSONDecodeError:
            out["insights"] = {}
    return out


def insert_prediction(
    plant_id: str,
    image_url: str,
    disease_name: str,
    confidence: float,
    severity: str,
    insights: dict[str, Any],
    trend: str,
    comparison_analysis: str,
) -> int:
    with _connect() as conn:
        with conn.cursor() as cur:
            ensure_disease_predictions_table(cur)
            cur.execute(
                """
                INSERT INTO predictions
                (plant_id, image_url, disease_name, confidence, severity, insights, trend, comparison_analysis, created_at)
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)
                """,
                (
                    plant_id,
                    image_url,
                    disease_name,
                    float(confidence),
                    severity,
                    json.dumps(insights, ensure_ascii=False),
                    trend,
                    comparison_analysis,
                    datetime.utcnow(),
                ),
            )
            return int(cur.lastrowid)


def list_predictions_for_plant(plant_id: str, limit: int = 100) -> list[dict]:
    with _connect() as conn:
        with conn.cursor() as cur:
            ensure_disease_predictions_table(cur)
            cur.execute(
                """
                SELECT id, plant_id, image_url, disease_name, confidence, severity,
                       insights, trend, comparison_analysis, created_at
                FROM predictions
                WHERE plant_id = %s
                ORDER BY created_at DESC
                LIMIT %s
                """,
                (plant_id, limit),
            )
            rows = cur.fetchall()
    result = []
    for row in rows:
        r = dict(row)
        if isinstance(r.get("insights"), str):
            try:
                r["insights"] = json.loads(r["insights"])
            except json.JSONDecodeError:
                r["insights"] = {}
        r["confidence"] = float(r["confidence"])
        r["date"] = r["created_at"].isoformat() if hasattr(r["created_at"], "isoformat") else str(r["created_at"])
        result.append(r)
    return result
