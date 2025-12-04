import type { SupabaseClient } from '@supabase/supabase-js';

type RuleConfig = {
	id?: string;
	name?: string;
	schedule?: string;
	enabled?: boolean;

	// WHEN: Trigger conditions (simplified)
	detect_changes?: boolean; // Always true for smart automation

	// WHAT: Actions (simplified to presets)
	action_preset: 'docs_only' | 'diagrams_only' | 'docs_and_diagrams' | 'full_auto_publish';

	// SIGNIFICANCE: Always required for smart automation
	significance_analysis: {
		sensitivity: 'strict' | 'balanced' | 'lenient';
		minimum_confidence: 'high' | 'medium' | 'low';
		require_technical_changes?: boolean;
		require_business_changes?: boolean;
	};

	// SCOPE: What to process (empty = all)
	target_documents?: string[]; // Document IDs to process (empty = all)
	target_diagrams?: string[];  // Diagram IDs to process (empty = all)

	// NOTIFICATIONS: Always enabled for smart automation
	notifications: {
		email_enabled: boolean;
		include_preview_links: boolean;
	};

	// PUBLISHING: Where to publish approved content
	publish_targets?: {
		knowledge_bases?: Array<{
			provider: 'notion' | 'confluence' | 'coda';
			id: string;
			name: string;
		}>;
	};

	// LEGACY: Keep for backward compatibility
	generate_doc?: boolean;
	generate_diagram?: boolean;
	auto_publish?: boolean;
	auto_publish_new_docs?: boolean;
	auto_publish_max_changes?: number;
	auto_publish_max_change_percentage?: number;
	auto_publish_target?: Record<string, unknown>;
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

export function calculateNextRunAt(schedule: string, fromTime: Date = new Date()): Date {
	const parsed = parseSchedule(schedule);
	const nextTime = new Date(fromTime);

	switch (parsed.schedule_type) {
		case 'daily':
			nextTime.setHours(parsed.schedule_config.hour || 0, parsed.schedule_config.minute || 0, 0, 0);
			if (nextTime <= fromTime) {
				nextTime.setDate(nextTime.getDate() + 1);
			}
			break;

		case 'weekly':
			const targetDay = parsed.schedule_config.day_of_week || 0;
			const currentDay = fromTime.getDay();
			const daysUntilTarget = (targetDay - currentDay + 7) % 7;
			// If it's today but already past the scheduled time, move to next week
			const daysToAdd = (daysUntilTarget === 0 &&
				(fromTime.getHours() > (parsed.schedule_config.hour || 0) ||
				 (fromTime.getHours() === (parsed.schedule_config.hour || 0) &&
				  fromTime.getMinutes() >= (parsed.schedule_config.minute || 0))))
				? 7 : daysUntilTarget;

			nextTime.setDate(fromTime.getDate() + daysToAdd);
			nextTime.setHours(parsed.schedule_config.hour || 0, parsed.schedule_config.minute || 0, 0, 0);
			break;

		case 'interval':
			if (parsed.schedule_config.hours) {
				nextTime.setTime(fromTime.getTime() + (parsed.schedule_config.hours * 60 * 60 * 1000));
			} else if (parsed.schedule_config.minutes) {
				nextTime.setTime(fromTime.getTime() + (parsed.schedule_config.minutes * 60 * 1000));
			} else {
				// Default to 24 hours
				nextTime.setTime(fromTime.getTime() + (24 * 60 * 60 * 1000));
			}
			break;

		default:
			// Default to daily at midnight
			nextTime.setHours(0, 0, 0, 0);
			if (nextTime <= fromTime) {
				nextTime.setDate(nextTime.getDate() + 1);
			}
	}

	return nextTime;
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

export async function getRulesForRepo(supabase: SupabaseClient, repoId: string, workspaceId: string): Promise<RuleConfig[]> {
	const { data, error } = await supabase
		.from('automation_rules')
		.select('*')
		.eq('repo_id', repoId);

	if (error) {
		console.error('Error fetching automation rules:', error);
		return [];
	}

	// Convert back to RuleConfig format for compatibility
	return (data || []).map(rule => ({
		id: rule.rule_id,
		name: rule.name,
		enabled: rule.enabled,
		schedule: rule.schedule,
		action_preset: rule.action_preset,
		significance_analysis: rule.significance_analysis,
		target_documents: rule.target_documents,
		target_diagrams: rule.target_diagrams,
		notifications: rule.notifications,
		publish_targets: rule.publish_targets,
		// Legacy fields
		generate_doc: rule.generate_doc,
		generate_diagram: rule.generate_diagram,
		auto_publish: rule.auto_publish,
		auto_publish_new_docs: rule.auto_publish_new_docs,
		auto_publish_max_changes: rule.auto_publish_max_changes,
		auto_publish_max_change_percentage: rule.auto_publish_max_change_percentage,
		auto_publish_target: rule.auto_publish_target,
	}));
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
): Promise<AutomationRuleEntry[]> {
	let query = supabase
		.from('automation_rules')
		.select(`
			*,
			workspace_repos!inner(*)
		`)
		.eq('enabled', true)
		.lte('next_run_at', new Date().toISOString());

	if (workspaceId) {
		query = query.eq('workspace_id', workspaceId);
	}

	const { data, error } = await query;

	if (error) {
		console.error('Error fetching due rules:', error);
		return [];
	}

	return (data || []).map(row => ({
		repo_id: row.repo_id,
		repo: row.workspace_repos,
		rule: {
			id: row.rule_id,
			name: row.name,
			enabled: row.enabled,
			schedule: row.schedule,
			action_preset: row.action_preset,
			significance_analysis: row.significance_analysis,
			target_documents: row.target_documents,
			target_diagrams: row.target_diagrams,
			notifications: row.notifications,
			publish_targets: row.publish_targets,
			// Legacy fields
			generate_doc: row.generate_doc,
			generate_diagram: row.generate_diagram,
			auto_publish: row.auto_publish,
			auto_publish_new_docs: row.auto_publish_new_docs,
			auto_publish_max_changes: row.auto_publish_max_changes,
			auto_publish_max_change_percentage: row.auto_publish_max_change_percentage,
			auto_publish_target: row.auto_publish_target,
		},
		rule_id: row.rule_id,
	}));
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
): Promise<void> {
	const now = new Date();
	const nowIso = now.toISOString();
	const updateData: any = {
		last_run_at: nowIso,
	};

	if (execution) {
		updateData.last_run_status = execution.success ?
			(execution.skipped ? 'skipped' : 'success') : 'failed';
		updateData.last_run_error = execution.errors?.length > 0 ?
			execution.errors.join('; ') : null;
	}

	// First get the rule to calculate next run time
	const { data: rule } = await supabase
		.from('automation_rules')
		.select('schedule, enabled')
		.eq('repo_id', repoId)
		.eq('rule_id', ruleId)
		.single();

	// Calculate next run time if rule has a schedule and is enabled
	if (rule?.schedule && rule?.enabled) {
		const nextRun = calculateNextRunAt(rule.schedule, now);
		updateData.next_run_at = nextRun.toISOString();
	}

	// Update the automation rule
	const { error } = await supabase
		.from('automation_rules')
		.update(updateData)
		.eq('repo_id', repoId)
		.eq('rule_id', ruleId);

	if (error) {
		console.error('Error updating automation rule:', error);
	}

	// Still insert into automation_runs table for execution history
	if (execution) {
		const { error: insertError } = await supabase
			.from('automation_runs')
			.insert({
				repo_id: repoId,
				rule_id: ruleId,
				workspace_id: workspaceId,
				executed_at: nowIso,
				trigger_type: execution.trigger || 'scheduled',
				success: execution.success,
				skipped: execution.skipped || false,
				skip_reason: execution.skipReason,
				actions: execution.actions || [],
				doc_id: execution.docId || null,
				diagram_id: execution.diagramId || null,
				publish_status: execution.publishStatus,
				publish_provider: execution.publishProvider,
				publish_resource_id: execution.publishResourceId,
				errors: execution.errors || [],
			});

		if (insertError) {
			console.error('Failed to insert automation run:', insertError);
		}
	}
}

