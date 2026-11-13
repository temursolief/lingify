"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { ArrowsOut, ClockClockwise, ClockCounterClockwise, Pause, Play } from "./icons";

export type VideoEvent = "seek" | "pause" | "rate";

const PLAYER_ORIGIN = "https://www.youtube-nocookie.com";

/** Player states from YouTube's IFrame API. */
const PLAYING = 1;
const PAUSED = 2;

const clock = (s: number) => {
  const t = Math.max(0, Math.floor(s));
  return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, "0")}`;
};

/**
 * A YouTube video for a Listening lesson that costs one small thumbnail until the student presses play. The full
 * player loads only then, from youtube-nocookie.com so YouTube sets no cookies before playback.
 *
 * Subtitles are never available: this is a listening test. YouTube's own controls (with their CC button) are hidden
 * and its keyboard shortcuts ("c" turns captions on) are off; a transparent shield over the video takes every click,
 * and Lingify draws its own play, rewind, seek and fullscreen controls, which drive the player through YouTube's
 * postMessage channel. On every state change the player is also told to unload its captions module, in case a
 * caption track was switched on some other way.
 *
 * With `onEvent`, pauses, seeks and speed changes are reported (for a Listening test's telemetry). `allowFullscreen`
 * is off during a locked test: the video's own fullscreen would take the page out of the test's.
 */
export function LiteVideo({ id, title, onEvent, allowFullscreen = true }: { id: string; title: string; onEvent?: (e: VideoEvent) => void; allowFullscreen?: boolean }) {
  const [playing, setPlaying] = useState(false);
  const [state, setState] = useState(-1);
  const [time, setTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const frame = useRef<HTMLIFrameElement>(null);
  const box = useRef<HTMLDivElement>(null);
  const report = useRef(onEvent);
  useEffect(() => {
    report.current = onEvent;
  });

  // Cache Components keeps recently-left pages mounted but hidden (React <Activity>), so without this the
  // iframe would keep playing audio after navigating away. The cleanup fires when the page is hidden.
  useLayoutEffect(() => {
    return () => setPlaying(false);
  }, []);

  const command = (func: string, args: unknown[] = []) =>
    frame.current?.contentWindow?.postMessage(JSON.stringify({ event: "command", func, args, id: 1, channel: "widget" }), PLAYER_ORIGIN);
  const noCaptions = () => {
    command("unloadModule", ["captions"]);
    command("unloadModule", ["cc"]);
  };

  useEffect(() => {
    if (!playing) return;
    let last: { time: number; at: number; rate: number; state: number } | null = null;
    const onMessage = (e: MessageEvent) => {
      if (e.origin !== PLAYER_ORIGIN || e.source !== frame.current?.contentWindow || typeof e.data !== "string") return;
      let data: { event?: string; info?: { playerState?: number; currentTime?: number; duration?: number; playbackRate?: number } | number };
      try {
        data = JSON.parse(e.data);
      } catch {
        return;
      }
      if (data.event === "onReady" || data.event === "onStateChange") noCaptions();
      const info = data.event === "infoDelivery" && typeof data.info === "object" ? data.info : undefined;
      if (!info) return;
      if (info.playerState !== undefined) {
        setState(info.playerState);
        noCaptions();
      }
      if (info.currentTime !== undefined) setTime(info.currentTime);
      if (info.duration) setDuration(info.duration);
      const now = Date.now();
      const prev = last ?? { time: info.currentTime ?? 0, at: now, rate: info.playbackRate ?? 1, state: info.playerState ?? -1 };
      if (info.playerState === PAUSED && prev.state !== PAUSED) report.current?.("pause");
      if (info.playbackRate !== undefined && info.playbackRate !== prev.rate) report.current?.("rate");
      if (info.currentTime !== undefined && last) {
        // Where the video should be if it had simply played on; a jump of more than 3 s is a seek.
        const expected = prev.state === PLAYING ? prev.time + ((now - prev.at) / 1000) * prev.rate : prev.time;
        if (Math.abs(info.currentTime - expected) > 3) report.current?.("seek");
      }
      last = {
        time: info.currentTime ?? prev.time,
        at: info.currentTime !== undefined ? now : prev.at,
        rate: info.playbackRate ?? prev.rate,
        state: info.playerState ?? prev.state,
      };
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- command/noCaptions only read the frame ref
  }, [playing]);

  const onLoad = () => {
    // Asks the player to send its state ("infoDelivery") as it changes, and to report ready / state changes.
    frame.current?.contentWindow?.postMessage(JSON.stringify({ event: "listening", id: 1, channel: "widget" }), PLAYER_ORIGIN);
    noCaptions();
  };

  const toggle = () => (state === PLAYING ? command("pauseVideo") : command("playVideo"));
  const seek = (to: number) => {
    const t = Math.max(0, duration ? Math.min(duration - 0.5, to) : to);
    setTime(t);
    command("seekTo", [t, true]);
  };
  const fullscreen = () => {
    if (document.fullscreenElement) void document.exitFullscreen();
    else void box.current?.requestFullscreen?.();
  };

  const control = "flex h-9 w-9 shrink-0 items-center justify-center rounded-md text-ink hover:bg-hover disabled:opacity-45";

  return (
    <div ref={box} className="flex flex-col overflow-hidden rounded-xl bg-black">
      <div className="relative aspect-video w-full">
        {playing ? (
          <>
            <iframe
              ref={frame}
              onLoad={onLoad}
              tabIndex={-1}
              className="pointer-events-none absolute inset-0 h-full w-full"
              src={`${PLAYER_ORIGIN}/embed/${id}?autoplay=1&controls=0&disablekb=1&cc_load_policy=0&iv_load_policy=3&rel=0&modestbranding=1&playsinline=1&fs=0&enablejsapi=1`}
              title={title}
              allow="autoplay; encrypted-media"
            />
            {/* The shield: no click, right-click or key ever reaches YouTube's own player. */}
            <button type="button" onClick={toggle} onContextMenu={(e) => e.preventDefault()} aria-label={state === PLAYING ? "Pause" : "Play"} className="absolute inset-0 h-full w-full cursor-pointer" />
          </>
        ) : (
          <button type="button" onClick={() => setPlaying(true)} className="group absolute inset-0 h-full w-full" aria-label={`Play video: ${title}`}>
            {/* eslint-disable-next-line @next/next/no-img-element -- a plain thumbnail is lighter than the image optimizer for one external picture */}
            <img src={`https://i.ytimg.com/vi/${id}/hqdefault.jpg`} alt="" loading="lazy" className="h-full w-full object-cover opacity-90 transition-opacity group-hover:opacity-100" />
            <span className="absolute top-1/2 left-1/2 flex h-16 w-16 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-accent text-page shadow-lg transition-transform group-hover:scale-105">
              <svg viewBox="0 0 24 24" width="28" height="28" aria-hidden>
                <path fill="currentColor" d="M8 5v14l11-7z" />
              </svg>
            </span>
          </button>
        )}
      </div>
      {playing && (
        <div className="flex items-center gap-1 bg-surface px-2 py-1.5">
          <button type="button" className={control} onClick={toggle} aria-label={state === PLAYING ? "Pause" : "Play"}>
            {state === PLAYING ? <Pause size={18} weight="fill" aria-hidden /> : <Play size={18} weight="fill" aria-hidden />}
          </button>
          <button type="button" className={control} onClick={() => seek(time - 5)} aria-label="Back 5 seconds" title="Back 5 seconds">
            <ClockCounterClockwise size={18} aria-hidden />
          </button>
          <button type="button" className={control} onClick={() => seek(time + 5)} aria-label="Forward 5 seconds" title="Forward 5 seconds">
            <ClockClockwise size={18} aria-hidden />
          </button>
          <input
            type="range"
            min={0}
            max={Math.max(1, Math.floor(duration))}
            step={1}
            value={Math.floor(time)}
            onChange={(e) => seek(Number(e.target.value))}
            aria-label="Position in the video"
            className="mx-2 min-w-0 flex-1 accent-[var(--accent)]"
          />
          <span className="shrink-0 text-xs text-muted tabular-nums">
            {clock(time)} / {clock(duration)}
          </span>
          {allowFullscreen && (
            <button type="button" className={control} onClick={fullscreen} aria-label="Full screen" title="Full screen">
              <ArrowsOut size={18} aria-hidden />
            </button>
          )}
        </div>
      )}
    </div>
  );
}
