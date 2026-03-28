import { motion } from "framer-motion";
import type { PrognosisResult } from "@/hooks/use-api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  AlertTriangle,
  Droplets,
  Leaf,
  Thermometer,
  Activity,
  Shield,
  Eye,
} from "lucide-react";
import { cn } from "@/lib/utils";

type Props = {
  result: PrognosisResult;
  previewCurrent: string | null;
  previewPrevious: string | null;
};

function riskStyles(level: PrognosisResult["risk_level"]) {
  switch (level) {
    case "low":
      return {
        badge: "bg-emerald-600/15 text-emerald-700 dark:text-emerald-400 border-emerald-500/30",
        bar: "bg-emerald-500",
        label: "Low risk",
      };
    case "high":
      return {
        badge: "bg-destructive/15 text-destructive border-destructive/30",
        bar: "bg-destructive",
        label: "High risk",
      };
    default:
      return {
        badge: "bg-amber-500/15 text-amber-800 dark:text-amber-200 border-amber-500/35",
        bar: "bg-amber-500",
        label: "Moderate risk",
      };
  }
}

export function PrognosisDashboard({ result, previewCurrent, previewPrevious }: Props) {
  const styles = riskStyles(result.risk_level);
  const pct =
    result.risk_level === "low" ? 33 : result.risk_level === "high" ? 100 : 66;
  const { inputs } = result;

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-3">
        <Card className="glass-card border-border/60 transition-all duration-300 hover:border-primary/40 hover:bg-primary/[0.04] hover:shadow-md">
          <CardHeader className="pb-2 flex flex-row items-center justify-between">
            <CardTitle className="text-sm font-medium text-muted-foreground">Humidity</CardTitle>
            <Droplets className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-display font-bold">{inputs.humidity.toFixed(1)}%</p>
          </CardContent>
        </Card>
        <Card className="glass-card border-border/60 transition-all duration-300 hover:border-primary/40 hover:bg-primary/[0.04] hover:shadow-md">
          <CardHeader className="pb-2 flex flex-row items-center justify-between">
            <CardTitle className="text-sm font-medium text-muted-foreground">Temperature</CardTitle>
            <Thermometer className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-display font-bold">{inputs.temperature.toFixed(1)} °C</p>
          </CardContent>
        </Card>
        <Card className="glass-card border-border/60 transition-all duration-300 hover:border-primary/40 hover:bg-primary/[0.04] hover:shadow-md">
          <CardHeader className="pb-2 flex flex-row items-center justify-between">
            <CardTitle className="text-sm font-medium text-muted-foreground">NDVI</CardTitle>
            <Activity className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-display font-bold">{inputs.ndvi.toFixed(3)}</p>
          </CardContent>
        </Card>
      </div>

      <Card className="glass-card-elevated border-border/60 overflow-hidden">
        <CardHeader className="pb-3">
          <div className="flex flex-wrap items-center gap-3">
            <CardTitle className="text-xl font-display">Outbreak outlook</CardTitle>
            <Badge variant="outline" className={cn("font-semibold", styles.badge)}>
              {styles.label}
            </Badge>
            {result.disease_outbreak_likely && (
              <Badge variant="outline" className="border-destructive/40 text-destructive gap-1">
                <AlertTriangle className="h-3 w-3" />
                Disease more likely
              </Badge>
            )}
          </div>
          <div className="mt-3 h-2.5 rounded-full bg-muted overflow-hidden origin-bottom">
            <motion.div
              className={cn("h-full rounded-full", styles.bar)}
              initial={{ width: 0 }}
              animate={{ width: `${pct}%` }}
              transition={{ duration: 1.05, ease: [0.22, 1, 0.36, 1] }}
            />
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {previewCurrent && previewPrevious && (
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-xl overflow-hidden border border-border/60 bg-muted/20">
                <p className="text-xs text-center py-1.5 bg-muted/40 font-medium">Current</p>
                <img src={previewCurrent} alt="Current crop" className="w-full h-36 object-cover" />
              </div>
              <div className="rounded-xl overflow-hidden border border-border/60 bg-muted/20">
                <p className="text-xs text-center py-1.5 bg-muted/40 font-medium">Earlier</p>
                <img src={previewPrevious} alt="Earlier crop" className="w-full h-36 object-cover" />
              </div>
            </div>
          )}

          <p className="text-sm leading-relaxed text-foreground">{result.summary}</p>

          <Separator />

          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <h3 className="text-sm font-semibold flex items-center gap-2 mb-2">
                <Leaf className="h-4 w-4" />
                Visual changes
              </h3>
              <p className="text-sm text-muted-foreground whitespace-pre-wrap">{result.visual_changes}</p>
            </div>
            <div>
              <h3 className="text-sm font-semibold flex items-center gap-2 mb-2">
                <Activity className="h-4 w-4" />
                Environment
              </h3>
              <p className="text-sm text-muted-foreground whitespace-pre-wrap">{result.env_interpretation}</p>
            </div>
          </div>

          <Separator />

          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <h3 className="text-sm font-semibold flex items-center gap-2 mb-2">
                <Shield className="h-4 w-4" />
                Precautions
              </h3>
              <ul className="text-sm text-muted-foreground list-disc pl-5 space-y-1">
                {result.precautions.map((p, i) => (
                  <li key={i}>{p}</li>
                ))}
              </ul>
            </div>
            <div>
              <h3 className="text-sm font-semibold flex items-center gap-2 mb-2">
                <Eye className="h-4 w-4" />
                Watch for
              </h3>
              <ul className="text-sm text-muted-foreground list-disc pl-5 space-y-1">
                {result.watch_signs.map((p, i) => (
                  <li key={i}>{p}</li>
                ))}
              </ul>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}