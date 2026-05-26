'use client';

import { X } from 'lucide-react';
import Image from 'next/image';
import { useId, useState } from 'react';

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
  const [activeEvidenceIndex, setActiveEvidenceIndex] = useState(1);
  const [expandedImage, setExpandedImage] = useState<{ src: string; alt: string } | null>(null);
  const panelId = useId();
  const activeLayer = layers[activeEvidenceIndex];

  return (
    <>
      <div className="grid gap-8 lg:grid-cols-[0.68fr_1.32fr] lg:items-stretch">
        <div className="space-y-5 lg:sticky lg:top-24">
          <div className="space-y-4">
            <span
              className="inline-flex items-center rounded-[6px] border px-2.5 py-1 text-xs font-medium"
              style={{ borderColor: 'var(--border-tertiary)', backgroundColor: 'var(--bg-primary)', color: 'var(--text-secondary)' }}
            >
              {eyebrow}
            </span>
            <h2 className="type-landing-h2" style={{ color: 'var(--text-primary)' }}>{title}</h2>
            <p className="type-landing-body" style={{ color: 'var(--text-secondary)' }}>{description}</p>
          </div>

          <div className="space-y-2">
            {layers.map((layer, index) => {
              const isActive = activeEvidenceIndex === index;

              return (
                <button
                  key={layer.stage}
                  type="button"
                  onClick={() => setActiveEvidenceIndex(index)}
                  aria-pressed={isActive}
                  aria-controls={panelId}
                  className="flex w-full items-center justify-between rounded-[8px] border px-4 py-3 text-left transition-colors duration-[120ms]"
                  style={isActive ? {
                    borderColor: 'var(--canon-purple-border)',
                    backgroundColor: 'var(--canon-purple-selected)',
                  } : {
                    borderColor: 'var(--border-tertiary)',
                    backgroundColor: 'var(--bg-primary)',
                  }}
                >
                  <div>
                    <p
                      className="type-kicker"
                      style={{ color: isActive ? 'var(--canon-purple)' : undefined }}
                    >
                      {layer.stage}
                    </p>
                    <p
                      className="mt-1 text-sm font-medium"
                      style={{ color: isActive ? 'var(--text-primary)' : 'var(--text-secondary)' }}
                    >
                      {layer.title}
                    </p>
                  </div>
                  <span
                    className="text-lg font-medium tabular-nums"
                    style={{ color: isActive ? 'var(--canon-purple)' : 'var(--text-tertiary)' }}
                  >
                    {String(index + 1).padStart(2, '0')}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        <article
          id={panelId}
          className="flex h-full flex-col rounded-[10px] border p-4 sm:p-6"
          style={{ borderColor: 'var(--border-tertiary)', backgroundColor: 'var(--bg-primary)' }}
        >
          <div
            className="group relative flex-1 overflow-hidden rounded-[8px] border"
            style={{ borderColor: 'var(--border-secondary)', backgroundColor: 'var(--bg-tertiary)' }}
          >
            <button
              type="button"
              onClick={() => setExpandedImage({ src: activeLayer.image, alt: activeLayer.alt })}
              className="flex h-full min-h-[22rem] w-full cursor-zoom-in items-center justify-center p-4 sm:min-h-[28rem] sm:p-6"
              aria-label={`Expand image for ${activeLayer.title}`}
            >
              <Image
                src={activeLayer.image}
                alt={activeLayer.alt}
                width={3442}
                height={1922}
                sizes="(min-width: 1024px) 60vw, 100vw"
                className="h-auto max-h-full w-auto max-w-full object-contain transition duration-500 group-hover:scale-[1.01]"
              />
              <span
                className="pointer-events-none absolute bottom-3 right-3 rounded-[6px] border px-2.5 py-1 text-[11px] uppercase tracking-[0.2em]"
                style={{ borderColor: 'var(--border-secondary)', backgroundColor: 'var(--bg-secondary)', color: 'var(--text-tertiary)' }}
              >
                Expand
              </span>
            </button>
          </div>

          <div className="mt-5">
            <p className="type-kicker">{activeLayer.stage}</p>
            <h3 className="mt-2 type-landing-h3" style={{ color: 'var(--text-primary)' }}>
              {activeLayer.title}
            </h3>
            <p className="mt-3 max-w-3xl type-landing-body" style={{ color: 'var(--text-secondary)' }}>
              {activeLayer.description}
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              {activeLayer.highlights.map((highlight) => (
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
        </article>
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
