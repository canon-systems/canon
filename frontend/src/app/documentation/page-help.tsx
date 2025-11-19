import { BookOpen } from 'lucide-react';

export default function DocumentationPage() {
  return (
    <div className="min-h-screen px-4 py-12 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-4xl">
        <div className="mb-12 text-center">
          <div className="mb-6 inline-flex items-center gap-3">
            <div className="flex h-16 w-16 items-center justify-center rounded-2xl border border-white/30 bg-white/20 bg-gradient-to-r from-gray-500 to-gray-700 backdrop-blur-sm">
              <BookOpen className="h-8 w-8 text-white" />
            </div>
          </div>

          <h1 className="mb-4 text-4xl font-bold text-white">Documentation</h1>
          <p className="text-xl text-white/80">How to use CodeSense to its full potential.</p>
        </div>

        <div className="rounded-2xl border border-white/20 bg-white/10 backdrop-blur-md">
          <div className="rounded-t-2xl border-b border-white/10 px-6 py-4">
            <h2 className="text-lg font-semibold text-white">Coming Soon</h2>
          </div>

          <div className="p-6">
            <p className="text-white/80">
              Our team is hard at work creating comprehensive documentation. Please check back soon for
              detailed guides and tutorials on how to integrate and use CodeSense effectively.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

