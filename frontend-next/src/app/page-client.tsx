'use client';

import { Github, FolderOpen, Upload, Code, ArrowRight } from 'lucide-react';
import Link from 'next/link';

type Feature = {
  icon: typeof Github;
  title: string;
  description: string;
  color: string;
};

const features: Feature[] = [
  {
    icon: Github,
    title: 'GitHub Repositories',
    description: 'Analyze entire public or private repositories directly from their URL.',
    color: 'from-gray-700 to-gray-900'
  },
  {
    icon: FolderOpen,
    title: 'Specific Directories',
    description: 'Focus on a single folder within a repository to narrow the scope.',
    color: 'from-gray-600 to-gray-800'
  },
  {
    icon: Upload,
    title: 'ZIP Files',
    description: 'Upload your project as a compressed ZIP file for a complete analysis.',
    color: 'from-gray-500 to-gray-700'
  },
  {
    icon: Code,
    title: 'Code Snippets',
    description: 'Quickly paste a snippet of code to understand its business context.',
    color: 'from-gray-400 to-gray-600'
  }
];

export function HomePageClient() {
  return (
    <div className="px-4 py-12 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-5xl">
        <div className="mb-16 text-center">
          <h1 className="mb-6 text-5xl font-extrabold leading-tight text-white md:text-6xl">
            Unlock the Business Value
            <span className="mt-2 block bg-gradient-to-r from-gray-300 to-gray-400 bg-clip-text text-transparent">
              Hidden in Your Code
            </span>
          </h1>

          <p className="mx-auto mb-8 max-w-3xl text-xl text-white/80">
            CodeSense automatically generates clear, non technical summaries that explain the business
            purpose and value of any code, project, or repository.
          </p>

          <Link
            href="/submit"
            className="group inline-flex items-center rounded-xl bg-gradient-to-r from-gray-500 to-gray-700 px-8 py-4 text-lg font-bold text-white transition-transform hover:from-gray-600 hover:to-gray-800"
          >
            Start Analyzing Now
            <ArrowRight className="ml-2 h-5 w-5 transition-transform group-hover:translate-x-1" />
          </Link>
        </div>

        <div className="mb-16">
          <h2 className="mb-8 text-center text-3xl font-bold text-white">Supported Inputs</h2>

          <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-4">
            {features.map((feature, i) => {
              const Icon = feature.icon;
              return (
                <div
                  key={i}
                  className="h-full rounded-2xl border border-white/10 bg-black/20 text-center backdrop-blur-md transition-all duration-300 hover:bg-black/30"
                >
                  <div className="p-6">
                    <div
                      className={`mx-auto mb-4 h-16 w-16 bg-gradient-to-r ${feature.color} flex items-center justify-center rounded-2xl`}
                    >
                      <Icon className="h-8 w-8 text-white" />
                    </div>

                    <h3 className="mb-2 text-lg font-semibold text-white">{feature.title}</h3>
                    <p className="text-sm text-white/70">{feature.description}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

