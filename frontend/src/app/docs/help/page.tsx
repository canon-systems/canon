import { MessageCircle } from 'lucide-react';

export default function HelpPage() {
  return (
    <section className="rounded-2xl border border-white/10 bg-zinc-900/80 p-6 sm:p-8">
      <div className="flex items-start gap-4">
        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border border-white/10 bg-zinc-800">
          <MessageCircle className="h-6 w-6 text-white/80" />
        </div>
        <div>
          <h1 className="text-2xl font-semibold text-white">Need More Help?</h1>
          <p className="mt-2 text-white/80">
            If something doesn’t work or you’re not sure how to set something up, contact support. Include your workspace and which step you’re on so we can help quickly.
          </p>
          <a
            href="mailto:john@usecanon.com"
            className="mt-4 inline-flex items-center gap-2 rounded-lg border border-white/20 bg-white/5 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-white/10"
          >
            Contact Support
          </a>
        </div>
      </div>
    </section>
  );
}
