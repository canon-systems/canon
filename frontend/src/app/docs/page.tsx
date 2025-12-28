import { BookOpen, Play, Clock } from 'lucide-react';

interface VideoTutorial {
  id: string;
  title: string;
  description: string;
  duration: string;
  loomUrl: string;
  embedUrl: string;
  steps: string[];
}

const tutorials: VideoTutorial[] = [
  {
    id: 'github-connection',
    title: 'Connect to Code Repository Provider',
    description: 'Learn how to connect your repository provider account to Canon to enable repository access and automated documentation generation.',
    duration: '2 min',
    loomUrl: 'https://www.loom.com/share/d4e9e616b6c8418f8017992ddab28fed',
    embedUrl: 'https://www.loom.com/embed/d4e9e616b6c8418f8017992ddab28fed',
    steps: [
      'Navigate to the Settings page',
      'Select the "Integrations" tab',
      'Find the repository connection and select "Connect"',
      'Follow the prompts to authorize Canon to access your repository provider account',
      'Once redirected back to Canon, you can start setting up your repository',
    ]
  },
  {
    id: 'repository-setup',
    title: 'Set Up Your Repository',
    description: 'Configure a specific repository for documentation generation after connecting your repository provider account.',
    duration: '2-20 min (depending on the size of the repository)',
    loomUrl: 'https://www.loom.com/share/3387f2b3cee048b589a5b6bcb43f2f07',
    embedUrl: 'https://www.loom.com/embed/3387f2b3cee048b589a5b6bcb43f2f07',
    steps: [
      'Navigate to the "Connect Repo" page',
      'Click the "Connect Your First Repository" button. If not already connected, you will be prompted to connect to your repository provider.',
      'Enter the name of your repository ("canon", "first-app", etc.) and click the search button',
      'Choose the repository you want to set up and then click the "Continue" button',
      'Choose the branch and then click the "Connect Repository" button',
      'Once redirected to the repository setup page, click the "Start Repository Setup" button',
      'Once your repository is set up, you will be redirected to the connect repository page',
    ]
  },
  {
    id: 'generate-docs',
    title: 'Generate Your First Documentation',
    description: 'Create your first automated documentation after connecting to your repository provider and setting up your repository.',
    duration: '5-10 min',
    loomUrl: 'https://www.loom.com/share/99afa1b02056477083fca0c4ee4b02df',
    embedUrl: 'https://www.loom.com/embed/99afa1b02056477083fca0c4ee4b02df',
    steps: [
      'Navigate to the "Generate Docs" page',
      'Select the repository scope, document title, and LLM you would like to use',
      'Select the repository, branch, and directory (if applicable), and the files that you want to generate documentation for (Note: Only repositories that are setup will be available)',
      'Configure the documentation personality and structure. Be sure to be very detailed to achieve the best results',
      'Click the "Analyze & Save" button to start the process',
      'Once the process is complete, you will be redirected to the edit documentation page',
    ]
  },
  {
    id: 'setup-automation',
    title: 'Set Up Automation Rules',
    description: 'Configure automated documentation updates and triggers after connecting to your repository provider and setting up your repository.',
    duration: '2 min',
    loomUrl: 'https://www.loom.com/share/5c0fc09b68654cd38b7b20a1aea57f2b',
    embedUrl: 'https://www.loom.com/embed/5c0fc09b68654cd38b7b20a1aea57f2b',
    steps: [
      'Navigate to the "Automation" page',
      'A list of your setup repositories will be displayed. Click the "Setup" button for the repository you want to configure automation for',
      'Configure the automation rule name, schedule, trigger conditions, notification preferences (coming soon), and publishing destinations (coming soon)',
      'Save the automation rule',
      'Enable the automation rule by clicking the toggle button'
    ]
  },
  {
    id: 'publish-docs',
    title: 'Publish Documentation to Knowledge Base',
    description: 'Learn how to publish your generated documentation to external knowledge bases after connecting to your repository provider and setting up your repository.',
    duration: '6 min',
    loomUrl: 'https://www.loom.com/share/1977426904b34c1e946394e3c422616b',
    embedUrl: 'https://www.loom.com/embed/1977426904b34c1e946394e3c422616b',
    steps: [
      'Navigate to the generated documentation you want to publish',
      'Click the "Publish" button in the documentation interface',
      'Select your preferred knowledge base platform (Notion, Confluence, Coda, etc.)',
      'Choose the destination workspace, page, or space for publishing',
      'Click "Publish" to send the documentation to your knowledge base',
      'Verify the publication by checking your knowledge base platform',
    ]
  }
];

export default function DocumentationPage() {
  return (
    <div className="min-h-screen px-4 py-12 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-6xl">
        <div className="mb-12 text-center">
          <div className="mb-6 inline-flex items-center gap-3">
            <div className="flex h-16 w-16 items-center justify-center rounded-2xl border border-white/30 bg-white/20 bg-gradient-to-r from-gray-500 to-gray-700 backdrop-blur-sm">
              <BookOpen className="h-8 w-8 text-white" />
            </div>
          </div>

          <h1 className="mb-4 text-4xl font-bold text-white">Video Tutorials</h1>
          <p className="text-xl text-white/80">Master Canon with our comprehensive video guides and step-by-step instructions.</p>
        </div>

        <div className="space-y-8">
          {tutorials.map((tutorial, index) => (
            <div key={tutorial.id} className="rounded-2xl border border-white/20 bg-white/10 backdrop-blur-md overflow-hidden">
              <div className="border-b border-white/10 px-6 py-6">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-2">
                      <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-r from-gray-500 to-gray-600 text-white font-semibold text-sm">
                        {index + 1}
                      </div>
                      <h2 className="text-2xl font-bold text-white">{tutorial.title}</h2>
                    </div>
                    <div className="flex items-center gap-4 mb-4">
                      <div className="flex items-center gap-2 text-white/60">
                        <Clock className="h-4 w-4" />
                        <span className="text-sm">{tutorial.duration}</span>
                      </div>
                      <a
                        href={tutorial.loomUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-2 text-gray-400 hover:text-white transition-colors text-sm"
                      >
                        <Play className="h-4 w-4" />
                        Watch on Loom
                      </a>
                    </div>
                    <p className="text-white/80 leading-relaxed mb-6">{tutorial.description}</p>

                    <div className="border-t border-white/10 pt-6">
                      <h3 className="text-lg font-semibold text-white mb-4">Step-by-Step Instructions</h3>
                      <ol className="space-y-2">
                        {tutorial.steps.map((step, stepIndex) => (
                          <li key={stepIndex} className="flex items-start gap-3 text-white/80">
                            <span className="flex h-6 w-6 items-center justify-center rounded-full bg-gray-600 text-white text-xs font-medium flex-shrink-0 mt-0.5">
                              {stepIndex + 1}
                            </span>
                            <span className="leading-relaxed">{step}</span>
                          </li>
                        ))}
                      </ol>
                    </div>
                  </div>
                </div>
              </div>

              <div className="p-6">
                <div className="aspect-video w-full">
                  <iframe
                    src={tutorial.embedUrl}
                    frameBorder="0"
                    allowFullScreen
                    className="w-full h-full rounded-lg"
                    title={tutorial.title}
                  />
                </div>
              </div>
            </div>
          ))}
        </div>

        <div className="mt-16 rounded-2xl border border-white/20 bg-white/10 backdrop-blur-md p-6">
          <div className="text-center">
            <h3 className="text-xl font-semibold text-white mb-4">Need More Help?</h3>
            <p className="text-white/80 mb-6">
              Can't find what you're looking for? Our support team is here to help.
            </p>
            <a
              href="mailto:support@usecannon.com"
              className="inline-flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-gray-500 to-gray-600 text-white rounded-lg hover:from-gray-600 hover:to-gray-700 transition-all font-medium"
            >
              Contact Support
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}

