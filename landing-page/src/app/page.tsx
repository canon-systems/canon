import { ArrowRight, Code2, GitBranch, Zap, Layers3, FileText, BarChart3, ExternalLink, Shield, Users, Clock, CheckCircle } from 'lucide-react';
import Link from 'next/link';

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-gray-900 to-slate-900">
      {/* Header */}
      <header className="relative z-10 px-4 py-6 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-7xl flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-r from-gray-500 to-gray-600">
              <Code2 className="h-6 w-6 text-white" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-white">Sync</h1>
              <p className="text-xs text-gray-200">Automated Documentation</p>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <a
              href="https://app.whatevermynamewillbe.com/login"
              className="text-white/80 hover:text-white transition-colors"
            >
              Sign In
            </a>
            <a
              href="https://app.whatevermynamewillbe.com/login"
              className="px-4 py-2 bg-gradient-to-r from-gray-500 to-gray-600 text-white rounded-lg hover:from-gray-600 hover:to-gray-700 transition-all font-medium"
            >
              Get Started
            </a>
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <section className="relative px-4 py-20 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-7xl text-center">
          <div className="mb-8 inline-flex items-center gap-2 px-4 py-2 bg-gray-500/10 border border-gray-500/20 rounded-full">
            <Zap className="h-4 w-4 text-gray-400" />
            <span className="text-sm text-gray-300 font-medium">Set It & Forget It Documentation</span>
          </div>

          <h1 className="mb-6 text-5xl sm:text-6xl lg:text-7xl font-bold text-white leading-tight">
            Never Write Docs Again
            <span className="block bg-gradient-to-r from-gray-300 via-gray-400 to-gray-500 bg-clip-text text-transparent">
              Auto-Generated & Always Up-to-Date
            </span>
          </h1>

          <p className="mb-8 text-xl text-white/80 max-w-3xl mx-auto leading-relaxed">
            Sync automatically generates and keeps your documentation up-to-date. Connect your
            code repository, and every code change automatically triggers smart updates to your
            docs and diagrams. When needed, you can step in to review, edit, and ensure quality.
          </p>

          <div className="flex flex-col sm:flex-row gap-4 justify-center items-center">
            <a
              href="https://app.whatevermynamewillbe.com/login"
              className="px-8 py-4 bg-gradient-to-r from-gray-500 to-gray-600 text-white rounded-xl hover:from-gray-600 hover:to-gray-700 transition-all font-semibold text-lg shadow-lg hover:shadow-xl flex items-center gap-2 group"
            >
              Connect Your Code Repository
              <ArrowRight className="h-5 w-5 group-hover:translate-x-1 transition-transform" />
            </a>
            <button className="px-8 py-4 border border-white/20 text-white rounded-xl hover:bg-white/10 transition-all font-semibold text-lg backdrop-blur-sm">
              Watch Demo
            </button>
          </div>
        </div>
      </section>

      {/* Core Features */}
      <section className="px-4 py-20 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-7xl">
          <div className="text-center mb-16">
            <h2 className="text-3xl sm:text-4xl font-bold text-white mb-4">
              Everything You Need for Perfect Documentation
            </h2>
            <p className="text-xl text-white/70 max-w-3xl mx-auto">
              From smart code analysis to automatic publishing, Sync eliminates documentation headaches
              and keeps your team's knowledge always up-to-date and accurate.
            </p>
          </div>

          <div className="space-y-16">
            {/* Primary Feature - Automation */}
            <div className="glass-panel p-12 hover:border-gray-500/30 transition-all">
              <div className="grid lg:grid-cols-2 gap-12 items-center">
                <div>
                  <div className="mb-6 inline-flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-r from-gray-400 to-gray-500">
                    <Zap className="h-8 w-8 text-white" />
                  </div>
                  <h3 className="text-3xl font-bold text-white mb-4">
                    Zero-Maintenance Documentation
                  </h3>
                  <p className="text-xl text-white/80 mb-6 leading-relaxed">
                    Set it and forget it. Every code change automatically triggers intelligent documentation
                    regeneration, ensuring your docs are always accurate and comprehensive. When needed,
                    you can step in for final review and quality control.
                  </p>
                  <div className="space-y-3">
                    <div className="flex items-center gap-3">
                      <CheckCircle className="h-5 w-5 text-green-400 flex-shrink-0" />
                      <span className="text-white/80">Automatic change detection and analysis</span>
                    </div>
                    <div className="flex items-center gap-3">
                      <CheckCircle className="h-5 w-5 text-green-400 flex-shrink-0" />
                      <span className="text-white/80">Smart regeneration of docs and diagrams</span>
                    </div>
                    <div className="flex items-center gap-3">
                      <CheckCircle className="h-5 w-5 text-green-400 flex-shrink-0" />
                      <span className="text-white/80">Scheduled updates and maintenance</span>
                    </div>
                  </div>
                </div>
                <div className="lg:text-right">
                  <div className="inline-flex items-center gap-2 px-6 py-3 bg-gray-500/20 border border-gray-500/30 rounded-full">
                    <div className="w-2 h-2 bg-gray-400 rounded-full animate-pulse"></div>
                    <span className="text-sm font-medium text-gray-300">Always Up-to-Date</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Feature Grid - Detailed & Modern */}
            <div className="grid md:grid-cols-2 gap-8">
              {/* Code Analysis That Actually Understands */}
              <div className="glass-panel p-12 hover:border-gray-600/30 transition-all">
                <div className="grid lg:grid-cols-2 gap-8 items-center">
                  <div>
                    <div className="mb-6 inline-flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-r from-gray-500 to-gray-600">
                      <GitBranch className="h-8 w-8 text-white" />
                    </div>
                    <h3 className="text-2xl font-bold text-white mb-4">
                      Code Analysis That Actually Understands
                    </h3>
                    <p className="text-xl text-white/80 mb-6 leading-relaxed">
                      Stop wasting time on basic code scanning. Our AI dives deep into your code repositories
                      to understand frameworks, libraries, and how everything connects together.
                    </p>
                    <div className="space-y-3">
                      <div className="flex items-center gap-3">
                        <CheckCircle className="h-5 w-5 text-green-400 flex-shrink-0" />
                        <span className="text-white/80">Automatic framework and tool detection</span>
                      </div>
                      <div className="flex items-center gap-3">
                        <CheckCircle className="h-5 w-5 text-green-400 flex-shrink-0" />
                        <span className="text-white/80">Dependency relationship mapping</span>
                      </div>
                      <div className="flex items-center gap-3">
                        <CheckCircle className="h-5 w-5 text-green-400 flex-shrink-0" />
                        <span className="text-white/80">Architecture pattern recognition</span>
                      </div>
                    </div>
                  </div>
                  <div className="lg:text-right">
                    <div className="inline-flex items-center gap-2 px-6 py-3 bg-gray-600/20 border border-gray-600/30 rounded-full">
                      <div className="w-2 h-2 bg-gray-500 rounded-full animate-pulse"></div>
                      <span className="text-sm font-medium text-gray-400">Deep Understanding</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* AI-Powered Documentation */}
              <div className="glass-panel p-12 hover:border-gray-700/30 transition-all">
                <div className="grid lg:grid-cols-2 gap-8 items-center">
                  <div>
                    <div className="mb-6 inline-flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-r from-gray-600 to-gray-700">
                      <FileText className="h-8 w-8 text-white" />
                    </div>
                    <h3 className="text-2xl font-bold text-white mb-4">
                      AI-Powered Documentation
                    </h3>
                    <p className="text-xl text-white/80 mb-6 leading-relaxed">
                      Generate professional documentation that explains what your code does,
                      why it matters, and how it all fits together. You can review and edit AI-generated
                      content to ensure it meets your standards and captures your team's expertise.
                    </p>
                    <div className="space-y-3">
                      <div className="flex items-center gap-3">
                        <CheckCircle className="h-5 w-5 text-green-400 flex-shrink-0" />
                        <span className="text-white/80">Business logic and purpose explanation</span>
                      </div>
                      <div className="flex items-center gap-3">
                        <CheckCircle className="h-5 w-5 text-green-400 flex-shrink-0" />
                        <span className="text-white/80">Multiple AI models (GPT-4, Claude, etc.)</span>
                      </div>
                      <div className="flex items-center gap-3">
                        <CheckCircle className="h-5 w-5 text-green-400 flex-shrink-0" />
                        <span className="text-white/80">Human review and editing capabilities</span>
                      </div>
                    </div>
                  </div>
                  <div className="lg:text-right">
                    <div className="inline-flex items-center gap-2 px-6 py-3 bg-gray-700/20 border border-gray-700/30 rounded-full">
                      <div className="w-2 h-2 bg-gray-600 rounded-full animate-pulse"></div>
                      <span className="text-sm font-medium text-gray-500">Crystal Clear</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Visual Architecture Diagrams */}
              <div className="glass-panel p-12 hover:border-gray-800/30 transition-all">
                <div className="grid lg:grid-cols-2 gap-8 items-center">
                  <div>
                    <div className="mb-6 inline-flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-r from-gray-700 to-gray-800">
                      <Layers3 className="h-8 w-8 text-white" />
                    </div>
                    <h3 className="text-2xl font-bold text-white mb-4">
                      Visual Architecture Diagrams
                    </h3>
                    <p className="text-xl text-white/80 mb-6 leading-relaxed">
                      Transform complex system architecture into beautiful, interactive diagrams
                      that anyone can understand. See how your services connect and data flows.
                      Review and customize generated diagrams to match your architectural vision.
                    </p>
                    <div className="space-y-3">
                      <div className="flex items-center gap-3">
                        <CheckCircle className="h-5 w-5 text-green-400 flex-shrink-0" />
                        <span className="text-white/80">Interactive Mermaid diagrams</span>
                      </div>
                      <div className="flex items-center gap-3">
                        <CheckCircle className="h-5 w-5 text-green-400 flex-shrink-0" />
                        <span className="text-white/80">Auto-updating with code changes</span>
                      </div>
                      <div className="flex items-center gap-3">
                        <CheckCircle className="h-5 w-5 text-green-400 flex-shrink-0" />
                        <span className="text-white/80">Human review and customization options</span>
                      </div>
                    </div>
                  </div>
                  <div className="lg:text-right">
                    <div className="inline-flex items-center gap-2 px-6 py-3 bg-gray-800/20 border border-gray-800/30 rounded-full">
                      <div className="w-2 h-2 bg-gray-700 rounded-full animate-pulse"></div>
                      <span className="text-sm font-medium text-gray-600">Visual Clarity</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* One-Click Publishing */}
              <div className="glass-panel p-12 hover:border-gray-500/30 transition-all">
                <div className="grid lg:grid-cols-2 gap-8 items-center">
                  <div>
                    <div className="mb-6 inline-flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-r from-gray-300 to-gray-400">
                      <ExternalLink className="h-8 w-8 text-white" />
                    </div>
                    <h3 className="text-2xl font-bold text-white mb-4">
                      One-Click Publishing
                    </h3>
                    <p className="text-xl text-white/80 mb-6 leading-relaxed">
                      Stop manually copying docs to different tools. Publish directly to your team's
                      favorite platforms with a single click. Keep everyone in sync automatically.
                    </p>
                    <div className="space-y-3">
                      <div className="flex items-center gap-3">
                        <CheckCircle className="h-5 w-5 text-green-400 flex-shrink-0" />
                        <span className="text-white/80">Direct publishing to Notion, Confluence, Coda</span>
                      </div>
                      <div className="flex items-center gap-3">
                        <CheckCircle className="h-5 w-5 text-green-400 flex-shrink-0" />
                        <span className="text-white/80">Automated publishing workflows</span>
                      </div>
                      <div className="flex items-center gap-3">
                        <CheckCircle className="h-5 w-5 text-green-400 flex-shrink-0" />
                        <span className="text-white/80">Team collaboration integration</span>
                      </div>
                    </div>
                  </div>
                  <div className="lg:text-right">
                    <div className="inline-flex items-center gap-2 px-6 py-3 bg-gray-500/20 border border-gray-500/30 rounded-full">
                      <div className="w-2 h-2 bg-gray-400 rounded-full animate-pulse"></div>
                      <span className="text-sm font-medium text-gray-300">Zero Friction</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="px-4 py-20 sm:px-6 lg:px-8 bg-gradient-to-r from-gray-600/20 to-gray-700/20">
        <div className="mx-auto max-w-4xl text-center">
          <h2 className="text-3xl sm:text-4xl font-bold text-white mb-6">
            Ready to Transform Your Codebase?
          </h2>
          <p className="text-xl text-white/80 mb-8">
            Be among the first to experience the future of automated technical documentation.
          </p>

          <div className="flex flex-col sm:flex-row gap-4 justify-center items-center">
            <a
              href="https://app.whatevermynamewillbe.com/login"
              className="px-8 py-4 bg-gradient-to-r from-gray-500 to-gray-600 text-white rounded-xl hover:from-gray-600 hover:to-gray-700 transition-all font-semibold text-lg shadow-lg hover:shadow-xl flex items-center gap-2 group"
            >
              Start Free Trial
              <ArrowRight className="h-5 w-5 group-hover:translate-x-1 transition-transform" />
            </a>
            <button className="px-8 py-4 border border-white/20 text-white rounded-xl hover:bg-white/10 transition-all font-semibold text-lg backdrop-blur-sm">
              Learn More
            </button>
          </div>

          <p className="mt-6 text-sm text-white/60">
            No credit card required • Full access to all features • Cancel anytime
          </p>
        </div>
      </section>

      {/* Footer */}
      <footer className="px-4 py-12 sm:px-6 lg:px-8 border-t border-white/10">
        <div className="mx-auto max-w-7xl">
          <div className="flex flex-col md:flex-row items-center justify-between gap-6">
            <div className="flex items-center gap-3">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-r from-gray-500 to-gray-600">
                <Code2 className="h-5 w-5 text-white" />
              </div>
              <span className="text-white font-semibold">Sync</span>
            </div>

            <div className="flex items-center gap-6 text-sm text-white/60">
              <a href="mailto:support@Sync.app" className="hover:text-white transition-colors">Contact</a>
            </div>
          </div>

          <div className="mt-8 pt-8 border-t border-white/10 text-center text-sm text-white/40">
            © 2024 Sync. All rights reserved.
          </div>
        </div>
      </footer>
    </div>
  );
}
