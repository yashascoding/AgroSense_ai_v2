import type { AgriDataResponse } from "@/hooks/use-api";

function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
}

export type InsightFeatureRow = {
  label: string;
  detail: string;
  percent: number;
  barClass: string;
  trend: "up" | "down" | "neutral";
};

function barTone(percent: number): string {
  if (percent >= 70) return "bg-red-500/90";
  if (percent >= 50) return "bg-orange-500/85";
  if (percent >= 30) return "bg-amber-500/80";
  return "bg-emerald-500/85";
}

/** Heuristic explainability from the last 7 days of /data (not a trained ML explainer). */
export function buildInsightsExplain(data: AgriDataResponse): {
  summary: string;
  features: InsightFeatureRow[];
} {
  const hist = data.history ?? [];
  const cur = data.current;
  const first = hist[0];
  const last = hist.length > 0 ? hist[hist.length - 1] : cur;

  const ndviDenom = Math.max(0.02, first?.ndvi ?? last.ndvi ?? 0.02);
  const ndviPct = (((last.ndvi ?? cur.ndvi) - (first?.ndvi ?? last.ndvi)) / ndviDenom) * 100;
  const ndviDrop = (first?.ndvi ?? last.ndvi) - (last.ndvi ?? cur.ndvi);

  const humChange = (last.humidity ?? cur.humidity) - (first?.humidity ?? last.humidity);
  const humLevel = last.humidity ?? cur.humidity;

  const soilThreshold = 52;
  const highSoilDays = hist.filter((h) => h.soil_moisture >= soilThreshold).length;
  const recentSoil =
    hist.length >= 1
      ? hist
          .slice(-3)
          .reduce((s, h) => s + h.soil_moisture, 0) / Math.min(3, hist.length)
      : cur.soil_moisture;

  const temps = hist.map((h) => h.temperature);
  const tMin = temps.length ? Math.min(...temps) : cur.temperature;
  const tMax = temps.length ? Math.max(...temps) : cur.temperature;
  const tRange = tMax - tMin;

  const riskChange = (last.risk ?? cur.risk) - (first?.risk ?? last.risk);
  const riskNow = cur.risk;

  const ndviStress = clamp(ndviDrop * 120, 0, 100);
  const humStress = clamp(
    Math.max(0, (humLevel - 48) / 42) * 70 + Math.max(0, humChange) * 0.35,
    0,
    100,
  );
  const soilStress = clamp((recentSoil / 100) * 55 + (highSoilDays / 7) * 45, 0, 100);
  const tempVariability = clamp((tRange / 4.5) * 100, 6, 88);
  const riskMomentum = clamp(Math.abs(riskChange) * 1.2 + riskNow * 0.35, 0, 100);

  const riskWords =
    riskNow >= 70 ? "high" : riskNow >= 45 ? "elevated" : riskNow >= 25 ? "moderate" : "relatively low";

  const ndviClause =
    ndviPct < -0.5
      ? `vegetation health (NDVI) has declined about ${Math.abs(ndviPct).toFixed(1)}% over the window`
      : ndviPct > 0.5
        ? `NDVI improved about ${ndviPct.toFixed(1)}% compared to the start of the window`
        : "NDVI is nearly flat compared to the start of the window";

  const humClause =
    Math.abs(humChange) < 0.75
      ? `humidity has been steady near ${humLevel.toFixed(0)}%`
      : humChange > 0
        ? `humidity rose by about ${humChange.toFixed(1)} percentage points`
        : `humidity fell by about ${Math.abs(humChange).toFixed(1)} percentage points`;

  const soilClause =
    highSoilDays >= 4
      ? `soil moisture stayed elevated on ${highSoilDays} of the last ${hist.length || 7} days`
      : `recent soil moisture averages about ${recentSoil.toFixed(0)}%`;

  const tempClause =
    tRange <= 1.2
      ? `temperature stayed in a narrow band (${tRange.toFixed(1)}°C range across the series)`
      : `temperature swung over about ${tRange.toFixed(1)}°C across the series`;

  const couple =
    humLevel >= 65 && recentSoil >= 55
      ? "High humidity together with moist soil often reinforces disease pressure in this simple risk model."
      : riskNow >= 55
        ? "Several environmental factors in this window align with the current risk formula."
        : "No single factor dominates; the risk index blends temperature, humidity, soil moisture, and estimated NDVI.";

  const summary = `Based on the last ${hist.length || 7} days at ${data.location.place}, the risk index is ${riskNow.toFixed(0)}% (${riskWords} in this dashboard). ${ndviClause.charAt(0).toUpperCase() + ndviClause.slice(1)}; ${humClause}; and ${soilClause}. ${tempClause}. ${couple} The bars below estimate how much each signal mattered for the current reading—derived from trends, not from a separate ML feature-attribution model.`;

  const features: InsightFeatureRow[] = [
    {
      label: "NDVI change",
      detail: `${ndviPct >= 0 ? "+" : ""}${ndviPct.toFixed(1)}% vs start of window`,
      percent: Math.round(ndviStress),
      barClass: barTone(ndviStress),
      trend: ndviPct < -0.3 ? "down" : ndviPct > 0.3 ? "up" : "neutral",
    },
    {
      label: "Humidity",
      detail: `${humChange >= 0 ? "+" : ""}${humChange.toFixed(1)} pts`,
      percent: Math.round(humStress),
      barClass: barTone(humStress),
      trend: humChange > 0.5 ? "up" : humChange < -0.5 ? "down" : "neutral",
    },
    {
      label: "Soil moisture",
      detail: `${highSoilDays} day${highSoilDays === 1 ? "" : "s"} ≥ ${soilThreshold}%`,
      percent: Math.round(soilStress),
      barClass: barTone(soilStress),
      trend: recentSoil >= soilThreshold + 5 ? "up" : recentSoil < soilThreshold - 5 ? "neutral" : "neutral",
    },
    {
      label: "Risk trend",
      detail: `${riskChange >= 0 ? "+" : ""}${riskChange.toFixed(0)} pts vs start`,
      percent: Math.round(riskMomentum),
      barClass: barTone(riskMomentum),
      trend: riskChange > 1 ? "up" : riskChange < -1 ? "down" : "neutral",
    },
    {
      label: "Temperature variability",
      detail: `${tRange.toFixed(1)}°C range`,
      percent: Math.round(tempVariability),
      barClass: barTone(tempVariability),
      trend: tRange > 2.5 ? "up" : "neutral",
    },
  ];

  return { summary, features };
}
