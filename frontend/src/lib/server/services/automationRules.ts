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
		return { schedule_type: 'cron', schedule_config: { expression: normalized.slice(5).trim() } };
	}

	if (normalized.startsWith('interval:')) {
		const match = normalized.slice(9).trim().match(/^(\d+)([hd])$/);
		if (match) {
			const value = Number(match[1]);
			const unit = match[2];
			const hours = unit === 'd' ? value * 24 : value;
			return { schedule_type: 'interval', schedule_config: { hours } };
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
			return (
				currentTime.getUTCHours() === schedule_config.hour &&
				currentTime.getUTCMinutes() === schedule_config.minute
			);
		}
		if (schedule_type === 'weekly') {
			return (
				currentTime.getUTCDay() === schedule_config.day_of_week &&
				currentTime.getUTCHours() === schedule_config.hour &&
				currentTime.getUTCMinutes() === schedule_config.minute
			);
		}
		return false;
	}

	const lastRun = new Date(lastRunAt);
	const diffMs = currentTime.getTime() - lastRun.getTime();
	const diffHours = diffMs / 1000 / 60 / 60;

	if (schedule_type === 'daily') {
		return (
			diffHours >= 23 &&
			currentTime.getUTCHours() === schedule_config.hour &&
			currentTime.getUTCMinutes() === schedule_config.minute
		);
	}

	if (schedule_type === 'weekly') {
		const daysSince = diffMs / 1000 / 60 / 60 / 24;
		return (
			daysSince >= 6 &&
			currentTime.getUTCDay() === schedule_config.day_of_week &&
			currentTime.getUTCHours() === schedule_config.hour &&
			currentTime.getUTCMinutes() === schedule_config.minute
		);
	}

	if (schedule_type === 'interval') {
		return diffHours >= (schedule_config.hours || 24);
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

export async function updateRuleLastRun(
	supabase: SupabaseClient,
	repoId: string,
	ruleId: string,
	workspaceId: string
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

	metadata[ruleId] = {
		...(metadata[ruleId] || {}),
		last_run_at: new Date().toISOString(),
		last_run_status: 'success',
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

