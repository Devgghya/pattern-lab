"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  ArrowDownToLine,
  Check,
  ImagePlus,
  Keyboard,
  RefreshCcw,
  Shapes,
  Sparkles,
  Upload,
  X,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { Slider } from "@/components/ui/slider";

type MarkType = "line" | "circle" | "square" | "cross" | "diamond" | "arc";
type DirectionType = "flow" | "uniform" | "radial" | "random";
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

const DEFAULTS: Settings = {
  mark: "line",
  direction: "flow",
  cell: 12,
  scale: 92,
  rotation: 0,
  contrast: 135,
  threshold: 8,
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
];

type SourceImage = { data: ImageData; width: number; height: number } | null;

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
  const face = Math.max(0, 1 - head);
  const body = Math.max(0, 1 - shoulders);
  const texture = Math.sin((x + y) * 18) * 0.055 + Math.sin(y * 29) * 0.035;
  const darkness = Math.min(1, face * 0.48 + body * 0.72 + hair * 0.82 + eyeA + eyeB + nose * 0.25 + mouth * 0.76 + texture);
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
  const d = source.data.data;
  return (d[i] * 0.2126 + d[i + 1] * 0.7152 + d[i + 2] * 0.0722) / 255;
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
        <Label className="text-[11px] font-bold uppercase tracking-[0.16em]">{label}</Label>
        {value && <span className="font-mono text-[10px] text-muted-foreground">{value}</span>}
      </div>
      {children}
    </div>
  );
}

const SHORTCUTS = [
  ["U", "Upload image"], ["S", "Save JPEG"], ["V", "Save SVG"], ["1–6", "Choose shape"],
  ["[ / ]", "Grid − / +"], ["− / +", "Shape scale"], ["R / ⇧R", "Rotate ±15°"],
  ["D", "Cycle direction"], ["T / ⇧T", "Threshold ±5"], ["K / ⇧K", "Contrast ±10"],
  ["C", "Cycle colours"], ["I", "Invert values"], ["X", "Reset studio"], ["?", "Show shortcuts"],
];

export function PatternStudio() {
  const [settings, setSettings] = useState<Settings>(DEFAULTS);
  const [fileName, setFileName] = useState("Built-in portrait study");
  const [dragging, setDragging] = useState(false);
  const [ready, setReady] = useState(false);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const mountRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const p5Ref = useRef<{ redraw: () => void; resizeCanvas: (w: number, h: number) => void; remove: () => void } | null>(null);
  const settingsRef = useRef(settings);
  const sourceRef = useRef<SourceImage>(null);

  useEffect(() => {
    settingsRef.current = settings;
    p5Ref.current?.redraw();
  }, [settings]);

  useEffect(() => {
    let active = true;
    let observer: ResizeObserver | undefined;
    async function start() {
      const module = await import("p5");
      if (!active || !mountRef.current) return;
      const P5 = module.default;
      const instance = new P5((p) => {
        p.setup = () => {
          const width = Math.max(280, Math.floor(mountRef.current!.getBoundingClientRect().width));
          const canvas = p.createCanvas(width, width);
          canvas.parent(mountRef.current!);
          p.pixelDensity(Math.min(2, window.devicePixelRatio || 1));
          p.noLoop();
          p.rectMode(p.CENTER);
          p.strokeCap(p.SQUARE);
          setReady(true);
        };
        p.draw = () => {
          const s = settingsRef.current;
          p.background(s.paper);
          p.fill(s.ink);
          p.stroke(s.ink);
          const cell = Math.max(5, s.cell * (p.width / 760));
          const count = Math.ceil(p.width / cell);
          for (let row = 0; row < count; row++) {
            for (let col = 0; col < count; col++) {
              const x = col * cell + cell / 2;
              const y = row * cell + cell / 2;
              const nx = x / p.width;
              const ny = y / p.height;
              const dark = darknessAt(sourceRef.current, nx, ny, s);
              if (dark * 100 < s.threshold) continue;
              const size = cell * (s.scale / 100) * (0.16 + dark * 0.98);
              const angle = markAngle(sourceRef.current, nx, ny, s, col, row);
              p.push();
              p.translate(x, y);
              p.rotate(angle);
              p.strokeWeight(Math.max(1, cell * (0.08 + dark * 0.16)));
              if (s.mark === "line") { p.noFill(); p.line(-size / 2, 0, size / 2, 0); }
              else if (s.mark === "circle") { p.noStroke(); p.circle(0, 0, size); }
              else if (s.mark === "square") { p.noStroke(); p.rect(0, 0, size, size); }
              else if (s.mark === "diamond") { p.noStroke(); p.quad(0, -size / 2, size / 2, 0, 0, size / 2, -size / 2, 0); }
              else if (s.mark === "cross") { p.noFill(); p.line(-size / 2, 0, size / 2, 0); p.line(0, -size / 2, 0, size / 2); }
              else { p.noFill(); p.arc(0, 0, size, size, 0, Math.PI); }
              p.pop();
            }
          }
        };
      }, mountRef.current);
      p5Ref.current = instance;
      observer = new ResizeObserver(([entry]) => {
        const width = Math.max(280, Math.floor(entry.contentRect.width));
        instance.resizeCanvas(width, width);
        instance.redraw();
      });
      observer.observe(mountRef.current);
    }
    start();
    return () => {
      active = false;
      observer?.disconnect();
      p5Ref.current?.remove();
      p5Ref.current = null;
    };
  }, []);

  const set = <K extends keyof Settings>(key: K, value: Settings[K]) =>
    setSettings((current) => ({ ...current, [key]: value }));

  const loadFile = useCallback((file?: File) => {
    if (!file || !file.type.startsWith("image/")) return;
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      const ratio = Math.min(1, 1400 / Math.max(image.width, image.height));
      const width = Math.max(1, Math.round(image.width * ratio));
      const height = Math.max(1, Math.round(image.height * ratio));
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const context = canvas.getContext("2d", { willReadFrequently: true });
      if (!context) return;
      context.drawImage(image, 0, 0, width, height);
      sourceRef.current = { data: context.getImageData(0, 0, width, height), width, height };
      setFileName(file.name);
      p5Ref.current?.redraw();
      URL.revokeObjectURL(url);
    };
    image.src = url;
  }, []);

  function reset() {
    sourceRef.current = null;
    settingsRef.current = DEFAULTS;
    setSettings(DEFAULTS);
    setFileName("Built-in portrait study");
    p5Ref.current?.redraw();
  }

  function downloadJpeg() {
    const canvas = mountRef.current?.querySelector("canvas");
    if (!canvas) return;
    const link = document.createElement("a");
    link.download = "pattern-lab-square.jpg";
    link.href = canvas.toDataURL("image/jpeg", 0.94);
    link.click();
  }

  function downloadSvg() {
    const s = settingsRef.current;
    const width = 1200;
    const cell = Math.max(6, s.cell * (width / 760));
    const count = Math.ceil(width / cell);
    const esc = (value: string) => value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/"/g, "&quot;");
    const parts = [`<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="1200" viewBox="0 0 1200 1200">`, `<rect width="1200" height="1200" fill="${esc(s.paper)}"/>`, `<g fill="${esc(s.ink)}" stroke="${esc(s.ink)}">`];
    for (let row = 0; row < count; row++) {
      for (let col = 0; col < count; col++) {
        const x = col * cell + cell / 2;
        const y = row * cell + cell / 2;
        const nx = x / width;
        const ny = y / width;
        const dark = darknessAt(sourceRef.current, nx, ny, s);
        if (dark * 100 < s.threshold) continue;
        const size = cell * (s.scale / 100) * (0.16 + dark * 0.98);
        const angle = markAngle(sourceRef.current, nx, ny, s, col, row) * 180 / Math.PI;
        const stroke = Math.max(1, cell * (0.08 + dark * 0.16));
        const tr = `transform="translate(${x.toFixed(2)} ${y.toFixed(2)}) rotate(${angle.toFixed(2)})"`;
        if (s.mark === "circle") parts.push(`<circle ${tr} r="${(size / 2).toFixed(2)}" stroke="none"/>`);
        else if (s.mark === "square") parts.push(`<rect ${tr} x="${(-size / 2).toFixed(2)}" y="${(-size / 2).toFixed(2)}" width="${size.toFixed(2)}" height="${size.toFixed(2)}" stroke="none"/>`);
        else if (s.mark === "diamond") parts.push(`<path ${tr} d="M 0 ${(-size / 2).toFixed(2)} L ${(size / 2).toFixed(2)} 0 L 0 ${(size / 2).toFixed(2)} L ${(-size / 2).toFixed(2)} 0 Z" stroke="none"/>`);
        else if (s.mark === "cross") parts.push(`<path ${tr} d="M ${(-size / 2).toFixed(2)} 0 H ${(size / 2).toFixed(2)} M 0 ${(-size / 2).toFixed(2)} V ${(size / 2).toFixed(2)}" fill="none" stroke-width="${stroke.toFixed(2)}"/>`);
        else if (s.mark === "arc") parts.push(`<path ${tr} d="M ${(-size / 2).toFixed(2)} 0 A ${(size / 2).toFixed(2)} ${(size / 2).toFixed(2)} 0 0 1 ${(size / 2).toFixed(2)} 0" fill="none" stroke-width="${stroke.toFixed(2)}"/>`);
        else parts.push(`<line ${tr} x1="${(-size / 2).toFixed(2)}" x2="${(size / 2).toFixed(2)}" y1="0" y2="0" stroke-width="${stroke.toFixed(2)}"/>`);
      }
    }
    parts.push("</g></svg>");
    const href = URL.createObjectURL(new Blob([parts.join("")], { type: "image/svg+xml" }));
    const link = document.createElement("a");
    link.download = "pattern-lab-square.svg";
    link.href = href;
    link.click();
    URL.revokeObjectURL(href);
  }

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      const target = event.target as HTMLElement;
      if (["INPUT", "SELECT", "TEXTAREA"].includes(target.tagName)) return;
      if (event.ctrlKey || event.metaKey || event.altKey) return;
      const key = event.key.toLowerCase();
      if (key === "?") { event.preventDefault(); setShortcutsOpen((open) => !open); return; }
      if (key === "u") { event.preventDefault(); inputRef.current?.click(); return; }
      if (key === "s") { event.preventDefault(); downloadJpeg(); return; }
      if (key === "v") { event.preventDefault(); downloadSvg(); return; }
      if (key === "x") { event.preventDefault(); reset(); return; }
      if (/^[1-6]$/.test(key)) { event.preventDefault(); set("mark", MARKS[Number(key) - 1]); return; }
      if (key === "i") { event.preventDefault(); setSettings((s) => ({ ...s, invert: !s.invert })); return; }
      if (key === "d") { event.preventDefault(); setSettings((s) => ({ ...s, direction: DIRECTIONS[(DIRECTIONS.indexOf(s.direction) + 1) % DIRECTIONS.length] })); return; }
      if (key === "c") { event.preventDefault(); setSettings((s) => { const index = PALETTES.findIndex(([ink, paper]) => ink === s.ink && paper === s.paper); const [ink, paper] = PALETTES[(index + 1) % PALETTES.length]; return { ...s, ink, paper }; }); return; }
      if (key === "[") { event.preventDefault(); setSettings((s) => ({ ...s, cell: clamp(s.cell - 1, 6, 30) })); return; }
      if (key === "]") { event.preventDefault(); setSettings((s) => ({ ...s, cell: clamp(s.cell + 1, 6, 30) })); return; }
      if (key === "-" || key === "_") { event.preventDefault(); setSettings((s) => ({ ...s, scale: clamp(s.scale - 5, 35, 150) })); return; }
      if (key === "+" || key === "=") { event.preventDefault(); setSettings((s) => ({ ...s, scale: clamp(s.scale + 5, 35, 150) })); return; }
      if (key === "r") { event.preventDefault(); setSettings((s) => ({ ...s, rotation: clamp(s.rotation + (event.shiftKey ? -15 : 15), -180, 180) })); return; }
      if (key === "t") { event.preventDefault(); setSettings((s) => ({ ...s, threshold: clamp(s.threshold + (event.shiftKey ? -5 : 5), 0, 65) })); return; }
      if (key === "k") { event.preventDefault(); setSettings((s) => ({ ...s, contrast: clamp(s.contrast + (event.shiftKey ? -10 : 10), 50, 220) })); }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  return (
    <main className="min-h-screen p-3 sm:p-5 lg:p-6">
      <div className="mx-auto max-w-[1540px] overflow-hidden rounded-[18px] border border-[#b9ad9c] bg-[#f8f4ea] shadow-[0_24px_70px_rgba(69,42,30,0.14)]">
        <header className="relative flex min-h-16 items-center justify-between gap-4 border-b border-[#c9bdac] px-4 sm:px-6">
          <div className="flex items-center gap-3">
            <div className="grid size-9 place-items-center rounded-md bg-primary text-primary-foreground"><Shapes className="size-5" /></div>
            <div>
              <h1 className="text-lg font-black uppercase leading-none tracking-[-0.02em]">Pattern Lab</h1>
              <p className="mt-1 font-mono text-[9px] uppercase tracking-[0.16em] text-muted-foreground">Image → generative marks</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <div className="hidden items-center gap-2 rounded-full border border-[#c8bcaa] bg-[#fffaf1] px-3 py-1.5 sm:flex">
              <span className={`size-1.5 rounded-full ${ready ? "bg-[#39a564]" : "bg-amber-500"}`} />
              <span className="font-mono text-[9px] font-semibold uppercase tracking-[0.12em]">{ready ? "Live renderer" : "Preparing"}</span>
            </div>
            <Button variant="outline" size="sm" className="border-[#c8bcaa] bg-[#fffaf1]" onClick={() => setShortcutsOpen((open) => !open)} aria-expanded={shortcutsOpen}>
              <Keyboard className="size-4" /><span className="hidden sm:inline">Shortcuts</span><kbd className="rounded border px-1 font-mono text-[9px]">?</kbd>
            </Button>
          </div>
          {shortcutsOpen && (
            <div className="absolute right-3 top-[calc(100%+8px)] z-30 w-[min(92vw,560px)] rounded-lg border border-[#aa9e8d] bg-[#fffaf1] p-4 shadow-[0_20px_50px_rgba(43,31,21,.25)] sm:right-6">
              <div className="mb-3 flex items-center justify-between">
                <p className="text-[11px] font-black uppercase tracking-[.18em]">Keyboard controls</p>
                <button className="rounded p-1 hover:bg-secondary" onClick={() => setShortcutsOpen(false)} aria-label="Close shortcuts"><X className="size-4" /></button>
              </div>
              <div className="grid grid-cols-2 gap-x-5 gap-y-2 sm:grid-cols-3">
                {SHORTCUTS.map(([keys, action]) => <div key={keys} className="flex items-center gap-2 border-t border-[#ddd2c2] pt-2"><kbd className="min-w-12 font-mono text-[9px] font-bold text-primary">{keys}</kbd><span className="text-[9px] uppercase tracking-[.08em] text-muted-foreground">{action}</span></div>)}
              </div>
            </div>
          )}
        </header>

        <div className="grid lg:grid-cols-[330px_minmax(0,1fr)]">
          <aside className="border-b border-[#c9bdac] bg-[#f4efe4] lg:border-b-0 lg:border-r">
            <div className="space-y-6 p-4 sm:p-5">
              <div className={`relative rounded-lg border border-dashed p-4 transition-colors ${dragging ? "border-primary bg-[#f7dce1]" : "border-[#a99d8c] bg-[#fffaf1]"}`} onDragEnter={(e) => { e.preventDefault(); setDragging(true); }} onDragOver={(e) => e.preventDefault()} onDragLeave={() => setDragging(false)} onDrop={(e) => { e.preventDefault(); setDragging(false); loadFile(e.dataTransfer.files[0]); }}>
                <input ref={inputRef} aria-label="Upload an image" className="absolute inset-0 z-10 cursor-pointer opacity-0" type="file" accept="image/*" onChange={(e) => loadFile(e.target.files?.[0])} />
                <div className="flex items-center gap-3">
                  <div className="grid size-10 shrink-0 place-items-center rounded-md border border-[#cabfaf] bg-white text-primary"><ImagePlus className="size-5" /></div>
                  <div className="min-w-0"><p className="text-xs font-black uppercase tracking-[0.08em]">Upload image</p><p className="mt-1 truncate text-[10px] text-muted-foreground">{fileName}</p></div>
                  <Upload className="ml-auto size-4 text-muted-foreground" />
                </div>
              </div>

              <section className="space-y-5" aria-labelledby="pattern-heading">
                <div className="flex items-center justify-between border-b border-[#d4cabb] pb-2"><h2 id="pattern-heading" className="text-[11px] font-black uppercase tracking-[0.18em]">Pattern</h2><Sparkles className="size-3.5 text-primary" /></div>
                <ControlRow label="Mark type">
                  <NativeSelect className="w-full bg-[#fffaf1]" value={settings.mark} onChange={(e) => set("mark", e.target.value as MarkType)}>
                    <NativeSelectOption value="line">1 — Lines / Stitches</NativeSelectOption><NativeSelectOption value="circle">2 — Round dots</NativeSelectOption><NativeSelectOption value="square">3 — Square pixels</NativeSelectOption><NativeSelectOption value="cross">4 — Crosses</NativeSelectOption><NativeSelectOption value="diamond">5 — Diamonds</NativeSelectOption><NativeSelectOption value="arc">6 — Half arcs</NativeSelectOption>
                  </NativeSelect>
                </ControlRow>
                <ControlRow label="Direction" value={settings.direction}>
                  <NativeSelect className="w-full bg-[#fffaf1]" value={settings.direction} onChange={(e) => set("direction", e.target.value as DirectionType)}>
                    <NativeSelectOption value="flow">Follow image contours</NativeSelectOption><NativeSelectOption value="uniform">Uniform</NativeSelectOption><NativeSelectOption value="radial">Radial</NativeSelectOption><NativeSelectOption value="random">Seeded random</NativeSelectOption>
                  </NativeSelect>
                </ControlRow>
                <ControlRow label="Grid size" value={`${settings.cell}px  [ ]`}><Slider min={6} max={30} step={1} value={[settings.cell]} onValueChange={([v]) => set("cell", v)} /></ControlRow>
                <ControlRow label="Shape scale" value={`${settings.scale}%  − +`}><Slider min={35} max={150} step={1} value={[settings.scale]} onValueChange={([v]) => set("scale", v)} /></ControlRow>
                <ControlRow label="Rotation" value={`${settings.rotation}°  R`}><Slider min={-180} max={180} step={1} value={[settings.rotation]} onValueChange={([v]) => set("rotation", v)} /></ControlRow>
              </section>

              <section className="space-y-5" aria-labelledby="tone-heading">
                <div className="flex items-center justify-between border-b border-[#d4cabb] pb-2"><h2 id="tone-heading" className="text-[11px] font-black uppercase tracking-[0.18em]">Tone & colour</h2><span className="font-mono text-[9px] text-muted-foreground">02</span></div>
                <ControlRow label="Contrast" value={`${settings.contrast}%  K`}><Slider min={50} max={220} step={1} value={[settings.contrast]} onValueChange={([v]) => set("contrast", v)} /></ControlRow>
                <ControlRow label="Blank threshold" value={`${settings.threshold}%  T`}><Slider min={0} max={65} step={1} value={[settings.threshold]} onValueChange={([v]) => set("threshold", v)} /></ControlRow>
                <div className="grid grid-cols-2 gap-3">
                  <label className="rounded-md border border-[#cfc4b3] bg-[#fffaf1] p-2"><span className="mb-2 block text-[9px] font-bold uppercase tracking-[0.14em] text-muted-foreground">Ink</span><span className="flex items-center gap-2 font-mono text-[10px] uppercase"><input className="size-7 cursor-pointer rounded border-0 bg-transparent" type="color" value={settings.ink} onChange={(e) => set("ink", e.target.value)} />{settings.ink}</span></label>
                  <label className="rounded-md border border-[#cfc4b3] bg-[#fffaf1] p-2"><span className="mb-2 block text-[9px] font-bold uppercase tracking-[0.14em] text-muted-foreground">Paper</span><span className="flex items-center gap-2 font-mono text-[10px] uppercase"><input className="size-7 cursor-pointer rounded border-0 bg-transparent" type="color" value={settings.paper} onChange={(e) => set("paper", e.target.value)} />{settings.paper}</span></label>
                </div>
                <button className="flex w-full items-center justify-between rounded-md border border-[#cfc4b3] bg-[#fffaf1] px-3 py-2.5 text-left transition hover:border-primary" type="button" onClick={() => set("invert", !settings.invert)} aria-pressed={settings.invert}>
                  <span className="text-[10px] font-bold uppercase tracking-[0.13em]">Invert image values <kbd className="ml-1 text-primary">I</kbd></span>
                  <span className={`grid size-5 place-items-center rounded-sm border ${settings.invert ? "border-primary bg-primary text-white" : "border-[#b8ac9b] bg-white"}`}>{settings.invert && <Check className="size-3" />}</span>
                </button>
              </section>
            </div>
          </aside>

          <section className="min-w-0 bg-[#ded6ca] p-3 sm:p-6 lg:p-8">
            <div className="mx-auto flex h-full max-w-[1040px] flex-col">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
                <div><p className="font-mono text-[9px] font-semibold uppercase tracking-[0.16em] text-[#6d655b]">Canvas / 1:1 square</p><p className="mt-1 text-xs font-bold">Live p5.js render</p></div>
                <div className="flex flex-wrap gap-2">
                  <Button variant="outline" size="sm" className="border-[#b9ad9c] bg-[#eee7dc]" onClick={reset}><RefreshCcw className="size-3.5" /> Reset <kbd className="text-[9px]">X</kbd></Button>
                  <Button variant="outline" size="sm" className="border-[#b9ad9c] bg-[#eee7dc]" onClick={downloadSvg}><ArrowDownToLine className="size-3.5" /> SVG <kbd className="text-[9px]">V</kbd></Button>
                  <Button size="sm" onClick={downloadJpeg}><ArrowDownToLine className="size-3.5" /> Save JPEG <kbd className="text-[9px]">S</kbd></Button>
                </div>
              </div>
              <div className="animate-enter mx-auto w-full max-w-[760px]">
                <div className="relative overflow-hidden border border-[#a99e8f] bg-white p-2 shadow-[0_20px_50px_rgba(47,35,25,0.2)] sm:p-3">
                  {!ready && <div className="absolute inset-3 z-10 grid place-items-center bg-[#fffaf0]"><div className="text-center"><div className="mx-auto mb-3 size-5 animate-spin rounded-full border-2 border-[#d9c9bc] border-t-primary" /><p className="font-mono text-[9px] uppercase tracking-[0.18em]">Preparing marks</p></div></div>}
                  <div ref={mountRef} className="studio-canvas aspect-square w-full overflow-hidden bg-[#fffaf0]" aria-label="Generated square pattern artwork preview" />
                </div>
                <div className="mt-3 flex items-start justify-between gap-4 px-1 font-mono text-[8px] uppercase tracking-[0.12em] text-[#71695f]"><span className="max-w-[60%] truncate">{fileName}</span><span>{settings.mark} · {settings.cell}px · {settings.direction}</span></div>
              </div>
            </div>
          </section>
        </div>
      </div>
      <p className="mx-auto mt-3 max-w-[1540px] px-1 font-mono text-[8px] uppercase tracking-[0.14em] text-[#776f64]">Pattern Lab / Square graphic-design instrument / Built with p5.js</p>
    </main>
  );
}
