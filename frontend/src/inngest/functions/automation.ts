// import { inngest } from "../client";
// import { createClient } from "@supabase/supabase-js";
// import { executeAutomationRule } from "../../lib/server/services/automationRunner";

// // Cron matching utility
// function shouldRunBasedOnCron(cronExpression: string, currentDate: Date = new Date()): boolean {
//   try {
//     const parts = cronExpression.trim().split(/\s+/);
//     if (parts.length !== 5) return false;

//     const [minute, hour, day, month, weekday] = parts;

//     // For now, do simple matching - you can enhance this with a proper cron parser
//     const currentMinute = currentDate.getUTCMinutes();
//     const currentHour = currentDate.getUTCHours();
//     const currentDay = currentDate.getUTCDate();
//     const currentMonth = currentDate.getUTCMonth() + 1;
//     const currentWeekday = currentDate.getUTCDay();

//     // Simple matching logic (can be enhanced)
//     const minuteMatch = minute === '*' || minute === String(currentMinute) ||
//       (minute.startsWith('*/') && currentMinute % parseInt(minute.slice(2)) === 0);
//     const hourMatch = hour === '*' || hour === String(currentHour) ||
//       (hour.startsWith('*/') && currentHour % parseInt(hour.slice(2)) === 0);
//     const dayMatch = day === '*' || day === String(currentDay);
//     const monthMatch = month === '*' || month === String(currentMonth);
//     const weekdayMatch = weekday === '*' || weekday === String(currentWeekday);

//     return minuteMatch && hourMatch && dayMatch && monthMatch && weekdayMatch;
//   } catch (error) {
//     console.error('Error parsing cron expression:', cronExpression, error);
//     return false;
//   }
// }

// // Simplified automation manager - runs frequently and lets FileSummaryManager handle hash-based change detection
// export const checkAndRunAutomations = inngest.createFunction(
//   {
//     id: "smart-summary-manager",
//     name: "Smart Summary & Automation Manager",
//     retries: 3,
//   },
//   {
//     cron: "* */1 * * *", // Run every hour for responsive automation 
//   },
//   // eslint-disable-next-line @typescript-eslint/no-unused-vars
//   async ({ event: _event, step: _step }) => {
//     console.log(`🎯 [SMART] Starting smart summary management cycle at ${new Date().toISOString()}`);

//     // Create Supabase client
//     const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
//     const serviceKey = process.env.SUPABASE_SERVICE_KEY;
//     if (!supabaseUrl || !serviceKey) {
//       console.error('❌ [SMART] Missing Supabase env for automation run');
//       return { error: 'Missing Supabase env' };
//     }
//     // Supabase client for automation runs

//     const supabase = createClient(supabaseUrl, serviceKey);

//     // Get all enabled automation rules with schedules
//     const { data: rules, error } = await supabase
//       .from('automation_rules')
//       .select('*')
//       .eq('enabled', true)
//       .not('schedule', 'is', null);

//     if (error) {
//       console.error(`❌ [ERROR] Failed to fetch automation rules:`, error);
//       return { error: 'Failed to fetch rules' };
//     }

//     if (!rules || rules.length === 0) {
//       console.log(`📋 [SMART] No enabled automation rules found`);
//       return { checked: 0, executed: 0 };
//     }

//     const currentTime = new Date();
//     let executed = 0;

//     for (const rule of rules) {
//       try {
//         // Check if this rule should run based on its cron schedule
//         if (!shouldRunBasedOnCron(rule.schedule, currentTime)) {
//           continue; // Skip this rule
//         }

//         console.log(`🚀 [SMART] Executing automation rule: ${rule.id}`);

//         // Get source data
//         const { data: repo, error: repoError } = await supabase
//           .from('workspace_sources')
//           .select('*')
//           .eq('id', rule.source_id)
//           .single();

//         if (repoError || !repo) {
//           console.error(`❌ Source not found: ${rule.source_id}`, repoError);
//           continue;
//         }

//         // Execute the automation rule
//         const result = await executeAutomationRule({
//           supabase,
//           repo,
//           rule,
//           userId: rule.user_id,
//           triggerType: 'scheduled',
//         });

//         // Update last run status
//         const updateData: {
//           last_run_at: string;
//           last_run_status: string;
//           last_run_error?: string;
//         } = {
//           last_run_at: new Date().toISOString(),
//           last_run_status: result.success ? 'success' : 'failed',
//         };

//         if (result.errors?.length > 0) {
//           updateData.last_run_error = result.errors.join('; ');
//         }

//         await supabase
//           .from('automation_rules')
//           .update(updateData)
//           .eq('id', rule.id);

//         console.log(`✅ [SMART] Completed: ${rule.id} (Success: ${result.success}, Actions: ${result.actions?.length || 0}, Errors: ${result.errors?.length || 0})`);
//         if (result.errors?.length) {
//           console.error(`❌ [SMART] Rule ${rule.id} errors: ${result.errors.join(' | ')}`);
//         }

//         executed++;

//       } catch (error: unknown) {
//         console.error(`❌ [SMART] Failed: ${rule.id} - ${error instanceof Error ? error.message : String(error)}`);

//         // Update with failure status
//         await supabase
//           .from('automation_rules')
//           .update({
//             last_run_at: new Date().toISOString(),
//             last_run_status: 'failed',
//             last_run_error: error instanceof Error ? error.message : String(error),
//           })
//           .eq('id', rule.id);
//       }
//     }

//     return {
//       checked: rules.length,
//       executed,
//       timestamp: new Date().toISOString(),
//     };
//   }
// );
