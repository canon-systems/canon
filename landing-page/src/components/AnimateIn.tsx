'use client';

import { useEffect, useRef, type ReactNode } from 'react';

interface AnimateInProps {
  children: ReactNode;
  /** Extra ms delay before the reveal fires */
  delay?: number;
  className?: string;
}

export function AnimateIn({ children, delay = 0, className = '' }: AnimateInProps) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting) return;
        const id = setTimeout(() => el.classList.add('is-visible'), delay);
        observer.disconnect();
        return () => clearTimeout(id);
      },
      { threshold: 0.08, rootMargin: '0px 0px -32px 0px' }
    );

    observer.observe(el);
    return () => observer.disconnect();
  }, [delay]);

  return (
    <div ref={ref} className={`reveal ${className}`}>
      {children}
    </div>
  );
}
