import { useState, useCallback, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Loader2, Upload, Sprout } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { submitPrognosis, type PrognosisResult, fetchWeatherCurrent } from "@/hooks/use-api";
import { useToast } from "@/hooks/use-toast";
import { GeminiChatPanel } from "@/components/GeminiChatPanel";
import { PrognosisDashboard } from "@/components/PrognosisDashboard";
import { cn } from "@/lib/utils";

function readPreview(file: File | null, cb: (url: string | null) => void) {
  if (!file) {
    cb(null);
    return;
  }
  const reader = new FileReader();
  reader.onload = (e) => cb(e.target?.result as string);
  reader.readAsDataURL(file);
}

type PhotoSlotProps = {
  label: string;
  hint: string;
  file: File | null;
  preview: string | null;
  onPick: (f: File | null) => void;
};

function PhotoSlot({ label, hint, file, preview, onPick }: PhotoSlotProps) {
  return (
    <div className="glass-card rounded-xl p-4 space-y-2 border border-transparent transition-all duration-300 hover:border-primary/35 hover:bg-primary/[0.04] hover:shadow-md hover:shadow-primary/10">
      <Label className="text-sm font-medium">{label}</Label>
      <p className="text-xs text-muted-foreground">{hint}</p>
      {preview ? (
        <button
          type="button"
          className="w-full text-left rounded-xl overflow-hidden border border-border/60 focus:outline-none focus:ring-2 focus:ring-primary/40"
          onClick={() => onPick(null)}
        >
          <img src={preview} alt="" className="w-full max-h-44 object-contain bg-muted/30" />
          <p className="text-xs text-center py-2 text-muted-foreground">
            {file?.name} — click to change
          </p>
        </button>
      ) : (
        <label className="flex flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-border/80 py-10 px-4 cursor-pointer hover:bg-muted/30 transition-colors">
          <Upload className="h-8 w-8 text-muted-foreground" />
          <span className="text-sm text-muted-foreground">Choose image</span>
          <input
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => onPick(e.target.files?.[0] ?? null)}
          />
        </label>
      )}
    </div>
  );
}

export default function DetectPage() {
  const [fileCurrent, setFileCurrent] = useState<File | null>(null);
  const [filePrevious, setFilePrevious] = useState<File | null>(null);
  const [previewCurrent, setPreviewCurrent] = useState<string | null>(null);
  const [previewPrevious, setPreviewPrevious] = useState<string | null>(null);
  const [plantId, setPlantId] = useState("default");
  const [humidity, setHumidity] = useState("65");
  const [temperature, setTemperature] = useState("26");
  const [ndvi, setNdvi] = useState("0.55");
  const [result, setResult] = useState<PrognosisResult | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    if (!("geolocation" in navigator)) return;
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        try {
          const w = await fetchWeatherCurrent(pos.coords.latitude, pos.coords.longitude);
          setTemperature(String(w.temperature));
          setHumidity(String(w.humidity));
          setNdvi(String(w.ndvi));
        } catch {
          /* keep placeholder defaults if offline or API unavailable */
        }
      },
      () => {},
      { enableHighAccuracy: false, timeout: 15000, maximumAge: 300000 },
    );
  }, []);

  const onCurrent = useCallback((f: File | null) => {
    setFileCurrent(f);
    readPreview(f, setPreviewCurrent);
    setResult(null);
  }, []);

  const onPrevious = useCallback((f: File | null) => {
    setFilePrevious(f);
    readPreview(f, setPreviewPrevious);
    setResult(null);
  }, []);

  const reset = () => {
    setFileCurrent(null);
    setFilePrevious(null);
    setPreviewCurrent(null);
    setPreviewPrevious(null);
    setResult(null);
  };

  const handleRun = async () => {
    if (!fileCurrent || !filePrevious) {
      toast({
        title: "Photos required",
        description: "Add both the current photo and an earlier photo (1–3 days before).",
        variant: "destructive",
      });
      return;
    }
    const h = Number(humidity);
    const t = Number(temperature);
    const n = Number(ndvi);
    if (Number.isNaN(h) || Number.isNaN(t) || Number.isNaN(n)) {
      toast({
        title: "Invalid numbers",
        description: "Enter numeric humidity, temperature, and NDVI.",
        variant: "destructive",
      });
      return;
    }
    setIsLoading(true);
    try {
      const data = await submitPrognosis({
        imageCurrent: fileCurrent,
        imagePrevious: filePrevious,
        humidity: h,
        temperature: t,
        ndvi: n,
        plantId,
      });
      setResult(data);
    } catch (e) {
      toast({
        title: "Prognosis failed",
        description: e instanceof Error ? e.message : "Could not complete analysis. Try again.",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const canSubmit =
    Boolean(fileCurrent && filePrevious) &&
    !Number.isNaN(Number(humidity)) &&
    !Number.isNaN(Number(temperature)) &&
    !Number.isNaN(Number(ndvi));

  return (
    <div className={cn("mx-auto px-6 py-12", result ? "max-w-6xl" : "max-w-4xl")}>
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}>
        <h1 className="text-3xl font-display font-bold mb-2 flex items-center gap-2">
          <Sprout className="h-8 w-8" />
          Crop risk outlook
        </h1>
        <p className="text-muted-foreground mb-8 max-w-2xl">
          Upload a <strong>current</strong> plant photo and an <strong>earlier</strong> one from about 1–3 days
          before. Add humidity, temperature, and NDVI so we can estimate whether disease is becoming more likely and
          what precautions to take.
        </p>
      </motion.div>

      <AnimatePresence mode="wait">
        {!result ? (
          <motion.div key="form" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <div className="space-y-6">
              <div className="glass-card rounded-xl p-4 space-y-2">
                <Label htmlFor="plant_id">Plant / field ID</Label>
                <Input
                  id="plant_id"
                  value={plantId}
                  onChange={(e) => setPlantId(e.target.value)}
                  placeholder="default"
                  className="rounded-xl max-w-md"
                />
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <PhotoSlot
                  label="Current photo"
                  hint="The most recent image (today or now)."
                  file={fileCurrent}
                  preview={previewCurrent}
                  onPick={onCurrent}
                />
                <PhotoSlot
                  label="Earlier photo"
                  hint="From 1–3 days before the current shot, same plant or plot."
                  file={filePrevious}
                  preview={previewPrevious}
                  onPick={onPrevious}
                />
              </div>

              <div className="glass-card rounded-xl p-4 border border-transparent transition-all duration-300 hover:border-primary/30 hover:bg-primary/[0.03]">
                <h2 className="text-sm font-semibold mb-3">Field observations</h2>
                <div className="grid gap-4 sm:grid-cols-3">
                  <div className="space-y-1">
                    <Label htmlFor="humidity">Humidity (%)</Label>
                    <Input
                      id="humidity"
                      type="number"
                      step="0.1"
                      min={0}
                      max={100}
                      value={humidity}
                      onChange={(e) => setHumidity(e.target.value)}
                      className="rounded-xl"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="temperature">Temperature (°C)</Label>
                    <Input
                      id="temperature"
                      type="number"
                      step="0.1"
                      min={-15}
                      max={55}
                      value={temperature}
                      onChange={(e) => setTemperature(e.target.value)}
                      className="rounded-xl"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="ndvi">NDVI (−1 to 1)</Label>
                    <Input
                      id="ndvi"
                      type="number"
                      step="0.01"
                      min={-1}
                      max={1}
                      value={ndvi}
                      onChange={(e) => setNdvi(e.target.value)}
                      className="rounded-xl"
                    />
                  </div>
                </div>
              </div>

              <div className="flex gap-3">
                <Button
                  size="lg"
                  className="flex-1 gradient-hero text-primary-foreground font-semibold rounded-xl"
                  disabled={!canSubmit || isLoading}
                  onClick={() => void handleRun()}
                >
                  {isLoading ? (
                    <>
                      <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                      Analyzing…
                    </>
                  ) : (
                    "Run outlook"
                  )}
                </Button>
                {(fileCurrent || filePrevious) && (
                  <Button size="lg" variant="outline" className="rounded-xl" type="button" onClick={reset}>
                    Clear
                  </Button>
                )}
              </div>
            </div>
          </motion.div>
        ) : (
          <motion.div
            key="dashboard"
            initial={{ opacity: 0, scale: 0.98 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.35 }}
          >
            <div
              className={cn(
                "grid gap-6 items-start",
                fileCurrent && "lg:grid-cols-[1fr_minmax(280px,360px)]",
              )}
            >
              <div className="min-w-0 space-y-6">
                <PrognosisDashboard
                  result={result}
                  previewCurrent={previewCurrent}
                  previewPrevious={previewPrevious}
                />
                <Button size="lg" variant="outline" className="w-full rounded-xl" type="button" onClick={reset}>
                  New assessment
                </Button>
              </div>
              {fileCurrent && <GeminiChatPanel file={fileCurrent} />}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
