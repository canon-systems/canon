import type { SupabaseClient } from '@supabase/supabase-js';
import { getUserOctokit } from '../github/getUserOctokit';
import { parseRepoUrl } from '../github/github';
import { LLMGateway } from './llmGateway';

type FileDiff = {
  path: string;
  patch?: string;
  additions?: number;
  deletions?: number;
  changes?: number;
  status: 'added' | 'removed' | 'modified' | 'renamed';
  old_path?: string;
};

type ChangeSignificanceResult = {
  isSignificant: boolean;
  reason: string;
  confidence: 'high' | 'medium' | 'low';
  technicalChanges: {
    level: 'major' | 'minor' | 'none';
    description: string;
    examples: string[];
    categories: Array<
      | 'api_contract'
      | 'data_structure'
      | 'architecture'
      | 'configuration'
      | 'dependency'
      | 'interface'
      | 'error_handling'
      | 'security'
      | 'performance'
      | 'integration'
      | 'schema'
      | 'type_system'
      | 'protocol'
      | 'serialization'
      | 'authentication'
      | 'authorization'
      | 'validation'
      | 'transformation'
      | 'routing'
      | 'middleware'
      | 'event_system'
      | 'state_management'
      | 'caching'
      | 'logging'
      | 'monitoring'
      | 'other'
    >;
  };
  businessLogicChanges: {
    level: 'major' | 'minor' | 'none';
    description: string;
    problemScopeChange?: 'expanded' | 'shifted' | 'narrowed' | 'unchanged';
    useCaseChanges?: string[];
    domainLogicChanges?: string[];
    featureChanges?: string[];
    workflowChanges?: string[];
    ruleChanges?: string[];
    calculationChanges?: string[];
    constraintChanges?: string[];
    category: Array<
      | 'scope_expansion'
      | 'scope_shift'
      | 'scope_narrowing'
      | 'use_case_addition'
      | 'use_case_modification'
      | 'use_case_removal'
      | 'domain_logic'
      | 'feature_addition'
      | 'feature_modification'
      | 'feature_removal'
      | 'workflow_change'
      | 'business_rule'
      | 'calculation'
      | 'pricing'
      | 'billing'
      | 'subscription'
      | 'access_control'
      | 'permissions'
      | 'data_access'
      | 'multi_tenancy'
      | 'localization'
      | 'compliance'
      | 'audit'
      | 'reporting'
      | 'analytics'
      | 'notification'
      | 'approval_workflow'
      | 'constraint'
      | 'validation_rule'
      | 'transformation_rule'
      | 'aggregation_rule'
      | 'other'
    >;
  };
  trivialChanges: Array<{ path: string; reason: string }>;
  significantChanges: Array<{ path: string; reason: string; category: 'technical' | 'business' | 'both' }>;
  summary: string;
  unavailableFiles?: Array<{ path: string; reason: string; commitSha: string }>;
};

/**
 * Fetch file contents at a specific commit for business logic analysis
 * Returns both the contents map and a list of files that couldn't be fetched
 */
async function fetchFileContentsAtCommit(
  octokit: Awaited<ReturnType<typeof getUserOctokit>>,
  owner: string,
  repo: string,
  commitSha: string,
  filePaths: string[]
): Promise<{ contents: Map<string, string>; unavailableFiles: Array<{ path: string; reason: string; commitSha: string }> }> {
  const contents = new Map<string, string>();
  const unavailableFiles: Array<{ path: string; reason: string; commitSha: string }> = [];

  for (const filePath of filePaths) {
    try {
      const { data } = await octokit.repos.getContent({
        owner,
        repo,
        path: filePath,
        ref: commitSha,
      });

      if (!Array.isArray(data) && data.type === 'file') {
        const content =
          data.encoding === 'base64' && typeof data.content === 'string'
            ? Buffer.from(data.content, 'base64').toString('utf-8')
            : (data.content as string);
        contents.set(filePath, content);
      }
    } catch (error: any) {
      // Track files that couldn't be fetched
      if (error?.status === 404) {
        unavailableFiles.push({
          path: filePath,
          reason: 'File does not exist at this commit (may have been renamed, moved, or deleted)',
          commitSha,
        });
      } else {
        unavailableFiles.push({
          path: filePath,
          reason: error?.message || `Failed to fetch file: ${error?.status || 'Unknown error'}`,
          commitSha,
        });
        console.warn(`Failed to fetch ${filePath} at commit ${commitSha}:`, error?.message || error);
      }
    }
  }

  return { contents, unavailableFiles };
}

/**
 * Analyze change significance using LLM with exhaustive technical and business logic analysis
 */
async function analyzeWithLLM(
  fileDiffs: FileDiff[],
  oldFileContents: Map<string, string>,
  newFileContents: Map<string, string>,
  model: string = 'gpt-4o-mini'
): Promise<ChangeSignificanceResult> {
  const gateway = new LLMGateway();

  // Build comprehensive context for analysis
  const fileAnalyses = fileDiffs.map(diff => {
    const oldContent = oldFileContents.get(diff.path) || (diff.old_path ? oldFileContents.get(diff.old_path) || '' : '');
    const newContent = newFileContents.get(diff.path) || '';
    const patch = diff.patch || '';

    // For modified files, include both old and new content (truncated if too long)
    const maxContentLength = 3000; // Increased for better context
    const oldPreview = oldContent.length > maxContentLength
      ? oldContent.slice(0, maxContentLength) + '\n... (truncated)'
      : oldContent;
    const newPreview = newContent.length > maxContentLength
      ? newContent.slice(0, maxContentLength) + '\n... (truncated)'
      : newContent;

    return `File: ${diff.path}
${diff.old_path ? `Old Path: ${diff.old_path}\n` : ''}Status: ${diff.status}
Changes: +${diff.additions || 0} / -${diff.deletions || 0} (${diff.changes || 0} total)

${diff.status === 'added' ? `NEW FILE CONTENT:\n${newPreview}` : ''}
${diff.status === 'removed' ? `REMOVED FILE (old content):\n${oldPreview}` : ''}
${diff.status === 'renamed' ? `RENAMED FROM: ${diff.old_path}\nOLD CONTENT:\n${oldPreview}\n\nNEW CONTENT:\n${newPreview}\n\nDIFF:\n${patch.slice(0, 4000)}` : ''}
${diff.status === 'modified' ? `OLD CONTENT:\n${oldPreview}\n\nNEW CONTENT:\n${newPreview}\n\nDIFF:\n${patch.slice(0, 4000)}` : ''}`;
  }).join('\n\n---\n\n');

  const systemPrompt = `You are an expert code reviewer, software architect, and business analyst with deep expertise in analyzing code changes for documentation impact.

Your analysis must be EXHAUSTIVE and consider ALL aspects of technical and business logic changes.

## EXHAUSTIVE TECHNICAL ANALYSIS

Evaluate ALL of the following technical dimensions:

### API Contracts & Interfaces
- Function/method signatures (parameters, return types, optional vs required)
- Class/interface definitions and their public methods
- REST API endpoints (routes, HTTP methods, request/response schemas)
- GraphQL schemas, queries, mutations, subscriptions
- RPC interfaces and service contracts
- WebSocket message formats and protocols
- gRPC service definitions and message types
- Event-driven interfaces (pub/sub, message queues)
- Webhook payloads and callbacks
- SDK/CLI command signatures
- Plugin/extension APIs
- Callback function signatures
- Promise/async contract changes
- Error response formats

### Data Structures & Schemas
- Database schema changes (tables, columns, indexes, constraints, foreign keys)
- ORM model definitions and relationships
- JSON/XML/YAML schema changes
- Protocol buffer definitions
- Avro/Thrift schema changes
- Graph database schemas
- Document database schemas
- Cache key structures
- Configuration file schemas
- Environment variable schemas
- Request/response body structures
- Query parameter structures
- Header structures
- Cookie structures
- Session data structures

### Type System Changes
- TypeScript type definitions
- Interface implementations
- Generic type parameters
- Union/intersection types
- Type guards and assertions
- Type narrowing changes
- Enum definitions
- Discriminated unions
- Type aliases
- Structural vs nominal typing changes

### Architecture Patterns
- New services, microservices, or modules
- Service boundaries and responsibilities
- Layered architecture changes (presentation, business, data layers)
- Design pattern implementations (factory, strategy, observer, etc.)
- Dependency injection changes
- Service locator patterns
- Repository patterns
- Unit of work patterns
- CQRS implementations
- Event sourcing changes
- Saga patterns
- Circuit breaker patterns
- Bulkhead patterns

### Dependencies & Integrations
- New external library dependencies
- Updated dependency versions (major/minor breaking changes)
- Removed dependencies
- Integration with new third-party services
- API client changes
- SDK version changes
- Protocol changes (HTTP/1.1 → HTTP/2, etc.)
- Authentication method changes for integrations
- Rate limiting changes
- Retry logic changes

### Configuration & Environment
- Environment variable additions/changes
- Configuration file structure changes
- Feature flag changes that affect behavior
- Deployment configuration changes
- Infrastructure as code changes
- Container configuration (Docker, Kubernetes)
- Build configuration changes
- Runtime configuration changes
- Feature toggle changes

### Security & Authentication
- Authentication mechanisms (OAuth, JWT, API keys, etc.)
- Authorization rules and permissions
- Role-based access control (RBAC) changes
- Attribute-based access control (ABAC) changes
- Security policy changes
- Encryption/decryption logic
- Hashing algorithms
- Token generation/validation
- Session management
- CSRF protection
- XSS protection
- SQL injection prevention
- Input sanitization
- Output encoding
- Security headers

### Error Handling & Validation
- Error types and error codes
- Exception handling strategies
- Validation rules (input, business, data)
- Validation error messages
- Error response formats
- Retry strategies
- Circuit breaker thresholds
- Timeout configurations
- Rate limiting rules

### Performance & Optimization
- Caching strategies (cache keys, TTL, invalidation)
- Database query optimization (indexes, query patterns)
- Lazy loading vs eager loading
- Pagination strategies
- Batch processing changes
- Async processing changes
- Background job changes
- Queue processing changes
- Memory management
- Connection pooling
- Resource pooling

### State Management
- Application state structure
- State machine transitions
- State persistence
- State synchronization
- State migration logic
- Redux/Flux store changes
- Context API changes
- Global state changes

### Event Systems
- Event types and payloads
- Event handlers and listeners
- Event routing
- Event filtering
- Event transformation
- Event aggregation
- Event sourcing changes

### Routing & Middleware
- Route definitions and patterns
- Route parameters
- Route guards and middleware
- Request pipeline changes
- Response pipeline changes
- Interceptor changes
- Filter changes

### Serialization & Transformation
- Data serialization formats
- Data transformation logic
- Mapping logic (DTOs, entities)
- Data normalization
- Data denormalization
- Format conversion logic

### Monitoring & Observability
- Logging structure and levels
- Metrics collection
- Tracing instrumentation
- Health check endpoints
- Diagnostic endpoints
- Telemetry changes

## EXHAUSTIVE BUSINESS LOGIC ANALYSIS

Evaluate ALL of the following business dimensions:

### Problem Scope Changes
- Scope Expansion: Code now solves MORE problems than before
  * Single-user → Multi-user
  * Single-tenant → Multi-tenant
  * Single-region → Multi-region
  * Single-currency → Multi-currency
  * Single-language → Multi-language
  * Single-timezone → Multi-timezone
  * Single-organization → Multi-organization
  * Single-project → Multi-project
  * Single-workspace → Multi-workspace
  * Single-environment → Multi-environment
  * Single-channel → Multi-channel
  * Single-platform → Multi-platform
  * Single-format → Multi-format
  * Single-protocol → Multi-protocol
  * Single-integration → Multi-integration
  * Single-workflow → Multi-workflow
  * Single-role → Multi-role
  * Single-permission-model → Multi-permission-model
  * Single-billing-model → Multi-billing-model
  * Single-subscription-tier → Multi-subscription-tier

- Scope Shift: Code now solves a COMPLETELY DIFFERENT problem
  * E-commerce → Analytics platform
  * Content management → Data processing
  * User management → Resource management
  * Payment processing → Reporting
  * Communication → Collaboration
  * Storage → Computation
  * Synchronization → Real-time streaming
  * Batch processing → Event-driven
  * Monolithic → Distributed
  * On-premise → Cloud-native

- Scope Narrowing: Code now solves FEWER problems (features removed)
  * Multi-user → Single-user
  * Multi-tenant → Single-tenant
  * General-purpose → Specialized

### Use Case Changes
- New use cases added
- Existing use cases modified (behavior changed)
- Use cases removed
- Use case workflows changed
- Use case prerequisites changed
- Use case outcomes changed
- Use case error scenarios changed
- Use case edge cases handled differently

### Domain Logic Changes
- Business rules modified
- Business constraints changed
- Business validations changed
- Business calculations changed
- Business transformations changed
- Business aggregations changed
- Business derivations changed
- Business derivations added/removed

### Feature Changes
- New features added
- Features modified (capabilities changed)
- Features removed
- Feature dependencies changed
- Feature interactions changed
- Feature configurations changed
- Feature defaults changed

### Workflow Changes
- Workflow steps added/removed/modified
- Workflow transitions changed
- Workflow conditions changed
- Workflow approvals changed
- Workflow notifications changed
- Workflow escalations changed
- Workflow timeouts changed
- Workflow retries changed
- Workflow branching logic changed
- Workflow parallelization changed
- Workflow state persistence changed

### Business Rules
- Pricing rules (flat, tiered, usage-based, dynamic)
- Billing rules (frequency, proration, discounts)
- Subscription rules (tiers, limits, upgrades, downgrades)
- Access control rules (who can do what, when, where)
- Permission rules (read, write, delete, admin, custom)
- Data access rules (row-level, column-level, field-level)
- Multi-tenancy rules (isolation, sharing, inheritance)
- Localization rules (language, currency, date format, timezone)
- Compliance rules (GDPR, HIPAA, SOC2, PCI-DSS)
- Audit rules (what to log, retention, access)
- Reporting rules (what data, format, frequency)
- Analytics rules (metrics, dimensions, aggregations)
- Notification rules (triggers, channels, frequency)
- Approval workflow rules (who approves, escalation)
- Constraint rules (business constraints, data constraints)
- Validation rules (input validation, business validation)
- Transformation rules (data transformation, format conversion)
- Aggregation rules (how data is aggregated, grouped, summarized)

### Calculation Changes
- Pricing calculations
- Billing calculations
- Tax calculations
- Discount calculations
- Commission calculations
- Fee calculations
- Interest calculations
- Exchange rate calculations
- Unit conversion calculations
- Statistical calculations
- Aggregation calculations
- Time-based calculations
- Distance calculations
- Quantity calculations
- Percentage calculations
- Ratio calculations

### Constraint Changes
- Business constraints (must have X before Y, cannot do Z if W)
- Data constraints (required fields, value ranges, formats)
- Temporal constraints (time windows, deadlines, schedules)
- Resource constraints (limits, quotas, capacity)
- Relationship constraints (one-to-one, one-to-many, many-to-many)
- Dependency constraints (requires, conflicts with)
- State constraints (valid transitions, invalid states)

### Data Access & Permissions
- Row-level security changes
- Column-level security changes
- Field-level security changes
- Role-based permissions
- Attribute-based permissions
- Time-based permissions
- Location-based permissions
- Context-based permissions
- Delegation permissions
- Inheritance permissions

### Multi-Tenancy
- Tenant isolation mechanisms
- Tenant data sharing rules
- Tenant configuration inheritance
- Tenant-specific customizations
- Tenant resource limits
- Tenant billing isolation

### Localization & Internationalization
- Language support
- Currency support
- Date/time format support
- Number format support
- Address format support
- Phone number format support
- Timezone handling
- Cultural adaptations

### Compliance & Audit
- Data retention policies
- Data deletion policies
- Data access logging
- Audit trail changes
- Compliance rule enforcement
- Regulatory requirement changes

### Reporting & Analytics
- Report definitions
- Report parameters
- Report formats
- Analytics metrics
- Analytics dimensions
- Analytics aggregations
- Dashboard configurations
- Data visualization changes

### Notifications & Communication
- Notification triggers
- Notification channels
- Notification templates
- Notification frequency rules
- Notification preference handling
- Email templates
- SMS templates
- Push notification logic

## TRIVIAL CHANGES (do NOT warrant regeneration)

ONLY these are trivial:
- Comments only (adding/removing/modifying comments, docstrings, JSDoc)
- Whitespace, formatting, indentation, or style-only changes
- Color/styling changes in CSS/SCSS/SASS/LESS files (unless they change functionality)
- Import statement reordering (same imports, different order)
- Variable/function name changes that are purely cosmetic (same behavior)
- Code style changes (semicolons, quotes, etc.)
- Version number bumps (patch/minor, unless major with breaking changes)
- Test file changes (unless they reveal new public APIs)
- Documentation file changes (README, CHANGELOG, etc.)
- Asset file changes (images, fonts, icons, etc.)
- Refactoring that doesn't change behavior, interface, or business logic
- Linter/formatting fixes only
- Build script changes that don't affect output
- CI/CD configuration that doesn't affect behavior

## SIGNIFICANT CHANGES (DO warrant regeneration)

ANY of the following warrant regeneration:
- ANY change to public APIs, interfaces, or contracts
- ANY change to business logic, rules, or calculations
- ANY change to data structures, schemas, or types
- ANY change to authentication, authorization, or security
- ANY change to workflows, processes, or state machines
- ANY problem scope change (expansion, shift, narrowing)
- ANY use case change (addition, modification, removal)
- ANY feature change (addition, modification, removal)
- ANY configuration change that affects behavior
- ANY dependency change that affects behavior
- ANY integration change
- ANY breaking change
- ANY change that affects what the system DOES (not just how it looks)
- File renames (always significant - path changes)

## OUTPUT FORMAT

Respond with a JSON object in this exact format:
{
  "isSignificant": boolean,
  "reason": "brief explanation",
  "confidence": "high" | "medium" | "low",
  "technicalChanges": {
    "level": "major" | "minor" | "none",
    "description": "comprehensive description of ALL technical changes",
    "examples": ["specific example 1", "specific example 2"],
    "categories": ["api_contract", "data_structure", ...] // ALL applicable categories
  },
  "businessLogicChanges": {
    "level": "major" | "minor" | "none",
    "description": "comprehensive description of ALL business logic changes",
    "problemScopeChange": "expanded" | "shifted" | "narrowed" | "unchanged" (only if level is not "none"),
    "useCaseChanges": ["specific use case change 1", "specific use case change 2"],
    "domainLogicChanges": ["specific domain logic change 1", "specific domain logic change 2"],
    "featureChanges": ["specific feature change 1", "specific feature change 2"],
    "workflowChanges": ["specific workflow change 1", "specific workflow change 2"],
    "ruleChanges": ["specific rule change 1", "specific rule change 2"],
    "calculationChanges": ["specific calculation change 1", "specific calculation change 2"],
    "constraintChanges": ["specific constraint change 1", "specific constraint change 2"],
    "category": ["scope_expansion", "use_case_addition", ...] // ALL applicable categories
  },
  "trivialChanges": [{"path": "file/path", "reason": "why trivial"}],
  "significantChanges": [{"path": "file/path", "reason": "why significant", "category": "technical" | "business" | "both"}],
  "summary": "comprehensive one sentence summary covering both technical and business aspects"
}

Be THOROUGH and EXHAUSTIVE. Consider every dimension listed above. Don't miss subtle but important changes.`;

  const userPrompt = `Analyze these code changes EXHAUSTIVELY, considering ALL technical and business logic dimensions:

${fileAnalyses}

Analyze systematically:

1. TECHNICAL ANALYSIS - Go through EVERY category:
   - API contracts, interfaces, signatures
   - Data structures, schemas, types
   - Architecture patterns, services, modules
   - Dependencies, integrations, protocols
   - Configuration, environment, feature flags
   - Security, authentication, authorization
   - Error handling, validation, retries
   - Performance, caching, optimization
   - State management, events, routing
   - Serialization, transformation, monitoring

2. BUSINESS LOGIC ANALYSIS - Go through EVERY category:
   - Problem scope (expanded? shifted? narrowed?)
   - Use cases (added? modified? removed?)
   - Domain logic (rules, constraints, validations)
   - Features (added? modified? removed?)
   - Workflows (steps, transitions, conditions)
   - Business rules (pricing, billing, subscriptions, access control, permissions, multi-tenancy, localization, compliance, audit, reporting, analytics, notifications, approvals, constraints, validations, transformations, aggregations)
   - Calculations (pricing, billing, tax, discounts, commissions, fees, interest, exchange rates, unit conversions, statistics, aggregations, time-based, distance, quantity, percentage, ratio)
   - Constraints (business, data, temporal, resource, relationship, dependency, state)

3. CONTEXT MATTERS:
   - Consider what the code DOES, not just syntax
   - A small business logic change can be more significant than a large refactor
   - Problem scope changes are ALWAYS significant
   - Use case changes are ALWAYS significant
   - Feature changes are ALWAYS significant
   - Workflow changes are ALWAYS significant
   - Business rule changes are ALWAYS significant
   - File renames are ALWAYS significant

Be EXHAUSTIVE. List ALL categories that apply. Don't miss anything.

Respond with ONLY valid JSON, no additional text or markdown formatting.`;

  try {
    const response = await gateway.call(
      [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      model,
      0.1 // Low temperature for more deterministic results
    );

    // Parse JSON response (handle markdown code blocks if present)
    let jsonStr = response.trim();
    if (jsonStr.startsWith('```')) {
      jsonStr = jsonStr.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '');
    }

    const parsed = JSON.parse(jsonStr);

    // Validate and structure the response
    return {
      isSignificant: parsed.isSignificant === true,
      reason: parsed.reason || 'Analyzed by LLM',
      confidence: parsed.confidence || 'medium',
      technicalChanges: {
        level: parsed.technicalChanges?.level || 'none',
        description: parsed.technicalChanges?.description || '',
        examples: parsed.technicalChanges?.examples || [],
        categories: parsed.technicalChanges?.categories || [],
      },
      businessLogicChanges: {
        level: parsed.businessLogicChanges?.level || 'none',
        description: parsed.businessLogicChanges?.description || '',
        problemScopeChange: parsed.businessLogicChanges?.problemScopeChange,
        useCaseChanges: parsed.businessLogicChanges?.useCaseChanges || [],
        domainLogicChanges: parsed.businessLogicChanges?.domainLogicChanges || [],
        featureChanges: parsed.businessLogicChanges?.featureChanges || [],
        workflowChanges: parsed.businessLogicChanges?.workflowChanges || [],
        ruleChanges: parsed.businessLogicChanges?.ruleChanges || [],
        calculationChanges: parsed.businessLogicChanges?.calculationChanges || [],
        constraintChanges: parsed.businessLogicChanges?.constraintChanges || [],
        category: parsed.businessLogicChanges?.category || [],
      },
      trivialChanges: parsed.trivialChanges || [],
      significantChanges: parsed.significantChanges || [],
      summary: parsed.summary || 'Change analysis completed',
    };
  } catch (error) {
    console.error('LLM analysis failed:', error);
    // Fallback: consider all changes significant if LLM fails
    return {
      isSignificant: true,
      reason: 'LLM analysis failed, defaulting to significant',
      confidence: 'low',
      technicalChanges: {
        level: 'major',
        description: 'Analysis failed',
        examples: [],
        categories: [],
      },
      businessLogicChanges: {
        level: 'major',
        description: 'Analysis failed',
        useCaseChanges: [],
        domainLogicChanges: [],
        featureChanges: [],
        workflowChanges: [],
        ruleChanges: [],
        calculationChanges: [],
        constraintChanges: [],
        category: [],
      },
      trivialChanges: [],
      significantChanges: fileDiffs.map(d => ({
        path: d.path,
        reason: 'LLM analysis failed',
        category: 'both' as const
      })),
      summary: 'Analysis completed with fallback (LLM failed)',
    };
  }
}

/**
 * Analyze changes between two commits to determine if documentation should be regenerated
 * Uses full LLM analysis with exhaustive technical and business logic considerations
 */
export async function analyzeChangeSignificance(
  supabase: SupabaseClient,
  userId: string,
  repoUrl: string,
  branch: string,
  oldCommitSha: string | null,
  newCommitSha: string,
  changedFiles: Array<{ path: string; oldHash: string | null; newHash: string | null; old_path?: string; status?: string }>,
  options?: {
    model?: string;
  }
): Promise<ChangeSignificanceResult> {
  if (!oldCommitSha) {
    // No previous commit means this is a new submission - always significant
    return {
      isSignificant: true,
      reason: 'No previous commit found (new submission)',
      confidence: 'high',
      technicalChanges: {
        level: 'major',
        description: 'New submission - all files are new',
        examples: changedFiles.map(f => f.path),
        categories: ['other'],
      },
      businessLogicChanges: {
        level: 'major',
        description: 'New submission - initial implementation',
        problemScopeChange: 'unchanged',
        useCaseChanges: [],
        domainLogicChanges: [],
        featureChanges: [],
        workflowChanges: [],
        ruleChanges: [],
        calculationChanges: [],
        constraintChanges: [],
        category: ['other'],
      },
      trivialChanges: [],
      significantChanges: changedFiles.map(f => ({
        path: f.path,
        reason: 'New file',
        category: 'both' as const
      })),
      summary: 'New submission - all changes are significant',
    };
  }

  if (oldCommitSha === newCommitSha) {
    return {
      isSignificant: false,
      reason: 'No commit changes detected',
      confidence: 'high',
      technicalChanges: {
        level: 'none',
        description: 'No changes',
        examples: [],
        categories: [],
      },
      businessLogicChanges: {
        level: 'none',
        description: 'No changes',
        useCaseChanges: [],
        domainLogicChanges: [],
        featureChanges: [],
        workflowChanges: [],
        ruleChanges: [],
        calculationChanges: [],
        constraintChanges: [],
        category: [],
      },
      trivialChanges: [],
      significantChanges: [],
      summary: 'No changes detected',
    };
  }

  if (changedFiles.length === 0) {
    return {
      isSignificant: false,
      reason: 'No files changed',
      confidence: 'high',
      technicalChanges: {
        level: 'none',
        description: 'No file changes',
        examples: [],
        categories: [],
      },
      businessLogicChanges: {
        level: 'none',
        description: 'No file changes',
        useCaseChanges: [],
        domainLogicChanges: [],
        featureChanges: [],
        workflowChanges: [],
        ruleChanges: [],
        calculationChanges: [],
        constraintChanges: [],
        category: [],
      },
      trivialChanges: [],
      significantChanges: [],
      summary: 'No files changed',
    };
  }

  const octokit = await getUserOctokit(supabase, userId);
  const parsed = parseRepoUrl(repoUrl);
  if (!parsed) {
    throw new Error(`Invalid GitHub URL: ${repoUrl}`);
  }

  const { owner, repo } = parsed;

  // Get the diff between commits
  let fileDiffs: FileDiff[] = [];
  try {
    const { data: compareData } = await octokit.repos.compareCommits({
      owner,
      repo,
      base: oldCommitSha,
      head: newCommitSha,
    });

    fileDiffs = (compareData.files || []).map(file => ({
      path: file.filename,
      patch: file.patch,
      additions: file.additions,
      deletions: file.deletions,
      changes: file.changes,
      status: (file.status === 'renamed' ? 'renamed' :
        file.status === 'added' ? 'added' :
          file.status === 'removed' ? 'removed' :
            'modified') as FileDiff['status'],
      old_path: file.previous_filename || undefined,
    }));
  } catch (error) {
    console.warn('Failed to fetch commit diff:', error);
    // Fallback: create basic file diffs from changedFiles
    fileDiffs = changedFiles.map(file => ({
      path: file.path,
      status: (file.status as FileDiff['status']) || 'modified',
      old_path: file.old_path,
    }));
  }

  // Fetch file contents at both commits for comprehensive business logic analysis
  const allFilePaths = Array.from(new Set([
    ...fileDiffs.map(d => d.path),
    ...fileDiffs.filter(d => d.old_path).map(d => d.old_path!),
    ...changedFiles.map(f => f.path),
    ...changedFiles.filter(f => f.old_path).map(f => f.old_path!),
  ]));

  const [oldFileResult, newFileResult] = await Promise.all([
    fetchFileContentsAtCommit(octokit, owner, repo, oldCommitSha, allFilePaths),
    fetchFileContentsAtCommit(octokit, owner, repo, newCommitSha, allFilePaths),
  ]);

  const oldFileContents = oldFileResult.contents;
  const newFileContents = newFileResult.contents;
  const unavailableFiles = [...oldFileResult.unavailableFiles, ...newFileResult.unavailableFiles];

  // Use LLM for exhaustive comprehensive analysis
  const model = options?.model || 'gpt-4o-mini';
  const result = await analyzeWithLLM(fileDiffs, oldFileContents, newFileContents, model);

  // Add unavailable files information to the result
  if (unavailableFiles.length > 0) {
    result.unavailableFiles = unavailableFiles;
  }

  return result;
}

