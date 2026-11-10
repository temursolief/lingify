"use client";

import { useState } from "react";

/**
 * A YouTube video that costs one small thumbnail until the student presses play. The full player (about 1 MB of
 * scripts) loads only then, from youtube-nocookie.com so YouTube sets no cookies before playback.
 */
export function LiteVideo({ id, title }: { id: string; title: string }) {
  const [playing, setPlaying] = useState(false);
  return (
    <div className="relative aspect-video w-full overflow-hidden rounded-xl bg-black">
      {playing ? (
        <iframe
          className="absolute inset-0 h-full w-full"
          src={`https://www.youtube-nocookie.com/embed/${id}?autoplay=1&rel=0&modestbranding=1`}
          title={title}
          allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
          allowFullScreen
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
