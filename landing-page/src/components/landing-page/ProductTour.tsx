'use client';

import { X } from 'lucide-react';
import Image from 'next/image';
import { useEffect, useId, useRef, useState } from 'react';

export interface EvidenceLayer {
  stage: string;
  title: string;
  description: string;
  image: string;
  alt: string;
  highlights: readonly string[];
}

interface ProductTourProps {
  eyebrow: string;
  title: string;
  description: string;
  layers: readonly EvidenceLayer[];
}

export function ProductTour({ eyebrow, title, description, layers }: ProductTourProps) {
  const [activeEvidenceIndex, setActiveEvidenceIndex] = useState(0);
  const [expandedImage, setExpandedImage] = useState<{ src: string; alt: string } | null>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  const panelId = useId();
  const activeLayer = layers[activeEvidenceIndex];

  useEffect(() => {
    let frame = 0;

    const updateActiveLayer = () => {
      const track = trackRef.current;
      if (!track) return;

      const rect = track.getBoundingClientRect();
      const viewportHeight = window.innerHeight;
      const scrollableDistance = Math.max(1, rect.height - viewportHeight);
      const rawProgress = (viewportHeight * 0.28 - rect.top) / scrollableDistance;
      const progress = Math.min(1, Math.max(0, rawProgress));
      const nextIndex = Math.round(progress * (layers.length - 1));

      setActiveEvidenceIndex((currentIndex) => (
        currentIndex === nextIndex ? currentIndex : nextIndex
      ));
    };

    const scheduleUpdate = () => {
      if (frame) return;

      frame = window.requestAnimationFrame(() => {
        frame = 0;
        updateActiveLayer();
      });
    };

    updateActiveLayer();
    window.addEventListener('scroll', scheduleUpdate, { passive: true });
    window.addEventListener('resize', scheduleUpdate);

    return () => {
      if (frame) {
        window.cancelAnimationFrame(frame);
      }
      window.removeEventListener('scroll', scheduleUpdate);
      window.removeEventListener('resize', scheduleUpdate);
    };
  }, [layers.length]);

  return (
    <>
      <div className="space-y-10">
        <div className="max-w-3xl space-y-4">
          <span
            className="inline-flex items-center rounded-[6px] border px-2.5 py-1 text-xs font-medium"
            style={{ borderColor: 'var(--border-tertiary)', backgroundColor: 'var(--bg-primary)', color: 'var(--text-secondary)' }}
          >
            {eyebrow}
          </span>
          <h2 className="type-landing-h2" style={{ color: 'var(--text-primary)' }}>{title}</h2>
          <p className="type-landing-body" style={{ color: 'var(--text-secondary)' }}>{description}</p>
        </div>

        <div ref={trackRef} className="relative lg:min-h-[300vh]">
          <div className="grid gap-8 lg:sticky lg:top-20 lg:grid-cols-[0.84fr_1.16fr] lg:items-start">
          <div className="space-y-4">
            {layers.map((layer, index) => {
              const isActive = activeEvidenceIndex === index;

              return (
                <article
                  key={layer.stage}
                  data-tour-index={index}
                  aria-controls={panelId}
                  className={`relative scroll-mt-28 overflow-hidden rounded-[10px] border p-5 transition-all duration-500 lg:p-6 ${
                    isActive ? 'lg:min-h-[20rem]' : 'lg:min-h-[5.75rem] lg:opacity-55'
                  }`}
                  style={isActive ? {
                    borderColor: 'var(--canon-purple-border)',
                    backgroundColor: 'var(--canon-purple-selected)',
                    boxShadow: '0 16px 44px rgba(0,0,0,0.28), 0 0 0 1px rgba(155,141,245,0.18)',
                  } : {
                    borderColor: 'var(--border-tertiary)',
                    backgroundColor: 'var(--bg-primary)',
                  }}
                  onMouseEnter={() => setActiveEvidenceIndex(index)}
                  onFocus={() => setActiveEvidenceIndex(index)}
                >
                  <div
                    className="absolute left-0 top-5 h-10 w-[3px] rounded-r-full transition-opacity duration-300"
                    style={{ backgroundColor: 'var(--canon-purple)', opacity: isActive ? 1 : 0 }}
                    aria-hidden
                  />
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <p
                        className="type-kicker"
                        style={{ color: isActive ? 'var(--canon-purple)' : undefined }}
                      >
                        {layer.stage}
                      </p>
                      <h3 className="mt-2 type-landing-h3" style={{ color: 'var(--text-primary)' }}>
                        {layer.title}
                      </h3>
                    </div>
                    <span
                      className="text-lg font-medium tabular-nums"
                      style={{ color: isActive ? 'var(--canon-purple)' : 'var(--text-tertiary)' }}
                    >
                      {String(index + 1).padStart(2, '0')}
                    </span>
                  </div>

                  <div
                    className={`grid transition-all duration-500 ${
                      isActive ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0 lg:mt-0'
                    }`}
                  >
                    <div className="overflow-hidden">
                      <p className="mt-4 type-landing-body" style={{ color: 'var(--text-secondary)' }}>
                        {layer.description}
                      </p>
                    </div>
                  </div>

                  <div
                    className={`overflow-hidden rounded-[8px] border transition-all duration-500 lg:hidden ${
                      isActive ? 'mt-5 max-h-[28rem] opacity-100' : 'mt-0 max-h-0 opacity-0'
                    }`}
                    style={{ borderColor: 'var(--border-secondary)', backgroundColor: 'var(--bg-tertiary)' }}
                  >
                    <Image
                      src={layer.image}
                      alt={layer.alt}
                      width={1920}
                      height={1440}
                      sizes="100vw"
                      className="h-auto w-full object-contain"
                    />
                  </div>

                  <div
                    className={`grid transition-all duration-500 ${
                      isActive ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0'
                    }`}
                  >
                    <div className="overflow-hidden">
                      <div className="mt-5 flex flex-wrap gap-2">
                        {layer.highlights.map((highlight) => (
                          <span
                            key={highlight}
                            className="rounded-[6px] border px-2.5 py-1 text-xs uppercase tracking-[0.15em]"
                            style={{ borderColor: 'var(--border-tertiary)', backgroundColor: 'var(--bg-secondary)', color: 'var(--text-tertiary)' }}
                          >
                            {highlight}
                          </span>
                        ))}
                      </div>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>

          <aside
            id={panelId}
            className="hidden rounded-[10px] border p-4 lg:block"
            style={{ borderColor: 'var(--border-tertiary)', backgroundColor: 'var(--bg-primary)' }}
          >
            <div
              className="group relative overflow-hidden rounded-[8px] border"
              style={{ borderColor: 'var(--border-secondary)', backgroundColor: 'var(--bg-tertiary)' }}
            >
              <button
                type="button"
                onClick={() => setExpandedImage({ src: activeLayer.image, alt: activeLayer.alt })}
                className="flex min-h-[26rem] w-full cursor-zoom-in items-center justify-center p-5"
                aria-label={`Expand image for ${activeLayer.title}`}
              >
                <Image
                  key={activeLayer.image}
                  src={activeLayer.image}
                  alt={activeLayer.alt}
                  width={1920}
                  height={1440}
                  sizes="(min-width: 1024px) 58vw, 100vw"
                  className="h-auto max-h-[64vh] w-auto max-w-full object-contain transition duration-500 group-hover:scale-[1.01]"
                  priority={activeEvidenceIndex === 0}
                />
                <span
                  className="pointer-events-none absolute bottom-3 right-3 rounded-[6px] border px-2.5 py-1 text-[11px] uppercase tracking-[0.2em]"
                  style={{ borderColor: 'var(--border-secondary)', backgroundColor: 'var(--bg-secondary)', color: 'var(--text-tertiary)' }}
                >
                  Expand
                </span>
              </button>
            </div>

            <div className="mt-4 flex items-center justify-between gap-4">
              <div>
                <p className="type-kicker" style={{ color: 'var(--canon-purple)' }}>{activeLayer.stage}</p>
                <p className="mt-1 text-sm font-medium" style={{ color: 'var(--text-primary)' }}>{activeLayer.title}</p>
              </div>
              <span className="text-sm tabular-nums" style={{ color: 'var(--text-tertiary)' }}>
                {String(activeEvidenceIndex + 1).padStart(2, '0')} / {String(layers.length).padStart(2, '0')}
              </span>
            </div>
          </aside>
          </div>
        </div>
      </div>

      {expandedImage && (
        <div
          className="fixed inset-0 z-[120] flex items-center justify-center p-4 sm:p-8"
          style={{ backgroundColor: 'rgba(0,0,0,0.88)' }}
          role="dialog"
          aria-modal="true"
          aria-label="Expanded product image"
          onClick={() => setExpandedImage(null)}
        >
          <div className="relative max-h-[92vh] w-full max-w-[1600px]" onClick={(e) => e.stopPropagation()}>
            <button
              type="button"
              onClick={() => setExpandedImage(null)}
              className="absolute right-2 top-2 z-10 inline-flex h-9 w-9 items-center justify-center rounded-[8px] border transition-colors"
              style={{ borderColor: 'var(--border-secondary)', backgroundColor: 'var(--bg-secondary)', color: 'var(--text-primary)' }}
              aria-label="Close expanded image"
            >
              <X className="h-4 w-4" />
            </button>
            <div
              className="overflow-hidden rounded-[10px] border"
              style={{ borderColor: 'var(--border-secondary)', backgroundColor: 'var(--bg-tertiary)' }}
            >
              <Image
                src={expandedImage.src}
                alt={expandedImage.alt}
                width={3442}
                height={1922}
                sizes="100vw"
                className="h-auto max-h-[90vh] w-full object-contain"
              />
            </div>
          </div>
        </div>
      )}
    </>
  );
}
