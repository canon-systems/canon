# Canon demo workspace

Canon includes a dedicated Clerk organization named **Canon Demo** for screenshots, demos, and product walkthroughs. It presents a fictional Novara Cloud workspace with roles, hires, milestones, evidence, readiness updates, meeting briefings, knowledge sources, and tool access states.

The fixture only uses fictional people, companies, and `.example` email addresses.

## Where the data lives

All demo product data lives in `src/lib/server/demo-workspace-data.ts`. Update that file to add or change the demo workspace. No demo roles, hires, milestones, evidence, readiness updates, meetings, knowledge sources, tools, or connections are written to Supabase.

The Clerk organization is marked with:

- public metadata: `workspace_type = demo`
- private metadata: `data_source = file`

That metadata boundary keeps the demo organization independent from its name or generated slug.

## Behavior

- Demo GET requests return the versioned fixture.
- The demo Supabase client blocks inserts, updates, upserts, deletes, and RPC calls.
- The interface labels the active organization as `Demo`.
- Dates are generated relative to the current day so screenshots remain current.

To reset the demo, switch away and back to **Canon Demo** or reload the page. There are no product records to clean up.
