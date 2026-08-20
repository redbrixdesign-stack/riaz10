interface DeviceFrameProps {
  src: string;
  alt: string;
  caption?: string;
  className?: string;
  /** Make this the primary, larger phone. */
  primary?: boolean;
}

/**
 * CSS phone frame for the real Beelo screenshots. No stock imagery —
 * the "screens" are actual app captures (src/assets/shots).
 * Swap the files in src/assets/shots/ to update the mockups.
 */
export function DeviceFrame({ src, alt, caption, className = '', primary = false }: DeviceFrameProps) {
  const base = primary ? 'w-[264px] sm:w-[300px]' : 'w-[196px] sm:w-[232px]';
  return (
    <figure className={`flex flex-col items-center gap-3 ${className}`}>
      <div
        className={`${base} rounded-[2.4rem] border border-black/15 bg-ink p-2 shadow-lift`}
        role="img"
        aria-label={alt}
      >
        {/* Notch / dynamic island */}
        <div className="relative mx-auto mb-2 h-[18px] w-24 rounded-full bg-black">
          <div className="absolute left-1/2 top-1/2 h-[8px] w-[52px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-ink" />
        </div>
        <div className="overflow-hidden rounded-[1.9rem]">
          <img src={src} alt={alt} loading="lazy" className="block w-full" />
        </div>
        {/* Home indicator */}
        <div className="mx-auto mt-2 h-[4px] w-28 rounded-full bg-white/30" />
      </div>
      {caption && <figcaption className="max-w-[16rem] text-center text-xs leading-relaxed text-ink/60">{caption}</figcaption>}
    </figure>
  );
}
