import { useEffect, useRef, type ReactNode } from 'react';

interface RevealProps {
  children: ReactNode;
  className?: string;
  /** Small stagger delay in ms for grouped reveals. */
  delay?: number;
  as?: 'div' | 'section' | 'li';
}

/**
 * Lightweight reveal-on-scroll. Respects prefers-reduced-motion via CSS
 * (the .reveal class is forced visible there). Falls back to visible
 * content if IntersectionObserver is unavailable.
 */
export function Reveal({ children, className = '', delay = 0, as = 'div' }: RevealProps) {
  const ref = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.classList.add('reveal-ready');
    if (typeof IntersectionObserver === 'undefined') {
              el.classList.add('is-visible');
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            el.classList.add('is-visible');
            io.disconnect();
          }
        }
      },
      { threshold: 0.12, rootMargin: '0px 0px -8% 0px' }
    );
    io.observe(el);
    return () => {
      io.disconnect();
      el.classList.remove('reveal-ready');
    };
  }, []);

  const Tag = as as 'div';
  return (
    <Tag ref={ref} className={`reveal ${className}`} style={delay ? { transitionDelay: `${delay}ms` } : undefined}>
      {children}
    </Tag>
  );
}
