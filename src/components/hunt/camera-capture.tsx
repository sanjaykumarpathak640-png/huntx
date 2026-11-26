"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { Camera, CheckCircle2, ImageUp, Loader2, MapPin, RefreshCw, RotateCcw, Send, SwitchCamera, X } from "lucide-react";
import { Button } from "@/components/ui";
import { useToast } from "@/components/toast";
import { serverNow } from "@/hooks/use-server-clock";
import { api, cn } from "@/lib/utils";

export interface CapturePosition {
  lat: number;
  lng: number;
  accuracy: number;
}

interface Props {
  open: boolean;
  onClose: () => void;
  clue: { id: string; number: number; title: string };
  verified: boolean;
  position: CapturePosition | null;
  allowGallery: boolean;
  maxSizeMb: number;
  suspendAntiCheat: (ms?: number) => void;
  onSubmitted: () => void;
}

const MAX_EDGE = 1920;

/**
 * Live in-browser camera capture. The camera stream starts only when this
 * screen is opened by the user and is stopped as soon as it closes.
 * Gallery upload is hidden unless the organiser enables it.
 */
export function CameraCapture({ open, onClose, clue, verified, position, allowGallery, maxSizeMb, suspendAntiCheat, onSubmitted }: Props) {
  const toast = useToast();
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [facing, setFacing] = useState<"environment" | "user">("environment");
  const [multiCam, setMultiCam] = useState(false);
  const [status, setStatus] = useState<"starting" | "live" | "error">("starting");
  const [error, setError] = useState<string | null>(null);
  const [shot, setShot] = useState<{ blob: Blob; url: string; at: number; source: "camera" | "gallery" } | null>(null);
  const [sending, setSending] = useState(false);
  const [clock, setClock] = useState(() => serverNow());

  const stop = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }, []);

  const start = useCallback(
    async (mode: "environment" | "user") => {
      stop();
      setStatus("starting");
      setError(null);
      if (!navigator.mediaDevices?.getUserMedia) {
        setStatus("error");
        setError("This browser does not support in-page camera capture. Try Chrome or Safari over HTTPS.");
        return;
      }
      suspendAntiCheat(12000); // permission prompt blurs the window on mobile
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: mode }, width: { ideal: 1920 }, height: { ideal: 1080 } },
          audio: false,
        });
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play().catch(() => {});
        }
        setStatus("live");
        const devices = await navigator.mediaDevices.enumerateDevices();
        setMultiCam(devices.filter((d) => d.kind === "videoinput").length > 1);
      } catch (e) {
        const name = (e as DOMException).name;
        setStatus("error");
        setError(
          name === "NotAllowedError"
            ? "Camera permission was denied. Allow camera access for this site in your browser settings, then retry."
            : name === "NotFoundError"
              ? "No camera found on this device."
              : "Could not start the camera. Close other apps using it and retry.",
        );
      }
    },
    [stop, suspendAntiCheat],
  );

  useEffect(() => {
    if (open && !shot) start(facing);
    if (!open) {
      stop();
      setShot(null);
    }
    return () => {
      if (!open) stop();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => () => stop(), [stop]);

  useEffect(() => {
    if (!open) return;
    const id = setInterval(() => setClock(serverNow()), 1000);
    return () => clearInterval(id);
  }, [open]);

  function capture() {
    const v = videoRef.current;
    if (!v || !v.videoWidth) return;
    const scale = Math.min(1, MAX_EDGE / Math.max(v.videoWidth, v.videoHeight));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(v.videoWidth * scale);
    canvas.height = Math.round(v.videoHeight * scale);
    const ctx = canvas.getContext("2d")!;
    if (facing === "user") {
      ctx.translate(canvas.width, 0);
      ctx.scale(-1, 1);
    }
    ctx.drawImage(v, 0, 0, canvas.width, canvas.height);
    canvas.toBlob(
      (blob) => {
        if (!blob) return;
        setShot({ blob, url: URL.createObjectURL(blob), at: serverNow(), source: "camera" });
        stop();
      },
      "image/jpeg",
      0.86,
    );
  }

  function retake() {
    if (shot) URL.revokeObjectURL(shot.url);
    setShot(null);
    start(facing);
  }

  function flip() {
    const next = facing === "environment" ? "user" : "environment";
    setFacing(next);
    start(next);
  }

  function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (!f) return;
    if (f.size > maxSizeMb * 1024 * 1024) return toast({ kind: "error", title: `Image must be under ${maxSizeMb} MB` });
    stop();
    setShot({ blob: f, url: URL.createObjectURL(f), at: serverNow(), source: "gallery" });
  }

  async function submit() {
    if (!shot) return;
    setSending(true);
    try {
      const fd = new FormData();
      fd.append("photo", shot.blob, "capture.jpg");
      fd.append("clue_id", clue.id);
      fd.append("captured_at", String(Math.round(shot.at)));
      fd.append("source", shot.source);
      if (position) {
        fd.append("lat", String(position.lat));
        fd.append("lng", String(position.lng));
        fd.append("accuracy", String(position.accuracy));
      }
      const r = await api<{ late: boolean; flagged: boolean }>("/api/team/submit-photo", { method: "POST", body: fd });
      toast({
        kind: r.flagged ? "warning" : "success",
        title: "📸 Photo submitted",
        body: r.flagged ? "Flagged for organiser review." : r.late ? "Submitted after the deadline — late penalty applied." : "Waiting for organiser review.",
      });
      URL.revokeObjectURL(shot.url);
      setShot(null);
      onSubmitted();
      onClose();
    } catch (e) {
      toast({ kind: "error", title: "Submission failed", body: (e as Error).message });
    } finally {
      setSending(false);
    }
  }

  if (!open) return null;
  const ts = new Date(shot?.at ?? clock);

  return (
    <div className="fixed inset-0 z-[90] flex flex-col bg-black">
      {/* top bar */}
      <div className="flex items-center justify-between gap-2 px-4 pb-2 pt-[max(12px,env(safe-area-inset-top))]">
        <button onClick={onClose} className="rounded-full bg-white/10 p-2 text-white" aria-label="Close camera">
          <X className="h-5 w-5" />
        </button>
        <div className="min-w-0 text-center">
          <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-slate-400">Clue {String(clue.number).padStart(2, "0")}</p>
          <p className="truncate text-sm font-semibold text-white">{clue.title}</p>
        </div>
        <span
          className={cn(
            "inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider",
            verified ? "border-neon/40 bg-neon/15 text-neon" : "border-amber/40 bg-amber/15 text-amber",
          )}
        >
          {verified ? <CheckCircle2 className="h-3 w-3" /> : <MapPin className="h-3 w-3" />}
          {verified ? "Location verified" : "Not verified"}
        </span>
      </div>

      {/* viewport */}
      <div className="relative mx-3 flex-1 overflow-hidden rounded-3xl bg-ink-900">
        {shot ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={shot.url} alt="Captured preview" className="h-full w-full object-contain" />
        ) : (
          <video
            ref={videoRef}
            playsInline
            muted
            autoPlay
            className={cn("h-full w-full object-cover", facing === "user" && "-scale-x-100")}
          />
        )}
        {/* frame overlay */}
        <div className="pointer-events-none absolute inset-5">
          {["left-0 top-0 border-l-2 border-t-2 rounded-tl-xl", "right-0 top-0 border-r-2 border-t-2 rounded-tr-xl", "bottom-0 left-0 border-b-2 border-l-2 rounded-bl-xl", "bottom-0 right-0 border-b-2 border-r-2 rounded-br-xl"].map((c) => (
            <span key={c} className={cn("absolute h-10 w-10 border-neon", c)} />
          ))}
          {!shot && (
            <span className="absolute left-1/2 top-1/2 h-8 w-8 -translate-x-1/2 -translate-y-1/2">
              <span className="absolute left-1/2 top-0 h-full w-px bg-white/40" />
              <span className="absolute left-0 top-1/2 h-px w-full bg-white/40" />
            </span>
          )}
        </div>
        <div className="pointer-events-none absolute inset-x-0 bottom-0 flex items-end justify-between bg-gradient-to-t from-black/80 to-transparent p-4 font-mono text-[10px] text-slate-300">
          <span>
            {ts.toLocaleDateString("en-IN")} {ts.toLocaleTimeString("en-IN")}
            <br />
            {shot ? (shot.source === "camera" ? "LIVE CAPTURE" : "DEVICE UPLOAD") : "REC · LIVE"}
          </span>
          {position && (
            <span className="text-right">
              {position.lat.toFixed(5)}, {position.lng.toFixed(5)}
              <br />±{Math.round(position.accuracy)} m
            </span>
          )}
        </div>
        {status === "starting" && !shot && (
          <div className="absolute inset-0 grid place-items-center">
            <Loader2 className="h-8 w-8 animate-spin text-neon" />
          </div>
        )}
        {status === "error" && !shot && (
          <div className="absolute inset-0 grid place-items-center p-6 text-center">
            <div>
              <Camera className="mx-auto h-10 w-10 text-slate-600" />
              <p className="mt-3 text-sm text-slate-300">{error}</p>
              <div className="mt-4 flex flex-wrap justify-center gap-2">
                <Button onClick={() => start(facing)} size="sm">
                  <RefreshCw className="h-4 w-4" /> Retry camera
                </Button>
              </div>
              {!allowGallery && <p className="mt-3 text-xs text-slate-500">Gallery uploads are disabled. Contact an organiser if your device can&apos;t use the camera.</p>}
            </div>
          </div>
        )}
      </div>

      {/* controls */}
      <div className="flex items-center justify-around px-6 pb-[max(20px,env(safe-area-inset-bottom))] pt-5">
        {shot ? (
          <>
            <Button variant="secondary" size="lg" onClick={retake} disabled={sending}>
              <RotateCcw className="h-5 w-5" /> Retake
            </Button>
            <Button variant="primary" size="lg" onClick={submit} loading={sending}>
              <Send className="h-5 w-5" /> Submit photo
            </Button>
          </>
        ) : (
          <>
            <div className="w-14">
              {allowGallery && (
                <>
                  <button
                    onClick={() => {
                      suspendAntiCheat(60000);
                      fileRef.current?.click();
                    }}
                    className="grid h-12 w-12 place-items-center rounded-full bg-white/10 text-white"
                    aria-label="Upload from device"
                  >
                    <ImageUp className="h-5 w-5" />
                  </button>
                  <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={onFile} />
                </>
              )}
            </div>
            <button
              onClick={capture}
              disabled={status !== "live"}
              aria-label="Capture photo"
              className="grid h-20 w-20 place-items-center rounded-full border-4 border-white/80 transition active:scale-95 disabled:opacity-40"
            >
              <span className="h-[60px] w-[60px] rounded-full bg-neon shadow-[0_0_30px_rgba(57,255,136,.6)]" />
            </button>
            <div className="w-14">
              {multiCam && (
                <button onClick={flip} className="grid h-12 w-12 place-items-center rounded-full bg-white/10 text-white" aria-label="Switch camera">
                  <SwitchCamera className="h-5 w-5" />
                </button>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
