"use client";

// ═══════════════════════════════════════════════════════════════════
// VoiceMessageBubble — WhatsApp-style voice note player
// ═══════════════════════════════════════════════════════════════════
// Features:
//   • Authenticated streaming via /api/media/[id]/stream (Range Requests)
//   • Real waveform extracted via Web Audio API (cached per message)
//   • Play / Pause / Seek (click waveform) / Replay
//   • Playback speed: 1× → 1.5× → 2× → 0.5× → 1×
//   • Duration display (from <audio> metadata, instantly after load)
//   • Download button
//   • Loading, Error, and Safari-unsupported states
//   • Keyboard accessible (Space = play/pause, ←/→ = seek ±5s)
//   • Dark mode aware
//   • Memory-safe: pauses and releases Audio on unmount
// ═══════════════════════════════════════════════════════════════════

import { useState, useRef, useEffect, useCallback, useId } from "react";
import {
  Play, Pause, Download, Loader2, AlertCircle, RefreshCw,
} from "lucide-react";
import { cn } from "@/lib/utils";

// ── Constants ────────────────────────────────────────────────────────────────

const BARS = 40;
const SPEED_CYCLE = [1, 1.5, 2, 0.5] as const;

// Module-level waveform cache: persists across re-mounts, cleared on page reload
const waveformCache = new Map<string, number[]>();

// ── Waveform helpers ─────────────────────────────────────────────────────────

/** Deterministic placeholder based on messageId — looks like a real voice note shape */
function placeholderWaveform(seed: string): number[] {
  let h = 5381;
  for (let i = 0; i < seed.length; i++) {
    h = ((h << 5) + h) ^ seed.charCodeAt(i);
    h = h & 0xffffffff;
  }
  return Array.from({ length: BARS }, (_, i) => {
    h = (Math.imul(h, 1664525) + 1013904223) | 0;
    const raw = (h >>> 0) / 0xffffffff;
    // Sine envelope gives voice-note-like shape (quieter at edges)
    const env = Math.sin((i / (BARS - 1)) * Math.PI);
    return 0.08 + raw * 0.7 * env + 0.05;
  });
}

/** Extract real amplitude waveform from audio binary via Web Audio API */
async function extractWaveform(url: string, signal?: AbortSignal): Promise<number[]> {
  const resp = await fetch(url, { signal });
  if (!resp.ok) throw new Error(`fetch ${resp.status}`);
  const buf = await resp.arrayBuffer();
  if (signal?.aborted) throw new DOMException("aborted", "AbortError");

  const AudioCtxCtor =
    window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
  const ctx = new AudioCtxCtor();

  let audioBuf: AudioBuffer;
  try {
    audioBuf = await ctx.decodeAudioData(buf);
  } finally {
    ctx.close();
  }

  const data = audioBuf.getChannelData(0);
  const blockSize = Math.floor(data.length / BARS);
  const raw: number[] = [];

  for (let i = 0; i < BARS; i++) {
    let sumSq = 0;
    const base = i * blockSize;
    for (let j = 0; j < blockSize; j++) {
      sumSq += data[base + j] ** 2;
    }
    raw.push(Math.sqrt(sumSq / blockSize)); // RMS
  }

  const max = Math.max(...raw, 0.001);
  return raw.map((v) => v / max);
}

// ── Time formatter ───────────────────────────────────────────────────────────

function fmt(secs: number): string {
  if (!isFinite(secs) || secs < 0) return "0:00";
  const m = Math.floor(secs / 60);
  const s = Math.floor(secs % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

// ── Safari OGG detection ─────────────────────────────────────────────────────

function isSafariOggUnsupported(mimeType: string): boolean {
  if (typeof window === "undefined") return false;
  const ua = navigator.userAgent;
  const isSafari = /^((?!chrome|android|crios|fxios).)*safari/i.test(ua);
  return isSafari && /audio\/ogg/i.test(mimeType);
}

// ── Props ────────────────────────────────────────────────────────────────────

export interface VoiceMessageBubbleProps {
  /** Database message ID — used to call /api/media/[id]/stream */
  messageId: string;
  /** MIME type stored in messages.mime_type */
  mimeType?: string | null;
  /** Original file name stored in messages.file_name */
  fileName?: string | null;
  /** Pre-stored duration from messages.duration_secs (may be null) */
  durationSecs?: number | null;
  /** True when the message is an outgoing (agent-sent) message */
  isOutbound: boolean;
  /** True while an optimistic bubble is pending server confirmation */
  isOptimistic?: boolean;
}

// ── Component ────────────────────────────────────────────────────────────────

export default function VoiceMessageBubble({
  messageId,
  mimeType = "audio/ogg",
  fileName,
  durationSecs,
  isOutbound,
  isOptimistic = false,
}: VoiceMessageBubbleProps) {
  const uid = useId();
  const streamUrl = `/api/media/${messageId}/stream`;
  const mime = mimeType || "audio/ogg";
  const safariBlocked = isSafariOggUnsupported(mime);

  // ── State ──────────────────────────────────────────────────────────────────
  type Phase = "idle" | "loading" | "ready" | "error";
  const [phase, setPhase] = useState<Phase>("idle");
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(durationSecs ?? 0);
  const [progress, setProgress] = useState(0); // 0–100
  const [speedIdx, setSpeedIdx] = useState(0);
  const [waveform, setWaveform] = useState<number[]>(() =>
    placeholderWaveform(messageId)
  );
  const [waveformReal, setWaveformReal] = useState(false);

  const speed = SPEED_CYCLE[speedIdx];

  // ── Refs ───────────────────────────────────────────────────────────────────
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const wavebarRef = useRef<HTMLDivElement>(null);

  // ── Audio setup ────────────────────────────────────────────────────────────

  const buildAudio = useCallback((): HTMLAudioElement => {
    if (audioRef.current) return audioRef.current;

    const audio = new Audio(streamUrl);
    audio.preload = "metadata";

    const onMeta = () => {
      if (isFinite(audio.duration)) setDuration(audio.duration);
      setPhase("ready");
    };
    const onTime = () => {
      setCurrentTime(audio.currentTime);
      if (audio.duration > 0)
        setProgress((audio.currentTime / audio.duration) * 100);
    };
    const onEnded = () => {
      setIsPlaying(false);
      setCurrentTime(0);
      setProgress(0);
      audio.currentTime = 0;
    };
    const onError = () => {
      setPhase("error");
      setIsPlaying(false);
    };
    const onWaiting = () => setPhase("loading");
    const onCanPlay = () => setPhase((p) => (p === "error" ? p : "ready"));

    audio.addEventListener("loadedmetadata", onMeta);
    audio.addEventListener("timeupdate", onTime);
    audio.addEventListener("ended", onEnded);
    audio.addEventListener("error", onError);
    audio.addEventListener("waiting", onWaiting);
    audio.addEventListener("canplay", onCanPlay);

    audioRef.current = audio;
    return audio;
  }, [streamUrl]);

  // ── Mount: preload metadata + generate real waveform ──────────────────────
  useEffect(() => {
    if (isOptimistic || safariBlocked) return;

    setPhase("loading");
    const audio = buildAudio();
    audio.load(); // triggers metadata fetch for duration display

    // Waveform — use cache if available
    if (waveformCache.has(messageId)) {
      setWaveform(waveformCache.get(messageId)!);
      setWaveformReal(true);
    } else {
      const ab = new AbortController();
      abortRef.current = ab;

      extractWaveform(streamUrl, ab.signal)
        .then((w) => {
          waveformCache.set(messageId, w);
          setWaveform(w);
          setWaveformReal(true);
        })
        .catch((err) => {
          if (err?.name !== "AbortError") {
            // Keep placeholder on failure (codec unsupported in Web Audio API)
            setWaveformReal(true);
          }
        });
    }

    return () => {
      abortRef.current?.abort();
      abortRef.current = null;
      const a = audioRef.current;
      if (a) {
        a.pause();
        // Remove src to release the network connection and memory
        a.src = "";
        a.load();
        audioRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messageId, isOptimistic, safariBlocked]);

  // ── Playback controls ──────────────────────────────────────────────────────

  const toggle = useCallback(() => {
    if (phase === "error" || isOptimistic || safariBlocked) return;
    const audio = buildAudio();
    if (isPlaying) {
      audio.pause();
      setIsPlaying(false);
    } else {
      audio.playbackRate = speed;
      setPhase("loading");
      audio
        .play()
        .then(() => {
          setIsPlaying(true);
          setPhase("ready");
        })
        .catch(() => setPhase("error"));
    }
  }, [phase, isPlaying, speed, isOptimistic, safariBlocked, buildAudio]);

  const seekToRatio = useCallback(
    (ratio: number) => {
      const audio = audioRef.current;
      if (!audio || !duration) return;
      const t = Math.max(0, Math.min(1, ratio)) * duration;
      audio.currentTime = t;
      setCurrentTime(t);
      setProgress((t / duration) * 100);
    },
    [duration]
  );

  const handleWaveformClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      const rect = wavebarRef.current?.getBoundingClientRect();
      if (!rect) return;
      seekToRatio((e.clientX - rect.left) / rect.width);
    },
    [seekToRatio]
  );

  const handleWaveformKey = useCallback(
    (e: React.KeyboardEvent<HTMLDivElement>) => {
      if (!duration) return;
      if (e.key === "ArrowRight") seekToRatio((currentTime + 5) / duration);
      if (e.key === "ArrowLeft") seekToRatio((currentTime - 5) / duration);
      if (e.key === " ") { e.preventDefault(); toggle(); }
    },
    [currentTime, duration, toggle, seekToRatio]
  );

  const cycleSpeed = useCallback(() => {
    const nextIdx = (speedIdx + 1) % SPEED_CYCLE.length;
    setSpeedIdx(nextIdx);
    if (audioRef.current) audioRef.current.playbackRate = SPEED_CYCLE[nextIdx];
  }, [speedIdx]);

  // ── Colors (WhatsApp-authentic) ───────────────────────────────────────────
  // Outbound (green bubble): bars are white / white-dim
  // Inbound (white/gray bubble): bars are WhatsApp dark-green / light-green-dim
  const barPlayed = isOutbound
    ? "bg-white"
    : "bg-[#00a884] dark:bg-[#00cf9d]";
  const barUnplayed = isOutbound
    ? "bg-white/35"
    : "bg-[#00a884]/30 dark:bg-[#00cf9d]/30";
  const textColor = isOutbound
    ? "text-white/75"
    : "text-[#667781] dark:text-[#8696A0]";
  const btnColor = isOutbound
    ? "bg-white/20 hover:bg-white/30 text-white"
    : "bg-black/[0.07] hover:bg-black/[0.13] dark:bg-white/[0.1] dark:hover:bg-white/[0.18] text-[#54656F] dark:text-[#aebac1]";

  const playedBars = Math.round((progress / 100) * BARS);

  // ── Safari/OGG: unsupported format fallback ────────────────────────────────
  if (safariBlocked) {
    return (
      <div className="flex items-start gap-2.5 px-1 py-1.5 w-[230px]">
        <AlertCircle
          className={cn("w-4 h-4 flex-shrink-0 mt-0.5", isOutbound ? "text-white/60" : "text-amber-500")}
        />
        <div className={cn("text-[11px] leading-snug", textColor)}>
          <p className="font-semibold mb-0.5">
            {isOutbound ? "Format unsupported" : "Can't play in Safari"}
          </p>
          <p className="mb-1">
            WhatsApp voice notes use OGG/Opus — not supported in Safari.
          </p>
          <a
            href={streamUrl}
            download={fileName || "voice-note.ogg"}
            className={cn(
              "inline-flex items-center gap-1 underline font-medium",
              isOutbound ? "text-white/90" : "text-[#00a884] dark:text-[#00cf9d]"
            )}
          >
            <Download className="w-3 h-3" /> Download to play
          </a>
        </div>
      </div>
    );
  }

  // ── Main player ───────────────────────────────────────────────────────────
  const displayTime =
    isPlaying || currentTime > 0 ? currentTime : duration;

  return (
    <div
      className={cn(
        "flex items-center gap-2.5 px-1 py-1 w-[230px]",
        isOptimistic && "opacity-60"
      )}
    >
      {/* ── Play / Pause button ── */}
      <button
        onClick={toggle}
        disabled={phase === "error" || isOptimistic}
        aria-label={isPlaying ? "Pause voice message" : "Play voice message"}
        aria-describedby={`${uid}-time`}
        className={cn(
          "w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0",
          "transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#00a884]/60",
          "disabled:cursor-not-allowed disabled:opacity-50",
          btnColor
        )}
      >
        {phase === "loading" && !isPlaying ? (
          <Loader2 className="w-4 h-4 animate-spin" />
        ) : phase === "error" ? (
          <AlertCircle className="w-4 h-4 text-red-400" />
        ) : isPlaying ? (
          <Pause className="w-4 h-4" />
        ) : (
          <Play className="w-4 h-4 ml-0.5" />
        )}
      </button>

      {/* ── Waveform + meta column ── */}
      <div className="flex-1 flex flex-col gap-[3px] min-w-0">
        {/* Waveform bars */}
        <div
          ref={wavebarRef}
          role="slider"
          tabIndex={isOptimistic || safariBlocked ? -1 : 0}
          aria-label="Voice message playback position"
          aria-valuenow={Math.round(progress)}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuetext={`${fmt(currentTime)} of ${fmt(duration)}`}
          onClick={handleWaveformClick}
          onKeyDown={handleWaveformKey}
          className={cn(
            "flex items-end gap-[2px] h-8 cursor-pointer",
            "outline-none focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[#00a884]/50 rounded-sm",
            phase === "idle" && "opacity-50",
            !waveformReal && "animate-pulse"
          )}
        >
          {waveform.map((amp, i) => {
            const played = i < playedBars;
            // Clamp bar height: 3px min, 26px max for compact bubbles
            const h = Math.round(Math.max(3, amp * 24));
            return (
              <div
                key={i}
                aria-hidden="true"
                className={cn(
                  "flex-1 rounded-full transition-colors duration-150",
                  played ? barPlayed : barUnplayed
                )}
                style={{ height: `${h}px` }}
              />
            );
          })}
        </div>

        {/* Duration / speed row */}
        <div
          className={cn(
            "flex items-center justify-between",
            textColor
          )}
        >
          <span
            id={`${uid}-time`}
            className="text-[10.5px] tabular-nums"
            aria-live="off"
          >
            {fmt(displayTime)}
          </span>

          <button
            onClick={cycleSpeed}
            aria-label={`Playback speed ${speed}×, click to change`}
            className={cn(
              "text-[10px] font-bold px-1 py-px rounded transition-opacity hover:opacity-70",
              "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[#00a884]/50",
              textColor
            )}
          >
            {speed}×
          </button>
        </div>
      </div>

      {/* ── Download button ── */}
      <a
        href={streamUrl}
        download={fileName || "voice-note.ogg"}
        aria-label="Download voice message"
        onClick={(e) => e.stopPropagation()}
        className={cn(
          "w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0",
          "transition-opacity hover:opacity-60",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#00a884]/50",
          textColor
        )}
      >
        <Download className="w-3.5 h-3.5" />
      </a>

      {/* ── Error retry ── */}
      {phase === "error" && (
        <button
          onClick={() => {
            audioRef.current = null;
            setPhase("idle");
            setTimeout(() => {
              setPhase("loading");
              buildAudio().load();
            }, 50);
          }}
          aria-label="Retry loading voice message"
          className={cn(
            "w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0",
            "transition-opacity hover:opacity-70",
            textColor
          )}
        >
          <RefreshCw className="w-3.5 h-3.5" />
        </button>
      )}
    </div>
  );
}
