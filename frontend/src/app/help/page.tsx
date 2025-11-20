import { HelpCircle } from 'lucide-react';

export default function HelpPage() {
  return (
    <div className="min-h-screen px-4 py-12 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-4xl">
        <div className="mb-12 text-center">
          <div className="mb-6 inline-flex items-center gap-3">
            <div className="flex h-16 w-16 items-center justify-center rounded-2xl border border-white/30 bg-white/20 bg-gradient-to-r from-gray-500 to-gray-700 backdrop-blur-sm">
              <HelpCircle className="h-8 w-8 text-white" />
            </div>
          </div>

          <h1 className="mb-4 text-4xl font-bold text-white">Help & About</h1>
          <p className="text-xl text-white/80">Get help or learn more about CodeSense.</p>
        </div>

        <div className="rounded-2xl border border-white/20 bg-white/10 backdrop-blur-md">
          <div className="rounded-t-2xl border-b border-white/10 px-6 py-4">
            <h2 className="text-lg font-semibold text-white">About CodeSense</h2>
          </div>

          <div className="space-y-4 p-6">
            <p className="text-white/80">
              CodeSense is a tool that bridges the gap between code and business outcomes. It analyzes
              your codebase or project and produces a clear, high level summary of the problem it solves
              and the value it creates.
            </p>
            <p className="text-white/80">
              For support, email{' '}
              <a
                className="underline hover:no-underline"
                href="mailto:support@codesense.app"
              >
                support@codesense.app
              </a>
              .
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

