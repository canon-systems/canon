import type { SupabaseClient } from '@supabase/supabase-js';

type RuleConfig = {
	id?: string;
	name?: string;
	schedule?: string;
	enabled?: boolean;
	detect_changes?: boolean;
	generate_doc?: boolean;
	generate_diagram?: boolean;
	auto_publish?: boolean;
	auto_publish_new_docs?: boolean;
	auto_publish_max_changes?: number;
	auto_publish_max_change_percentage?: number;
	auto_publish_target?: Record<string, unknown>;
	significance_analysis?: {
		enabled?: boolean; // Default: true
		sensitivity?: 'strict' | 'balanced' | 'lenient'; // Default: 'balanced'
		require_technical_changes?: boolean; // Default: false
		require_business_changes?: boolean; // Default: false
		minimum_confidence?: 'high' | 'medium' | 'low'; // Default: 'medium'
	};
};

export function parseSchedule(schedule: string) {
	const normalized = schedule.trim().toLowerCase();

	if (['every_night', 'daily', 'nightly'].includes(normalized)) {
		return { schedule_type: 'daily', schedule_config: { hour: 0, minute: 0 } };
	}

	if (normalized === 'every_monday' || normalized === 'every_week') {
		return { schedule_type: 'weekly', schedule_config: { day_of_week: 0, hour: 0, minute: 0 } };
	}

	if (normalized.startsWith('cron:')) {
		const cronExpr = normalized.slice(5).trim();
		// Parse simple cron expressions: "minute hour * * *" (daily) or "minute hour * * dayOfWeek" (weekly)
		const parts = cronExpr.split(/\s+/);
		if (parts.length >= 2) {
			const minute = parseInt(parts[0], 10);
			const hour = parseInt(parts[1], 10);
			if (parts.length >= 5 && parts[4] !== '*') {
				// Weekly schedule: has day of week specified
				const dayOfWeek = parseInt(parts[4], 10);
				return { schedule_type: 'weekly', schedule_config: { day_of_week: dayOfWeek, hour, minute } };
			} else {
				// Daily schedule
				return { schedule_type: 'daily', schedule_config: { hour, minute } };
			}
		}
		// Fallback: store as cron expression for complex cases
		return { schedule_type: 'cron', schedule_config: { expression: cronExpr } };
	}

	if (normalized.startsWith('interval:')) {
		// Support interval:Xm (minutes), interval:Xh (hours), interval:Xd (days)
		const match = normalized.slice(9).trim().match(/^(\d+)([mhd])$/);
		if (match) {
			const value = Number(match[1]);
			const unit = match[2];
			// Convert to hours for consistent comparison
			const hours = unit === 'm' ? value / 60 : unit === 'd' ? value * 24 : value;
			return { schedule_type: 'interval', schedule_config: { hours, minutes: unit === 'm' ? value : undefined } };
		}
	}

	return { schedule_type: 'daily', schedule_config: { hour: 0, minute: 0 } };
}

export function isRuleDue(rule: RuleConfig, lastRunAt?: string, currentTime = new Date()) {
	const schedule = rule.schedule;
	if (!schedule) return false;

	const parsed = parseSchedule(schedule);
	const { schedule_type, schedule_config } = parsed;

	if (!lastRunAt) {
		if (schedule_type === 'daily') {
			// Allow 1-minute window tolerance since checker runs every minute
			const minute = schedule_config.minute ?? 0;
			const minuteDiff = Math.abs(currentTime.getUTCMinutes() - minute);
			return (
				currentTime.getUTCHours() === schedule_config.hour &&
				minuteDiff <= 1
			);
		}
		if (schedule_type === 'weekly') {
			// Allow 1-minute window tolerance since checker runs every minute
			const minute = schedule_config.minute ?? 0;
			const minuteDiff = Math.abs(currentTime.getUTCMinutes() - minute);
			return (
				currentTime.getUTCDay() === schedule_config.day_of_week &&
				currentTime.getUTCHours() === schedule_config.hour &&
				minuteDiff <= 1
			);
		}
		// For interval schedules without lastRunAt, check if enough time has passed
		if (schedule_type === 'interval') {
			// This shouldn't happen in practice, but if it does, allow it to run
			return true;
		}
		return false;
	}

	const lastRun = new Date(lastRunAt);
	const diffMs = currentTime.getTime() - lastRun.getTime();
	const diffHours = diffMs / 1000 / 60 / 60;
	const diffMinutes = diffMs / 1000 / 60;

	if (schedule_type === 'daily') {
		// Allow 1-minute window tolerance since checker runs every minute
		const minute = schedule_config.minute ?? 0;
		const minuteDiff = Math.abs(currentTime.getUTCMinutes() - minute);
		return (
			diffHours >= 23 &&
			currentTime.getUTCHours() === schedule_config.hour &&
			minuteDiff <= 1
		);
	}

	if (schedule_type === 'weekly') {
		// Allow 1-minute window tolerance since checker runs every minute
		const minute = schedule_config.minute ?? 0;
		const minuteDiff = Math.abs(currentTime.getUTCMinutes() - minute);
		const daysSince = diffMs / 1000 / 60 / 60 / 24;
		return (
			daysSince >= 6 &&
			currentTime.getUTCDay() === schedule_config.day_of_week &&
			currentTime.getUTCHours() === schedule_config.hour &&
			minuteDiff <= 1
		);
	}

	if (schedule_type === 'interval') {
		// Handle minute-based intervals
		if (schedule_config.minutes !== undefined) {
			return diffMinutes >= schedule_config.minutes;
		}
		// Handle hour/day-based intervals
		return diffHours >= (schedule_config.hours || 24);
	}

	// Handle complex cron expressions (fallback case)
	if (schedule_type === 'cron') {
		// Complex cron expressions that couldn't be parsed as daily/weekly
		// These would need a full cron parser - for now, skip them
		// In practice, most cron expressions should be parsed as daily/weekly above
		return false;
	}

	return false;
}

export async function getRulesForRepo(supabase: SupabaseClient, repoId: string, workspaceId: string) {
	const response = await supabase
		.from('workspace_repos')
		.select('settings')
		.eq('id', repoId)
		.eq('workspace_id', workspaceId)
		.single();

	if (!response || !response.data) return [];

	const settings = response.data.settings || {};
	if (!Array.isArray(settings.automation_rules)) {
		return [];
	}

	return settings.automation_rules as RuleConfig[];
}

export type AutomationRuleEntry = {
	repo_id: string;
	repo: any;
	rule: RuleConfig;
	rule_id: string;
};

export async function getDueRules(
	supabase: SupabaseClient,
	workspaceId?: string | null
) {
	const query = supabase.from('workspace_repos').select('*');
	if (workspaceId) {
		query.eq('workspace_id', workspaceId);
	}

	const result = await query;
	if (!result || !result.data) return [];

	const currentTime = new Date();
	const dueRules: AutomationRuleEntry[] = [];

	for (const repo of result.data) {
		const settings = repo.settings || {};
		const rules = Array.isArray(settings.automation_rules) ? settings.automation_rules : [];
		const metadata = settings.automation_metadata || {};

		for (const rule of rules) {
			if (!rule.enabled) continue;

			const ruleId = rule.id || rule.name || 'default';
			const lastRun = metadata?.[ruleId]?.last_run_at;

			if (isRuleDue(rule, lastRun, currentTime)) {
				dueRules.push({
					repo,
					repo_id: repo.id,
					rule,
					rule_id: ruleId,
				});
			}
		}
	}

	return dueRules;
}

export type ExecutionResult = {
	success: boolean;
	actions: string[];
	errors: string[];
	docId?: string | null;
	diagramId?: string | null;
	skipped?: boolean;
	skipReason?: string;
	publishStatus?: string;
	publishProvider?: string;
	publishResourceId?: string;
	trigger?: 'manual' | 'scheduled';
};

export async function updateRuleLastRun(
	supabase: SupabaseClient,
	repoId: string,
	ruleId: string,
	workspaceId: string,
	execution?: ExecutionResult
) {
	const response = await supabase
		.from('workspace_repos')
		.select('settings')
		.eq('id', repoId)
		.eq('workspace_id', workspaceId)
		.single();

	if (!response || !response.data) return;

	const settings = response.data.settings || {};
	const metadata = settings.automation_metadata || {};
	const existingMetadata = metadata[ruleId] || {};

	// Build execution history entry
	const executionEntry = {
		timestamp: new Date().toISOString(),
		success: execution?.success ?? false,
		skipped: execution?.skipped ?? false,
		skip_reason: execution?.skipReason,
		actions: execution?.actions || [],
		doc_id: execution?.docId || null,
		diagram_id: execution?.diagramId || null,
		errors: execution?.errors || [],
		publish_status: execution?.publishStatus,
		publish_provider: execution?.publishProvider,
		publish_resource_id: execution?.publishResourceId,
		trigger: execution?.trigger || 'scheduled',
	};

	// Maintain execution history (last 10 runs)
	const existingHistory = existingMetadata.execution_history || [];
	const executionHistory = [
		executionEntry,
		...existingHistory.slice(0, 9), // Keep last 10 executions
	];

	metadata[ruleId] = {
		...existingMetadata,
		last_run_at: new Date().toISOString(),
		last_run_status: execution?.success ? (execution.skipped ? 'skipped' : 'success') : 'failed',
		last_run_error: execution?.errors && execution.errors.length > 0 ? execution.errors.join('; ') : null,
		last_execution: executionEntry,
		execution_history: executionHistory,
	};

	settings.automation_metadata = metadata;

	await supabase
		.from('workspace_repos')
		.update({
			settings,
			updated_at: new Date().toISOString(),
		})
		.eq('id', repoId);
}

