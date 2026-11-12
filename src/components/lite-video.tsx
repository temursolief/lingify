"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";

export type VideoEvent = "seek" | "pause" | "rate";

const PLAYER_ORIGIN = "https://www.youtube-nocookie.com";

/**
 * A YouTube video that costs one small thumbnail until the student presses play. The full player (about 1 MB of
 * scripts) loads only then, from youtube-nocookie.com so YouTube sets no cookies before playback.
 *
 * With `onEvent`, the player reports pauses, seeks and speed changes (for a Listening test's telemetry) through
 * YouTube's postMessage channel, without loading YouTube's IFrame API script. `allowFullscreen` is off during a
 * locked test: the video's own fullscreen would take the page out of the test's.
 */
export function LiteVideo({ id, title, onEvent, allowFullscreen = true }: { id: string; title: string; onEvent?: (e: VideoEvent) => void; allowFullscreen?: boolean }) {
  const [playing, setPlaying] = useState(false);
  const frame = useRef<HTMLIFrameElement>(null);
  const report = useRef(onEvent);
  useEffect(() => {
    report.current = onEvent;
  });

  // Cache Components keeps recently-left pages mounted but hidden (React <Activity>), so without this the
  // iframe would keep playing audio after navigating away. The cleanup fires when the page is hidden.
  useLayoutEffect(() => {
    return () => setPlaying(false);
  }, []);

  useEffect(() => {
    if (!playing) return;
    let last: { time: number; at: number; rate: number; state: number } | null = null;
    const onMessage = (e: MessageEvent) => {
      if (e.origin !== PLAYER_ORIGIN || e.source !== frame.current?.contentWindow || typeof e.data !== "string") return;
      let data: { event?: string; info?: { playerState?: number; currentTime?: number; playbackRate?: number } };
      try {
        data = JSON.parse(e.data);
      } catch {
        return;
      }
      const info = data.event === "infoDelivery" ? data.info : undefined;
      if (!info) return;
      const now = Date.now();
      const prev = last ?? { time: info.currentTime ?? 0, at: now, rate: info.playbackRate ?? 1, state: info.playerState ?? -1 };
      if (info.playerState === 2 && prev.state !== 2) report.current?.("pause");
      if (info.playbackRate !== undefined && info.playbackRate !== prev.rate) report.current?.("rate");
      if (info.currentTime !== undefined && last) {
        // Where the video should be if it had simply played on; a jump of more than 3 s is a seek.
        const expected = prev.state === 1 ? prev.time + ((now - prev.at) / 1000) * prev.rate : prev.time;
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
  }, [playing]);

  const listen = () => {
    // Asks the player to send its state ("infoDelivery") as it changes.
    if (onEvent) frame.current?.contentWindow?.postMessage(JSON.stringify({ event: "listening", id: 1, channel: "widget" }), PLAYER_ORIGIN);
  };

  return (
    <div className="relative aspect-video w-full overflow-hidden rounded-xl bg-black">
      {playing ? (
        <iframe
          ref={frame}
          onLoad={listen}
          className="absolute inset-0 h-full w-full"
          src={`${PLAYER_ORIGIN}/embed/${id}?autoplay=1&rel=0&modestbranding=1${onEvent ? "&enablejsapi=1" : ""}${allowFullscreen ? "" : "&fs=0"}`}
          title={title}
          allow={`autoplay; encrypted-media; picture-in-picture${allowFullscreen ? "; fullscreen" : ""}`}
          allowFullScreen={allowFullscreen}
        />
      ) : (
        <button type="button" onClick={() => setPlaying(true)} className="group absolute inset-0 h-full w-full" aria-label={`Play video: ${title}`}>
          {/* eslint-disable-next-line @next/next/no-img-element -- a plain thumbnail is lighter than the image optimizer for one external picture */}
          <img src={`https://i.ytimg.com/vi/${id}/hqdefault.jpg`} alt="" loading="lazy" className="h-full w-full object-cover opacity-90 transition-opacity group-hover:opacity-100" />
          <span className="absolute top-1/2 left-1/2 flex h-16 w-16 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-accent text-white shadow-lg transition-transform group-hover:scale-105">
            <svg viewBox="0 0 24 24" width="28" height="28" aria-hidden><path fill="currentColor" d="M8 5v14l11-7z" /></svg>
          </span>
        </button>
      )}
    </div>
  );
}
