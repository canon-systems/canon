import { ArrowRight, Code2, Github, Zap, Layers3, FileText, BarChart3, ExternalLink, Shield, Users, Clock, CheckCircle } from 'lucide-react';
import Link from 'next/link';

export default function LandingPage() {
    return (
        <div className="min-h-screen bg-gradient-to-br from-slate-900 via-blue-900 to-slate-900">
            {/* Header */}
            <header className="relative z-10 px-4 py-6 sm:px-6 lg:px-8">
                <div className="mx-auto max-w-7xl flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-r from-blue-500 to-purple-500">
                            <Code2 className="h-6 w-6 text-white" />
                        </div>
                        <div>
                            <h1 className="text-xl font-bold text-white">Sync</h1>
                            <p className="text-xs text-blue-200">AI-Powered Documentation</p>
                        </div>
                    </div>
                    <div className="flex items-center gap-4">
                        <Link href="/login" className="text-white/80 hover:text-white transition-colors">
                            Sign In
                        </Link>
                        <Link
                            href="/login"
                            className="px-4 py-2 bg-gradient-to-r from-blue-500 to-purple-500 text-white rounded-lg hover:from-blue-600 hover:to-purple-600 transition-all font-medium"
                        >
                            Get Started
                        </Link>
                    </div>
                </div>
            </header>

            {/* Hero Section */}
            <section className="relative px-4 py-20 sm:px-6 lg:px-8">
                <div className="mx-auto max-w-7xl text-center">
                    <div className="mb-8 inline-flex items-center gap-2 px-4 py-2 bg-blue-500/10 border border-blue-500/20 rounded-full">
                        <Zap className="h-4 w-4 text-blue-400" />
                        <span className="text-sm text-blue-300 font-medium">AI-Powered Code Intelligence</span>
                    </div>

                    <h1 className="mb-6 text-5xl sm:text-6xl lg:text-7xl font-bold text-white leading-tight">
                        Transform Code into
                        <span className="block bg-gradient-to-r from-blue-400 via-purple-400 to-cyan-400 bg-clip-text text-transparent">
                            Business Intelligence
                        </span>
                    </h1>

                    <p className="mb-8 text-xl text-white/80 max-w-3xl mx-auto leading-relaxed">
                        Sync bridges the gap between technical implementation and business outcomes.
                        Our AI analyzes your codebase to generate comprehensive documentation, architecture diagrams,
                        and automated insights that keep your teams aligned and informed.
                    </p>

                    <div className="flex flex-col sm:flex-row gap-4 justify-center items-center">
                        <Link
                            href="/login"
                            className="px-8 py-4 bg-gradient-to-r from-blue-500 to-purple-500 text-white rounded-xl hover:from-blue-600 hover:to-purple-600 transition-all font-semibold text-lg shadow-lg hover:shadow-xl flex items-center gap-2 group"
                        >
                            Start Analyzing Code
                            <ArrowRight className="h-5 w-5 group-hover:translate-x-1 transition-transform" />
                        </Link>
                        <button className="px-8 py-4 border border-white/20 text-white rounded-xl hover:bg-white/10 transition-all font-semibold text-lg backdrop-blur-sm">
                            Watch Demo
                        </button>
                    </div>
                </div>
            </section>

            {/* Features Grid */}
            <section className="px-4 py-20 sm:px-6 lg:px-8">
                <div className="mx-auto max-w-7xl">
                    <div className="text-center mb-16">
                        <h2 className="text-3xl sm:text-4xl font-bold text-white mb-4">
                            Everything you need to understand your codebase
                        </h2>
                        <p className="text-xl text-white/70 max-w-2xl mx-auto">
                            From repository analysis to automated documentation publishing, Sync provides end-to-end code intelligence.
                        </p>
                    </div>

                    <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
                        {/* Repository Analysis */}
                        <div className="glass-panel p-8 hover:border-blue-500/30 transition-all">
                            <div className="mb-6 inline-flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-r from-green-500 to-emerald-500">
                                <Github className="h-6 w-6 text-white" />
                            </div>
                            <h3 className="text-xl font-semibold text-white mb-3">Repository Analysis</h3>
                            <p className="text-white/70 leading-relaxed">
                                Connect your GitHub repositories and let our AI analyze your codebase structure,
                                dependencies, and architecture patterns. Get instant insights into your project's technical foundation.
                            </p>
                            <ul className="mt-4 space-y-2">
                                <li className="flex items-center gap-2 text-sm text-white/60">
                                    <CheckCircle className="h-4 w-4 text-green-400" />
                                    Automatic dependency detection
                                </li>
                                <li className="flex items-center gap-2 text-sm text-white/60">
                                    <CheckCircle className="h-4 w-4 text-green-400" />
                                    Code structure analysis
                                </li>
                                <li className="flex items-center gap-2 text-sm text-white/60">
                                    <CheckCircle className="h-4 w-4 text-green-400" />
                                    Technology stack identification
                                </li>
                            </ul>
                        </div>

                        {/* Documentation Generation */}
                        <div className="glass-panel p-8 hover:border-purple-500/30 transition-all">
                            <div className="mb-6 inline-flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-r from-purple-500 to-pink-500">
                                <FileText className="h-6 w-6 text-white" />
                            </div>
                            <h3 className="text-xl font-semibold text-white mb-3">AI Documentation</h3>
                            <p className="text-white/70 leading-relaxed">
                                Generate comprehensive documentation that explains what your code does,
                                how it works, and why it matters. Our AI understands context and business logic, not just syntax.
                            </p>
                            <ul className="mt-4 space-y-2">
                                <li className="flex items-center gap-2 text-sm text-white/60">
                                    <CheckCircle className="h-4 w-4 text-green-400" />
                                    Business context analysis
                                </li>
                                <li className="flex items-center gap-2 text-sm text-white/60">
                                    <CheckCircle className="h-4 w-4 text-green-400" />
                                    Rich text editing
                                </li>
                                <li className="flex items-center gap-2 text-sm text-white/60">
                                    <CheckCircle className="h-4 w-4 text-green-400" />
                                    Collaborative editing
                                </li>
                            </ul>
                        </div>

                        {/* Architecture Diagrams */}
                        <div className="glass-panel p-8 hover:border-cyan-500/30 transition-all">
                            <div className="mb-6 inline-flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-r from-cyan-500 to-blue-500">
                                <Layers3 className="h-6 w-6 text-white" />
                            </div>
                            <h3 className="text-xl font-semibold text-white mb-3">Architecture Visualization</h3>
                            <p className="text-white/70 leading-relaxed">
                                Transform complex codebases into clear, interactive architecture diagrams.
                                Visualize data flows, component relationships, and system interactions at a glance.
                            </p>
                            <ul className="mt-4 space-y-2">
                                <li className="flex items-center gap-2 text-sm text-white/60">
                                    <CheckCircle className="h-4 w-4 text-green-400" />
                                    Interactive flow diagrams
                                </li>
                                <li className="flex items-center gap-2 text-sm text-white/60">
                                    <CheckCircle className="h-4 w-4 text-green-400" />
                                    Technology detection
                                </li>
                                <li className="flex items-center gap-2 text-sm text-white/60">
                                    <CheckCircle className="h-4 w-4 text-green-400" />
                                    Version tracking
                                </li>
                            </ul>
                        </div>

                        {/* Automation */}
                        <div className="glass-panel p-8 hover:border-yellow-500/30 transition-all">
                            <div className="mb-6 inline-flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-r from-yellow-500 to-orange-500">
                                <Zap className="h-6 w-6 text-white" />
                            </div>
                            <h3 className="text-xl font-semibold text-white mb-3">Smart Automation</h3>
                            <p className="text-white/70 leading-relaxed">
                                Set up intelligent automation rules that keep your documentation current.
                                Automatically detect changes, regenerate docs, and publish updates based on your schedule.
                            </p>
                            <ul className="mt-4 space-y-2">
                                <li className="flex items-center gap-2 text-sm text-white/60">
                                    <CheckCircle className="h-4 w-4 text-green-400" />
                                    Change detection
                                </li>
                                <li className="flex items-center gap-2 text-sm text-white/60">
                                    <CheckCircle className="h-4 w-4 text-green-400" />
                                    Scheduled updates
                                </li>
                                <li className="flex items-center gap-2 text-sm text-white/60">
                                    <CheckCircle className="h-4 w-4 text-green-400" />
                                    Significance analysis
                                </li>
                            </ul>
                        </div>

                        {/* Publishing Integration */}
                        <div className="glass-panel p-8 hover:border-pink-500/30 transition-all">
                            <div className="mb-6 inline-flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-r from-pink-500 to-rose-500">
                                <ExternalLink className="h-6 w-6 text-white" />
                            </div>
                            <h3 className="text-xl font-semibold text-white mb-3">Multi-Platform Publishing</h3>
                            <p className="text-white/70 leading-relaxed">
                                Publish your documentation directly to the platforms your team uses.
                                Seamlessly integrate with Notion, Confluence, Coda, and more for maximum reach.
                            </p>
                            <ul className="mt-4 space-y-2">
                                <li className="flex items-center gap-2 text-sm text-white/60">
                                    <CheckCircle className="h-4 w-4 text-green-400" />
                                    Notion integration
                                </li>
                                <li className="flex items-center gap-2 text-sm text-white/60">
                                    <CheckCircle className="h-4 w-4 text-green-400" />
                                    Confluence support
                                </li>
                                <li className="flex items-center gap-2 text-sm text-white/60">
                                    <CheckCircle className="h-4 w-4 text-green-400" />
                                    Coda publishing
                                </li>
                            </ul>
                        </div>

                        {/* Analytics & Insights */}
                        <div className="glass-panel p-8 hover:border-indigo-500/30 transition-all">
                            <div className="mb-6 inline-flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-r from-indigo-500 to-purple-500">
                                <BarChart3 className="h-6 w-6 text-white" />
                            </div>
                            <h3 className="text-xl font-semibold text-white mb-3">Analytics Dashboard</h3>
                            <p className="text-white/70 leading-relaxed">
                                Track documentation health, automation performance, and team engagement.
                                Get insights into your codebase evolution and documentation effectiveness.
                            </p>
                            <ul className="mt-4 space-y-2">
                                <li className="flex items-center gap-2 text-sm text-white/60">
                                    <CheckCircle className="h-4 w-4 text-green-400" />
                                    Usage analytics
                                </li>
                                <li className="flex items-center gap-2 text-sm text-white/60">
                                    <CheckCircle className="h-4 w-4 text-green-400" />
                                    Automation stats
                                </li>
                                <li className="flex items-center gap-2 text-sm text-white/60">
                                    <CheckCircle className="h-4 w-4 text-green-400" />
                                    Change tracking
                                </li>
                            </ul>
                        </div>
                    </div>
                </div>
            </section>

            {/* How It Works */}
            <section className="px-4 py-20 sm:px-6 lg:px-8 bg-black/20">
                <div className="mx-auto max-w-7xl">
                    <div className="text-center mb-16">
                        <h2 className="text-3xl sm:text-4xl font-bold text-white mb-4">
                            How Sync Works
                        </h2>
                        <p className="text-xl text-white/70">
                            Four simple steps to transform your codebase into business intelligence
                        </p>
                    </div>

                    <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-8">
                        <div className="text-center">
                            <div className="mb-6 inline-flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-r from-blue-500 to-purple-500 text-2xl font-bold text-white">
                                1
                            </div>
                            <h3 className="text-lg font-semibold text-white mb-3">Connect Repository</h3>
                            <p className="text-white/70">
                                Link your GitHub repository and let Sync analyze your codebase structure and dependencies.
                            </p>
                        </div>

                        <div className="text-center">
                            <div className="mb-6 inline-flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-r from-purple-500 to-pink-500 text-2xl font-bold text-white">
                                2
                            </div>
                            <h3 className="text-lg font-semibold text-white mb-3">AI Analysis</h3>
                            <p className="text-white/70">
                                Our AI examines your code to understand functionality, architecture, and business logic.
                            </p>
                        </div>

                        <div className="text-center">
                            <div className="mb-6 inline-flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-r from-pink-500 to-red-500 text-2xl font-bold text-white">
                                3
                            </div>
                            <h3 className="text-lg font-semibold text-white mb-3">Generate Assets</h3>
                            <p className="text-white/70">
                                Create documentation, diagrams, and insights that explain what your code does and why it matters.
                            </p>
                        </div>

                        <div className="text-center">
                            <div className="mb-6 inline-flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-r from-green-500 to-blue-500 text-2xl font-bold text-white">
                                4
                            </div>
                            <h3 className="text-lg font-semibold text-white mb-3">Automate & Publish</h3>
                            <p className="text-white/70">
                                Set up automation to keep docs current and publish to your team's preferred platforms.
                            </p>
                        </div>
                    </div>
                </div>
            </section>

            {/* Benefits */}
            <section className="px-4 py-20 sm:px-6 lg:px-8">
                <div className="mx-auto max-w-7xl">
                    <div className="text-center mb-16">
                        <h2 className="text-3xl sm:text-4xl font-bold text-white mb-4">
                            Why Choose Sync?
                        </h2>
                        <p className="text-xl text-white/70">
                            Join teams that are already saving time and improving communication
                        </p>
                    </div>

                    <div className="grid md:grid-cols-3 gap-8">
                        <div className="text-center">
                            <div className="mb-6 inline-flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-r from-green-500 to-emerald-500">
                                <Clock className="h-6 w-6 text-white" />
                            </div>
                            <h3 className="text-xl font-semibold text-white mb-3">Save Development Time</h3>
                            <p className="text-white/70">
                                Eliminate hours spent writing and maintaining documentation. Focus on building great software instead.
                            </p>
                        </div>

                        <div className="text-center">
                            <div className="mb-6 inline-flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-r from-blue-500 to-cyan-500">
                                <Users className="h-6 w-6 text-white" />
                            </div>
                            <h3 className="text-xl font-semibold text-white mb-3">Improve Team Alignment</h3>
                            <p className="text-white/70">
                                Keep everyone on the same page with up-to-date documentation that explains the business context.
                            </p>
                        </div>

                        <div className="text-center">
                            <div className="mb-6 inline-flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-r from-purple-500 to-indigo-500">
                                <Shield className="h-6 w-6 text-white" />
                            </div>
                            <h3 className="text-xl font-semibold text-white mb-3">Reduce Knowledge Gaps</h3>
                            <p className="text-white/70">
                                Ensure institutional knowledge is captured and accessible, even as team members change.
                            </p>
                        </div>
                    </div>
                </div>
            </section>

            {/* CTA Section */}
            <section className="px-4 py-20 sm:px-6 lg:px-8 bg-gradient-to-r from-blue-600/20 to-purple-600/20">
                <div className="mx-auto max-w-4xl text-center">
                    <h2 className="text-3xl sm:text-4xl font-bold text-white mb-6">
                        Ready to Transform Your Codebase?
                    </h2>
                    <p className="text-xl text-white/80 mb-8">
                        Join thousands of developers who are using Sync to bridge the gap between code and business outcomes.
                    </p>

                    <div className="flex flex-col sm:flex-row gap-4 justify-center items-center">
                        <Link
                            href="/login"
                            className="px-8 py-4 bg-gradient-to-r from-blue-500 to-purple-500 text-white rounded-xl hover:from-blue-600 hover:to-purple-600 transition-all font-semibold text-lg shadow-lg hover:shadow-xl flex items-center gap-2 group"
                        >
                            Start Free Trial
                            <ArrowRight className="h-5 w-5 group-hover:translate-x-1 transition-transform" />
                        </Link>
                        <Link
                            href="/help"
                            className="px-8 py-4 border border-white/20 text-white rounded-xl hover:bg-white/10 transition-all font-semibold text-lg backdrop-blur-sm"
                        >
                            Learn More
                        </Link>
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
                            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-r from-blue-500 to-purple-500">
                                <Code2 className="h-5 w-5 text-white" />
                            </div>
                            <span className="text-white font-semibold">Sync</span>
                        </div>

                        <div className="flex items-center gap-6 text-sm text-white/60">
                            <Link href="/help" className="hover:text-white transition-colors">Help</Link>
                            <Link href="/privacy" className="hover:text-white transition-colors">Privacy</Link>
                            <Link href="/terms" className="hover:text-white transition-colors">Terms</Link>
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
