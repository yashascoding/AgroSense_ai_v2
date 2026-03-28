import { motion } from "framer-motion";
import { CheckCircle2, AlertCircle, Pill, TrendingUp } from "lucide-react";
import { PredictionResult } from "@/hooks/use-api";

interface Props {
  result: PredictionResult;
  imageUrl?: string | null;
}

export default function ResultCard({ result, imageUrl }: Props) {
  const isHealthy = result.disease.toLowerCase().includes("healthy");
  const confidencePercent = Math.round(result.confidence * 100);

  return (
    <div className="glass-card-elevated rounded-2xl overflow-hidden">
      {imageUrl && (
        <div className="h-48 overflow-hidden">
          <img src={imageUrl} alt="Analyzed crop" className="w-full h-full object-cover" />
        </div>
      )}

      <div className="p-6 space-y-5">
        {/* Status */}
        <div className="flex items-center gap-3">
          <motion.div
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ type: "spring", stiffness: 300, delay: 0.2 }}
            className={`w-12 h-12 rounded-xl flex items-center justify-center ${
              isHealthy ? "bg-healthy/15" : "bg-diseased/15"
            }`}
          >
            {isHealthy ? (
              <CheckCircle2 className="w-6 h-6 status-healthy" />
            ) : (
              <AlertCircle className="w-6 h-6 status-diseased" />
            )}
          </motion.div>
          <div>
            <p className="text-sm text-muted-foreground">Diagnosis</p>
            <p className={`font-display font-bold text-xl ${isHealthy ? "status-healthy" : "status-diseased"}`}>
              {result.disease}
            </p>
          </div>
        </div>

        {/* Confidence */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm text-muted-foreground flex items-center gap-1.5">
              <TrendingUp className="w-4 h-4" /> Confidence
            </span>
            <span className="font-semibold">{confidencePercent}%</span>
          </div>
          <div className="h-2.5 rounded-full bg-secondary overflow-hidden">
            <motion.div
              className={`h-full rounded-full ${isHealthy ? "bg-healthy" : "bg-diseased"}`}
              initial={{ width: 0 }}
              animate={{ width: `${confidencePercent}%` }}
              transition={{ duration: 0.8, ease: "easeOut", delay: 0.3 }}
            />
          </div>
        </div>

        {(result.severity || result.trend) && (
          <div className="flex flex-wrap gap-2 text-xs">
            {result.severity && (
              <span className="px-2 py-1 rounded-lg bg-secondary text-foreground font-medium">
                Severity: {result.severity}
              </span>
            )}
            {result.trend && (
              <span className="px-2 py-1 rounded-lg bg-secondary text-foreground font-medium">
                Trend: {result.trend}
              </span>
            )}
          </div>
        )}

        {/* Treatment */}
        {result.treatment && (
          <div className="glass-card rounded-xl p-4">
            <p className="text-sm font-semibold flex items-center gap-1.5 mb-1">
              <Pill className="w-4 h-4 text-primary" /> Suggested Treatment
            </p>
            <p className="text-sm text-muted-foreground leading-relaxed">{result.treatment}</p>
          </div>
        )}

        {result.comparison_analysis && (
          <div className="glass-card rounded-xl p-4">
            <p className="text-sm font-semibold mb-1">Compared to last scan</p>
            <p className="text-sm text-muted-foreground leading-relaxed">{result.comparison_analysis}</p>
          </div>
        )}

        {result.insights?.prevention && (
          <div className="text-sm text-muted-foreground">
            <span className="font-semibold text-foreground">Prevention: </span>
            {result.insights.prevention}
          </div>
        )}
      </div>
    </div>
  );
}
