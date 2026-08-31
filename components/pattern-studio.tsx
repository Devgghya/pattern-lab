"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  Aperture,
  ArrowDownToLine,
  Camera,
  Check,
  Expand,
  Eye,
  EyeOff,
  ImagePlus,
  Keyboard,
  Maximize,
  Pause,
  Play,
  RefreshCcw,
  Settings,
  Shapes,
  Upload,
  Video,
  X,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { Slider } from "@/components/ui/slider";

type MarkType = "line" | "circle" | "square" | "cross" | "diamond" | "arc";
type DirectionType = "flow" | "uniform" | "radial" | "random";
type InputMode = "camera" | "upload";
type SourceImage = { data: ImageData; width: number; height: number } | null;

type Settings = {
  mark: MarkType;
  direction: DirectionType;
  cell: number;
  scale: number;
  rotation: number;
  contrast: number;
  threshold: number;
  ink: string;
  paper: string;
  invert: boolean;
};

type P5Handle = {
  redraw: () => void;
  loop: () => void;
  noLoop: () => void;
  frameRate: (fps: number) => void;
  remove: () => void;
};

const DEFAULTS: Settings = {
  mark: "line",
  direction: "flow",
  cell: 18,
  scale: 104,
  rotation: 0,
  contrast: 145,
  threshold: 10,
  ink: "#a60f2d",
  paper: "#fffaf0",
  invert: false,
};

const MARKS: MarkType[] = ["line", "circle", "square", "cross", "diamond", "arc"];
const DIRECTIONS: DirectionType[] = ["flow", "uniform", "radial", "random"];
const PALETTES = [
  ["#a60f2d", "#fffaf0"],
  ["#101010", "#f5f3eb"],
  ["#1647a8", "#f3eadc"],
  ["#f05a28", "#10213a"],
  ["#f4eddd", "#15100f"],
];

const SHORTCUTS = [
  ["G", "Open settings"], ["F", "Fullscreen"], ["L", "Live camera"], ["U", "Upload image"],
  ["Space", "Freeze / resume"], ["S", "Save JPEG"], ["V", "Save SVG"], ["1–6", "Choose shape"],
  ["[ / ]", "Grid − / +"], ["− / +", "Shape scale"], ["R / ⇧R", "Rotate ±15°"],
  ["D", "Cycle direction"], ["T / ⇧T", "Threshold ±5"], ["K / ⇧K", "Contrast ±10"],
  ["C", "Cycle colours"], ["I", "Invert values"], ["X", "Reset style"], ["?", "Shortcut guide"],
];

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function hash(x: number, y: number) {
  return ((Math.sin(x * 12.9898 + y * 78.233) * 43758.5453) % 1 + 1) % 1;
}

function demoLuma(nx: number, ny: number) {
  const x = nx * 2 - 1;
  const y = ny * 2 - 1;
  const head = Math.hypot(x * 1.05, (y + 0.02) * 0.95);
  const shoulders = Math.hypot(x * 0.48, (y - 0.93) * 1.5);
  const eyeA = Math.exp(-((x + 0.29) ** 2 * 75 + (y + 0.17) ** 2 * 180));
  const eyeB = Math.exp(-((x - 0.29) ** 2 * 75 + (y + 0.17) ** 2 * 180));
  const nose = Math.exp(-(x ** 2 * 190 + (y + 0.01) ** 2 * 18));
  const mouth = Math.exp(-(x ** 2 * 38 + (y - 0.31) ** 2 * 240));
  const hair = Math.max(0, 1 - Math.hypot(x * 0.92, (y + 0.58) * 2.05));
  const texture = Math.sin((x + y) * 18) * 0.055 + Math.sin(y * 29) * 0.035;
  const darkness = Math.min(1,
    Math.max(0, 1 - head) * 0.48 +
    Math.max(0, 1 - shoulders) * 0.72 +
    hair * 0.82 + eyeA + eyeB + nose * 0.25 + mouth * 0.76 + texture,
  );
  return 1 - Math.max(0, darkness);
}

function sampleSource(source: SourceImage, nx: number, ny: number) {
  if (!source) return demoLuma(nx, ny);
  const imageAspect = source.width / source.height;
  let ix = nx;
  let iy = ny;
  if (imageAspect > 1) {
    const visibleHeight = 1 / imageAspect;
    if (ny < (1 - visibleHeight) / 2 || ny > (1 + visibleHeight) / 2) return 1;
    iy = (ny - (1 - visibleHeight) / 2) / visibleHeight;
  } else {
    const visibleWidth = imageAspect;
    if (nx < (1 - visibleWidth) / 2 || nx > (1 + visibleWidth) / 2) return 1;
    ix = (nx - (1 - visibleWidth) / 2) / visibleWidth;
  }
  const px = clamp(Math.floor(ix * source.width), 0, source.width - 1);
  const py = clamp(Math.floor(iy * source.height), 0, source.height - 1);
  const i = (py * source.width + px) * 4;
  const data = source.data.data;
  return (data[i] * 0.2126 + data[i + 1] * 0.7152 + data[i + 2] * 0.0722) / 255;
}

function darknessAt(source: SourceImage, nx: number, ny: number, settings: Settings) {
  let light = sampleSource(source, nx, ny);
  light = clamp(0.5 + (light - 0.5) * (settings.contrast / 100), 0, 1);
  return settings.invert ? light : 1 - light;
}

function markAngle(source: SourceImage, nx: number, ny: number, settings: Settings, col: number, row: number) {
  const base = (settings.rotation * Math.PI) / 180;
  if (settings.direction === "uniform") return base;
  if (settings.direction === "radial") return Math.atan2(ny - 0.5, nx - 0.5) + base;
  if (settings.direction === "random") return hash(col, row) * Math.PI + base;
  const e = 0.008;
  const gx = sampleSource(source, clamp(nx + e, 0, 1), ny) - sampleSource(source, clamp(nx - e, 0, 1), ny);
  const gy = sampleSource(source, nx, clamp(ny + e, 0, 1)) - sampleSource(source, nx, clamp(ny - e, 0, 1));
  return Math.atan2(gy, gx) + Math.PI / 2 + base;
}

function ControlRow({ label, value, children }: { label: string; value?: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2.5">
      <div className="flex items-baseline justify-between gap-3">
        <Label className="text-[10px] font-black uppercase tracking-[0.16em]">{label}</Label>
        {value && <span className="font-mono text-[9px] text-[#82786c]">{value}</span>}
      </div>
      {children}
    </div>
  );
}

function ToggleRow({ label, hint, active, onClick }: { label: string; hint?: string; active: boolean; onClick: () => void }) {
  return (
    <button
      className="flex w-full items-center justify-between rounded-md border border-[#cfc4b3] bg-[#fffaf1] px-3 py-2.5 text-left transition hover:border-primary"
      type="button"
      onClick={onClick}
      aria-pressed={active}
    >
      <span><span className="block text-[10px] font-black uppercase tracking-[0.12em]">{label}</span>{hint && <span className="mt-0.5 block text-[9px] text-[#7a7166]">{hint}</span>}</span>
      <span className={`grid size-5 place-items-center rounded-sm border ${active ? "border-primary bg-primary text-white" : "border-[#b8ac9b] bg-white"}`}>
        {active && <Check className="size-3" />}
      </span>
    </button>
  );
}

export function PatternStudio() {
  const [settings, setSettings] = useState<Settings>(DEFAULTS);
  const [mode, setMode] = useState<InputMode>("camera");
  const [started, setStarted] = useState(false);
  const [starting, setStarting] = useState(false);
  const [cameraActive, setCameraActive] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [cameras, setCameras] = useState<MediaDeviceInfo[]>([]);
  const [selectedCamera, setSelectedCamera] = useState("");
  const [mirror, setMirror] = useState(true);
  const [frozen, setFrozen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [ready, setReady] = useState(false);
  const [fileName, setFileName] = useState("No uploaded image");
  const [captureFlash, setCaptureFlash] = useState(false);

  const mountRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const captureCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const p5Ref = useRef<P5Handle | null>(null);
  const sourceRef = useRef<SourceImage>(null);
  const settingsRef = useRef(settings);
  const modeRef = useRef<InputMode>(mode);
  const mirrorRef = useRef(mirror);
  const cameraActiveRef = useRef(cameraActive);
  const frozenRef = useRef(frozen);

  useEffect(() => {
    settingsRef.current = settings;
    p5Ref.current?.redraw();
  }, [settings]);

  useEffect(() => { modeRef.current = mode; }, [mode]);
  useEffect(() => { mirrorRef.current = mirror; }, [mirror]);
  useEffect(() => { cameraActiveRef.current = cameraActive; }, [cameraActive]);
  useEffect(() => { frozenRef.current = frozen; }, [frozen]);

  const refreshCameraSource = useCallback(() => {
    const video = videoRef.current;
    if (!video || video.readyState < 2 || !video.videoWidth || !video.videoHeight) return;
    const output = 480;
    const canvas = captureCanvasRef.current ?? document.createElement("canvas");
    captureCanvasRef.current = canvas;
    if (canvas.width !== output) { canvas.width = output; canvas.height = output; }
    const context = canvas.getContext("2d", { willReadFrequently: true });
    if (!context) return;
    const side = Math.min(video.videoWidth, video.videoHeight);
    const sx = (video.videoWidth - side) / 2;
    const sy = (video.videoHeight - side) / 2;
    context.save();
    context.clearRect(0, 0, output, output);
    if (mirrorRef.current) {
      context.translate(output, 0);
      context.scale(-1, 1);
    }
    context.drawImage(video, sx, sy, side, side, 0, 0, output, output);
    context.restore();
    sourceRef.current = { data: context.getImageData(0, 0, output, output), width: output, height: output };
  }, []);

  useEffect(() => {
    let active = true;
    async function startRenderer() {
      const module = await import("p5");
      if (!active || !mountRef.current) return;
      const P5 = module.default;
      const instance = new P5((p) => {
        p.setup = () => {
          const canvas = p.createCanvas(960, 960);
          canvas.parent(mountRef.current!);
          p.pixelDensity(1);
          p.frameRate(24);
          p.rectMode(p.CENTER);
          p.strokeCap(p.SQUARE);
          p.noLoop();
          setReady(true);
        };
        p.draw = () => {
          if (modeRef.current === "camera" && cameraActiveRef.current && !frozenRef.current) refreshCameraSource();
          const source = sourceRef.current;
          const style = settingsRef.current;
          p.background(style.paper);
          p.fill(style.ink);
          p.stroke(style.ink);
          const cell = Math.max(8, style.cell * (p.width / 760));
          const count = Math.ceil(p.width / cell);
          for (let row = 0; row < count; row++) {
            for (let col = 0; col < count; col++) {
              const x = col * cell + cell / 2;
              const y = row * cell + cell / 2;
              const nx = x / p.width;
              const ny = y / p.height;
              const dark = darknessAt(source, nx, ny, style);
              if (dark * 100 < style.threshold) continue;
              const size = cell * (style.scale / 100) * (0.16 + dark * 0.98);
              const angle = markAngle(source, nx, ny, style, col, row);
              p.push();
              p.translate(x, y);
              p.rotate(angle);
              p.strokeWeight(Math.max(1.2, cell * (0.08 + dark * 0.16)));
              if (style.mark === "line") { p.noFill(); p.line(-size / 2, 0, size / 2, 0); }
              else if (style.mark === "circle") { p.noStroke(); p.circle(0, 0, size); }
              else if (style.mark === "square") { p.noStroke(); p.rect(0, 0, size, size); }
              else if (style.mark === "diamond") { p.noStroke(); p.quad(0, -size / 2, size / 2, 0, 0, size / 2, -size / 2, 0); }
              else if (style.mark === "cross") { p.noFill(); p.line(-size / 2, 0, size / 2, 0); p.line(0, -size / 2, 0, size / 2); }
              else { p.noFill(); p.arc(0, 0, size, size, 0, Math.PI); }
              p.pop();
            }
          }
        };
      }, mountRef.current);
      p5Ref.current = instance;
    }
    startRenderer();
    return () => {
      active = false;
      p5Ref.current?.remove();
      p5Ref.current = null;
    };
  }, [refreshCameraSource]);

  useEffect(() => {
    if (cameraActive && !frozen && mode === "camera") p5Ref.current?.loop();
    else { p5Ref.current?.noLoop(); p5Ref.current?.redraw(); }
  }, [cameraActive, frozen, mode]);

  useEffect(() => {
    const change = () => setIsFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener("fullscreenchange", change);
    return () => document.removeEventListener("fullscreenchange", change);
  }, []);

  useEffect(() => {
    if (!settingsOpen) return;
    const timer = window.setTimeout(() => {
      setSettingsOpen(false);
      setShortcutsOpen(false);
    }, 14000);
    return () => window.clearTimeout(timer);
  }, [settingsOpen, settings, mode, mirror, selectedCamera, shortcutsOpen]);

  useEffect(() => () => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
  }, []);

  const set = <K extends keyof Settings>(key: K, value: Settings[K]) =>
    setSettings((current) => ({ ...current, [key]: value }));

  function stopCamera() {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
    setCameraActive(false);
  }

  async function startCamera(deviceId?: string) {
    setCameraError(null);
    if (!navigator.mediaDevices?.getUserMedia) {
      setCameraError("This browser does not support camera access. Open the site in Chrome or Edge over HTTPS.");
      return false;
    }
    try {
      stopCamera();
      const videoConstraints: MediaTrackConstraints = deviceId
        ? { deviceId: { exact: deviceId }, width: { ideal: 1280 }, height: { ideal: 720 } }
        : { facingMode: "user", width: { ideal: 1280 }, height: { ideal: 720 } };
      const stream = await navigator.mediaDevices.getUserMedia({ video: videoConstraints, audio: false });
      streamRef.current = stream;
      const video = videoRef.current;
      if (!video) return false;
      video.srcObject = stream;
      await video.play();
      const devices = (await navigator.mediaDevices.enumerateDevices()).filter((device) => device.kind === "videoinput");
      setCameras(devices);
      const currentId = stream.getVideoTracks()[0]?.getSettings().deviceId ?? deviceId ?? "";
      setSelectedCamera(currentId);
      sourceRef.current = null;
      setMode("camera");
      setCameraActive(true);
      setFrozen(false);
      refreshCameraSource();
      p5Ref.current?.loop();
      return true;
    } catch (error) {
      const name = error instanceof DOMException ? error.name : "";
      setCameraError(name === "NotAllowedError"
        ? "Camera permission was blocked. Allow camera access in the address bar, then try again."
        : "The camera could not start. Check that it is connected and not being used by another app.");
      return false;
    }
  }

  async function enterFullscreen() {
    try {
      if (!document.fullscreenElement) await document.documentElement.requestFullscreen();
    } catch {
      // The installation remains usable when fullscreen is blocked.
    }
  }

  async function startInstallation() {
    setStarting(true);
    void enterFullscreen();
    const success = await startCamera(selectedCamera || undefined);
    setStarted(success);
    setStarting(false);
  }

  const loadFile = useCallback((file?: File) => {
    if (!file || !file.type.startsWith("image/")) return;
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      const ratio = Math.min(1, 1600 / Math.max(image.width, image.height));
      const width = Math.max(1, Math.round(image.width * ratio));
      const height = Math.max(1, Math.round(image.height * ratio));
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const context = canvas.getContext("2d", { willReadFrequently: true });
      if (!context) return;
      context.drawImage(image, 0, 0, width, height);
      stopCamera();
      sourceRef.current = { data: context.getImageData(0, 0, width, height), width, height };
      setMode("upload");
      setStarted(true);
      setFileName(file.name);
      p5Ref.current?.noLoop();
      p5Ref.current?.redraw();
      URL.revokeObjectURL(url);
    };
    image.src = url;
  }, []);

  function beginUpload() {
    setSettingsOpen(false);
    inputRef.current?.click();
  }

  function resetStyle() {
    settingsRef.current = DEFAULTS;
    setSettings(DEFAULTS);
    p5Ref.current?.redraw();
  }

  function flashCapture() {
    setCaptureFlash(true);
    window.setTimeout(() => setCaptureFlash(false), 180);
  }

  function downloadJpeg() {
    if (modeRef.current === "camera" && !frozenRef.current) refreshCameraSource();
    p5Ref.current?.redraw();
    window.setTimeout(() => {
      const canvas = mountRef.current?.querySelector("canvas");
      if (!canvas) return;
      const link = document.createElement("a");
      link.download = `pattern-lab-${Date.now()}.jpg`;
      link.href = canvas.toDataURL("image/jpeg", 0.95);
      link.click();
      flashCapture();
    }, 30);
  }

  function downloadSvg() {
    if (modeRef.current === "camera" && !frozenRef.current) refreshCameraSource();
    const style = settingsRef.current;
    const source = sourceRef.current;
    const width = 1200;
    const cell = Math.max(8, style.cell * (width / 760));
    const count = Math.ceil(width / cell);
    const escape = (value: string) => value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/"/g, "&quot;");
    const parts = [`<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="1200" viewBox="0 0 1200 1200">`, `<rect width="1200" height="1200" fill="${escape(style.paper)}"/>`, `<g fill="${escape(style.ink)}" stroke="${escape(style.ink)}">`];
    for (let row = 0; row < count; row++) {
      for (let col = 0; col < count; col++) {
        const x = col * cell + cell / 2;
        const y = row * cell + cell / 2;
        const nx = x / width;
        const ny = y / width;
        const dark = darknessAt(source, nx, ny, style);
        if (dark * 100 < style.threshold) continue;
        const size = cell * (style.scale / 100) * (0.16 + dark * 0.98);
        const angle = markAngle(source, nx, ny, style, col, row) * 180 / Math.PI;
        const stroke = Math.max(1.2, cell * (0.08 + dark * 0.16));
        const transform = `transform="translate(${x.toFixed(2)} ${y.toFixed(2)}) rotate(${angle.toFixed(2)})"`;
        if (style.mark === "circle") parts.push(`<circle ${transform} r="${(size / 2).toFixed(2)}" stroke="none"/>`);
        else if (style.mark === "square") parts.push(`<rect ${transform} x="${(-size / 2).toFixed(2)}" y="${(-size / 2).toFixed(2)}" width="${size.toFixed(2)}" height="${size.toFixed(2)}" stroke="none"/>`);
        else if (style.mark === "diamond") parts.push(`<path ${transform} d="M 0 ${(-size / 2).toFixed(2)} L ${(size / 2).toFixed(2)} 0 L 0 ${(size / 2).toFixed(2)} L ${(-size / 2).toFixed(2)} 0 Z" stroke="none"/>`);
        else if (style.mark === "cross") parts.push(`<path ${transform} d="M ${(-size / 2).toFixed(2)} 0 H ${(size / 2).toFixed(2)} M 0 ${(-size / 2).toFixed(2)} V ${(size / 2).toFixed(2)}" fill="none" stroke-width="${stroke.toFixed(2)}"/>`);
        else if (style.mark === "arc") parts.push(`<path ${transform} d="M ${(-size / 2).toFixed(2)} 0 A ${(size / 2).toFixed(2)} ${(size / 2).toFixed(2)} 0 0 1 ${(size / 2).toFixed(2)} 0" fill="none" stroke-width="${stroke.toFixed(2)}"/>`);
        else parts.push(`<line ${transform} x1="${(-size / 2).toFixed(2)}" x2="${(size / 2).toFixed(2)}" y1="0" y2="0" stroke-width="${stroke.toFixed(2)}"/>`);
      }
    }
    parts.push("</g></svg>");
    const href = URL.createObjectURL(new Blob([parts.join("")], { type: "image/svg+xml" }));
    const link = document.createElement("a");
    link.download = `pattern-lab-${Date.now()}.svg`;
    link.href = href;
    link.click();
    URL.revokeObjectURL(href);
    flashCapture();
  }

  async function selectLiveMode() {
    setMode("camera");
    setStarted(true);
    if (!cameraActiveRef.current) await startCamera(selectedCamera || undefined);
  }

  function toggleFreeze() {
    if (!cameraActiveRef.current || modeRef.current !== "camera") return;
    setFrozen((value) => !value);
  }

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      const target = event.target as HTMLElement;
      if (["INPUT", "SELECT", "TEXTAREA"].includes(target.tagName)) return;
      if (event.ctrlKey || event.metaKey || event.altKey) return;
      const key = event.key.toLowerCase();
      if (key === "escape") { setSettingsOpen(false); setShortcutsOpen(false); return; }
      if (key === "?") { event.preventDefault(); setSettingsOpen(true); setShortcutsOpen((open) => !open); return; }
      if (key === "g") { event.preventDefault(); setSettingsOpen((open) => !open); return; }
      if (key === "f") { event.preventDefault(); void enterFullscreen(); return; }
      if (key === "l") { event.preventDefault(); void selectLiveMode(); return; }
      if (key === "u") { event.preventDefault(); beginUpload(); return; }
      if (key === " ") { event.preventDefault(); toggleFreeze(); return; }
      if (key === "s") { event.preventDefault(); downloadJpeg(); return; }
      if (key === "v") { event.preventDefault(); downloadSvg(); return; }
      if (key === "x") { event.preventDefault(); resetStyle(); return; }
      if (/^[1-6]$/.test(key)) { event.preventDefault(); set("mark", MARKS[Number(key) - 1]); return; }
      if (key === "i") { event.preventDefault(); setSettings((style) => ({ ...style, invert: !style.invert })); return; }
      if (key === "d") { event.preventDefault(); setSettings((style) => ({ ...style, direction: DIRECTIONS[(DIRECTIONS.indexOf(style.direction) + 1) % DIRECTIONS.length] })); return; }
      if (key === "c") { event.preventDefault(); setSettings((style) => { const index = PALETTES.findIndex(([ink, paper]) => ink === style.ink && paper === style.paper); const [ink, paper] = PALETTES[(index + 1) % PALETTES.length]; return { ...style, ink, paper }; }); return; }
      if (key === "[") { event.preventDefault(); setSettings((style) => ({ ...style, cell: clamp(style.cell - 1, 10, 40) })); return; }
      if (key === "]") { event.preventDefault(); setSettings((style) => ({ ...style, cell: clamp(style.cell + 1, 10, 40) })); return; }
      if (key === "-" || key === "_") { event.preventDefault(); setSettings((style) => ({ ...style, scale: clamp(style.scale - 5, 35, 160) })); return; }
      if (key === "+" || key === "=") { event.preventDefault(); setSettings((style) => ({ ...style, scale: clamp(style.scale + 5, 35, 160) })); return; }
      if (key === "r") { event.preventDefault(); setSettings((style) => ({ ...style, rotation: clamp(style.rotation + (event.shiftKey ? -15 : 15), -180, 180) })); return; }
      if (key === "t") { event.preventDefault(); setSettings((style) => ({ ...style, threshold: clamp(style.threshold + (event.shiftKey ? -5 : 5), 0, 65) })); return; }
      if (key === "k") { event.preventDefault(); setSettings((style) => ({ ...style, contrast: clamp(style.contrast + (event.shiftKey ? -10 : 10), 50, 220) })); }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  return (
    <main className="installation-root" style={{ background: settings.paper }}>
      <video ref={videoRef} className="hidden" playsInline muted aria-hidden="true" />
      <input ref={inputRef} className="hidden" type="file" accept="image/*" onChange={(event) => loadFile(event.target.files?.[0])} aria-label="Upload image" />

      <div ref={mountRef} className="installation-canvas" aria-label="Live generative artwork" />
      <div className={`capture-flash ${captureFlash ? "capture-flash-active" : ""}`} aria-hidden="true" />

      {!started && (
        <section className="start-screen" aria-labelledby="start-title">
          <div className="start-card">
            <div className="mb-7 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="grid size-10 place-items-center rounded-md bg-primary text-white"><Aperture className="size-5" /></div>
                <div><p className="text-[11px] font-black uppercase tracking-[.18em]">Pattern Lab</p><p className="font-mono text-[9px] uppercase tracking-[.16em] text-[#7b7063]">Installation V2</p></div>
              </div>
              <span className={`size-2 rounded-full ${ready ? "bg-[#39a564]" : "bg-amber-500"}`} />
            </div>
            <p className="mb-3 font-mono text-[10px] font-bold uppercase tracking-[.18em] text-primary">Live generative camera</p>
            <h1 id="start-title" className="max-w-xl text-4xl font-black uppercase leading-[.92] tracking-[-.045em] sm:text-6xl">Walk in.<br />Become the artwork.</h1>
            <p className="mt-5 max-w-md text-sm leading-6 text-[#675e54]">Your camera is transformed into geometric marks in real time. Everything is processed locally on this screen.</p>
            {cameraError && <div className="mt-5 rounded-md border border-[#d4959e] bg-[#fff1f2] p-3 text-xs leading-5 text-[#7d1527]">{cameraError}</div>}
            <div className="mt-7 flex flex-col gap-2 sm:flex-row">
              <Button size="lg" className="h-12 flex-1 text-xs font-black uppercase tracking-[.12em]" onClick={startInstallation} disabled={starting}>
                {starting ? <RefreshCcw className="animate-spin" /> : <Camera />} {starting ? "Starting camera" : "Start installation"}
              </Button>
              <Button size="lg" variant="outline" className="h-12 border-[#b9ad9c] bg-[#fffaf1] text-xs font-black uppercase tracking-[.1em]" onClick={beginUpload}>
                <ImagePlus /> Use an image
              </Button>
            </div>
            <div className="mt-5 flex flex-wrap gap-x-5 gap-y-2 border-t border-[#d9cfc0] pt-4 font-mono text-[8px] uppercase tracking-[.12em] text-[#837a6f]"><span>Camera permission required once</span><span>Press G for controls</span><span>Press ? for keys</span></div>
          </div>
        </section>
      )}

      {started && (
        <>
          <div className="installation-brand" aria-hidden="true">
            <Aperture className="size-4" /><span>Pattern Lab / V2</span>
          </div>
          <button className="settings-trigger" type="button" onClick={() => setSettingsOpen(true)} aria-label="Open settings">
            <Settings className="size-5" /><span className="sr-only">Settings</span>
          </button>
          <div className="installation-status" aria-live="polite">
            <span className={`size-1.5 rounded-full ${mode === "camera" && cameraActive ? frozen ? "bg-amber-400" : "bg-[#56d582]" : "bg-white/50"}`} />
            <span>{mode === "camera" ? frozen ? "Frame frozen" : "Live camera · local" : `Image · ${fileName}`}</span>
          </div>
        </>
      )}

      {settingsOpen && (
        <div className="settings-layer" role="dialog" aria-modal="true" aria-label="Pattern Lab settings">
          <button className="settings-backdrop" aria-label="Close settings" onClick={() => setSettingsOpen(false)} />
          <aside className="settings-panel">
            <header className="sticky top-0 z-10 flex items-center justify-between border-b border-[#d5cab9] bg-[#f6f0e5]/95 px-5 py-4 backdrop-blur">
              <div><p className="text-[11px] font-black uppercase tracking-[.18em]">Installation controls</p><p className="mt-1 font-mono text-[8px] uppercase tracking-[.14em] text-[#81776a]">Auto-hides after 14 seconds</p></div>
              <button className="rounded-md border border-[#c8bdad] bg-[#fffaf1] p-2 hover:border-primary" onClick={() => setSettingsOpen(false)} aria-label="Close settings"><X className="size-4" /></button>
            </header>

            <div className="space-y-7 p-5">
              <section className="space-y-4">
                <div className="section-heading"><Video className="size-3.5" /><h2>Input source</h2><span>01</span></div>
                <div className="grid grid-cols-2 gap-2">
                  <Button variant={mode === "camera" ? "default" : "outline"} className="h-11 text-[10px] font-black uppercase tracking-[.1em]" onClick={() => void selectLiveMode()}><Camera /> Live camera</Button>
                  <Button variant={mode === "upload" ? "default" : "outline"} className="h-11 text-[10px] font-black uppercase tracking-[.1em]" onClick={beginUpload}><Upload /> Upload</Button>
                </div>
                {mode === "camera" && (
                  <>
                    <ControlRow label="Camera device">
                      <NativeSelect className="w-full bg-[#fffaf1]" value={selectedCamera} onChange={(event) => { setSelectedCamera(event.target.value); void startCamera(event.target.value); }}>
                        {cameras.length === 0 && <NativeSelectOption value="">Default camera</NativeSelectOption>}
                        {cameras.map((camera, index) => <NativeSelectOption key={camera.deviceId} value={camera.deviceId}>{camera.label || `Camera ${index + 1}`}</NativeSelectOption>)}
                      </NativeSelect>
                    </ControlRow>
                    <ToggleRow label="Mirror movement" hint="Recommended for an installation" active={mirror} onClick={() => setMirror((value) => !value)} />
                    <div className="grid grid-cols-2 gap-2">
                      <Button variant="outline" className="bg-[#fffaf1] text-[10px] font-black uppercase tracking-[.08em]" onClick={toggleFreeze} disabled={!cameraActive}>{frozen ? <Play /> : <Pause />}{frozen ? "Resume" : "Freeze"}</Button>
                      <Button variant="outline" className="bg-[#fffaf1] text-[10px] font-black uppercase tracking-[.08em]" onClick={() => void startCamera(selectedCamera || undefined)}><RefreshCcw /> Restart</Button>
                    </div>
                  </>
                )}
                {cameraError && <p className="rounded-md border border-[#d4959e] bg-[#fff1f2] p-3 text-[10px] leading-4 text-[#7d1527]">{cameraError}</p>}
              </section>

              <section className="space-y-5">
                <div className="section-heading"><Shapes className="size-3.5" /><h2>Pattern</h2><span>02</span></div>
                <ControlRow label="Mark type">
                  <NativeSelect className="w-full bg-[#fffaf1]" value={settings.mark} onChange={(event) => set("mark", event.target.value as MarkType)}>
                    <NativeSelectOption value="line">1 — Lines / Stitches</NativeSelectOption><NativeSelectOption value="circle">2 — Round dots</NativeSelectOption><NativeSelectOption value="square">3 — Square pixels</NativeSelectOption><NativeSelectOption value="cross">4 — Crosses</NativeSelectOption><NativeSelectOption value="diamond">5 — Diamonds</NativeSelectOption><NativeSelectOption value="arc">6 — Half arcs</NativeSelectOption>
                  </NativeSelect>
                </ControlRow>
                <ControlRow label="Direction" value={settings.direction}>
                  <NativeSelect className="w-full bg-[#fffaf1]" value={settings.direction} onChange={(event) => set("direction", event.target.value as DirectionType)}>
                    <NativeSelectOption value="flow">Follow contours</NativeSelectOption><NativeSelectOption value="uniform">Uniform</NativeSelectOption><NativeSelectOption value="radial">Radial</NativeSelectOption><NativeSelectOption value="random">Seeded random</NativeSelectOption>
                  </NativeSelect>
                </ControlRow>
                <ControlRow label="Grid size" value={`${settings.cell}px · [ ]`}><Slider min={10} max={40} step={1} value={[settings.cell]} onValueChange={([value]) => set("cell", value)} /></ControlRow>
                <ControlRow label="Shape scale" value={`${settings.scale}% · − +`}><Slider min={35} max={160} step={1} value={[settings.scale]} onValueChange={([value]) => set("scale", value)} /></ControlRow>
                <ControlRow label="Rotation" value={`${settings.rotation}° · R`}><Slider min={-180} max={180} step={1} value={[settings.rotation]} onValueChange={([value]) => set("rotation", value)} /></ControlRow>
              </section>

              <section className="space-y-5">
                <div className="section-heading"><Eye className="size-3.5" /><h2>Tone & colour</h2><span>03</span></div>
                <ControlRow label="Contrast" value={`${settings.contrast}% · K`}><Slider min={50} max={220} step={1} value={[settings.contrast]} onValueChange={([value]) => set("contrast", value)} /></ControlRow>
                <ControlRow label="Blank threshold" value={`${settings.threshold}% · T`}><Slider min={0} max={65} step={1} value={[settings.threshold]} onValueChange={([value]) => set("threshold", value)} /></ControlRow>
                <div className="grid grid-cols-2 gap-3">
                  <label className="colour-field"><span>Ink</span><span><input type="color" value={settings.ink} onChange={(event) => set("ink", event.target.value)} />{settings.ink}</span></label>
                  <label className="colour-field"><span>Paper</span><span><input type="color" value={settings.paper} onChange={(event) => set("paper", event.target.value)} />{settings.paper}</span></label>
                </div>
                <ToggleRow label="Invert image values" active={settings.invert} onClick={() => set("invert", !settings.invert)} />
              </section>

              <section className="space-y-3">
                <div className="section-heading"><ArrowDownToLine className="size-3.5" /><h2>Installation & export</h2><span>04</span></div>
                <Button className="h-12 w-full text-[10px] font-black uppercase tracking-[.12em]" onClick={downloadJpeg}><Camera /> Capture square JPEG <kbd>S</kbd></Button>
                <div className="grid grid-cols-2 gap-2">
                  <Button variant="outline" className="bg-[#fffaf1] text-[10px] font-black uppercase tracking-[.08em]" onClick={downloadSvg}><ArrowDownToLine /> SVG <kbd>V</kbd></Button>
                  <Button variant="outline" className="bg-[#fffaf1] text-[10px] font-black uppercase tracking-[.08em]" onClick={() => void enterFullscreen()}>{isFullscreen ? <Expand /> : <Maximize />}{isFullscreen ? "Fullscreen on" : "Fullscreen"}</Button>
                </div>
                <Button variant="outline" className="w-full bg-[#fffaf1] text-[10px] font-black uppercase tracking-[.08em]" onClick={resetStyle}><RefreshCcw /> Reset visual style <kbd>X</kbd></Button>
              </section>

              <section className="space-y-3">
                <button className="flex w-full items-center justify-between border-y border-[#d6ccbd] py-3 text-left" onClick={() => setShortcutsOpen((open) => !open)} aria-expanded={shortcutsOpen}>
                  <span className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[.13em]"><Keyboard className="size-4" /> Keyboard guide</span>
                  {shortcutsOpen ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                </button>
                {shortcutsOpen && <div className="grid grid-cols-2 gap-x-4 gap-y-2 pt-1">{SHORTCUTS.map(([keys, action]) => <div key={keys} className="flex items-center gap-2 border-t border-[#ddd2c2] pt-2"><kbd className="min-w-12 font-mono text-[8px] font-bold text-primary">{keys}</kbd><span className="text-[8px] uppercase tracking-[.07em] text-[#766d62]">{action}</span></div>)}</div>}
              </section>

              <div className="rounded-md border border-[#d2c7b7] bg-[#fffaf1] p-3 font-mono text-[8px] uppercase leading-4 tracking-[.1em] text-[#7b7268]">Camera frames stay in this browser. Nothing is recorded or uploaded.</div>
            </div>
          </aside>
        </div>
      )}
    </main>
  );
}
