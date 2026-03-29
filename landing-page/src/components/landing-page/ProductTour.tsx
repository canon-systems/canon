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
        <div className="space-y-5 lg:sticky lg:top-28">
          <div className="space-y-5">
            <p className="inline-flex rounded-full border border-white/12 bg-white/7 px-3 py-1 text-sm text-white/75">
              {eyebrow}
            </p>
            <h2 className="font-display text-3xl font-semibold tracking-[-0.03em] text-white sm:text-4xl">
              {title}
            </h2>
            <p className="text-base leading-8 text-white/68">{description}</p>
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
                  className={`flex w-full items-center justify-between rounded-[1.35rem] border px-4 py-3 text-left transition ${
                    isActive
                      ? 'border-white/15 bg-white text-black shadow-[0_18px_45px_rgba(0,0,0,0.28)]'
                      : 'border-white/10 bg-white/[0.04] text-white/78 hover:bg-white/[0.07]'
                  }`}
                >
                  <div>
                    <p className="text-[11px] uppercase tracking-[0.26em] opacity-60">{layer.stage}</p>
                    <p className="mt-1 text-sm font-medium">{layer.title}</p>
                  </div>
                  <span className="font-display text-xl tracking-[-0.04em]">
                    {String(index + 1).padStart(2, '0')}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        <article
          id={panelId}
          className="flex h-full flex-col rounded-[2.4rem] border border-white/10 bg-[linear-gradient(180deg,rgba(255,255,255,0.06),rgba(255,255,255,0.02))] p-4 shadow-[0_30px_90px_rgba(0,0,0,0.4)] sm:p-6"
        >
          <div className="group relative flex-1 overflow-hidden rounded-[1.8rem] border border-white/12 bg-black/40">
            <button
              type="button"
              onClick={() => setExpandedImage({ src: activeLayer.image, alt: activeLayer.alt })}
              className="flex h-full min-h-[22rem] w-full cursor-zoom-in items-center justify-center bg-[radial-gradient(circle_at_top,rgba(255,255,255,0.08),rgba(255,255,255,0.01)_55%)] p-4 sm:min-h-[28rem] sm:p-6"
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
              <span className="pointer-events-none absolute bottom-4 right-4 rounded-full border border-white/20 bg-black/60 px-3 py-1 text-[11px] uppercase tracking-[0.22em] text-white/85">
                Expand
              </span>
            </button>
          </div>

          <div className="mt-6">
            <p className="text-xs font-semibold uppercase tracking-[0.3em] text-white/45">{activeLayer.stage}</p>
            <h3 className="mt-3 font-display text-3xl font-semibold tracking-[-0.03em] text-white">
              {activeLayer.title}
            </h3>
            <p className="mt-4 max-w-3xl text-base leading-8 text-white/68">{activeLayer.description}</p>
            <div className="mt-6 flex flex-wrap gap-2">
              {activeLayer.highlights.map((highlight) => (
                <span
                  key={highlight}
                  className="rounded-full border border-white/10 bg-white/[0.06] px-3 py-1 text-xs uppercase tracking-[0.18em] text-white/72"
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
          className="fixed inset-0 z-[120] flex items-center justify-center bg-black/88 p-4 sm:p-8"
          role="dialog"
          aria-modal="true"
          aria-label="Expanded product image"
          onClick={() => setExpandedImage(null)}
        >
          <div className="relative max-h-[92vh] w-full max-w-[1600px]" onClick={(e) => e.stopPropagation()}>
            <button
              type="button"
              onClick={() => setExpandedImage(null)}
              className="absolute right-2 top-2 z-10 inline-flex h-10 w-10 items-center justify-center rounded-full border border-white/20 bg-black/70 text-white transition hover:bg-black"
              aria-label="Close expanded image"
            >
              <X className="h-5 w-5" />
            </button>
            <div className="overflow-hidden rounded-[1.8rem] border border-white/12 bg-black/90 shadow-[0_30px_100px_rgba(0,0,0,0.75)]">
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
