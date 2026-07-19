export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  public: {
    Tables: {
      access_requests: {
        Row: {
          confirmed_at: string | null
          created_at: string | null
          granted_at: string | null
          id: string
          new_hire_id: string | null
          requested_from_email: string | null
          requested_from_name: string | null
          requested_from_slack_id: string | null
          resent_at: string | null
          sent_at: string | null
          status: string | null
          tool_name: string
        }
        Insert: {
          confirmed_at?: string | null
          created_at?: string | null
          granted_at?: string | null
          id?: string
          new_hire_id?: string | null
          requested_from_email?: string | null
          requested_from_name?: string | null
          requested_from_slack_id?: string | null
          resent_at?: string | null
          sent_at?: string | null
          status?: string | null
          tool_name: string
        }
        Update: {
          confirmed_at?: string | null
          created_at?: string | null
          granted_at?: string | null
          id?: string
          new_hire_id?: string | null
          requested_from_email?: string | null
          requested_from_name?: string | null
          requested_from_slack_id?: string | null
          resent_at?: string | null
          sent_at?: string | null
          status?: string | null
          tool_name?: string
        }
        Relationships: [
          {
            foreignKeyName: "access_requests_new_hire_id_fkey"
            columns: ["new_hire_id"]
            isOneToOne: false
            referencedRelation: "new_hires"
            referencedColumns: ["id"]
          },
        ]
      }
      knowledge_chunks: {
        Row: {
          content: string
          created_at: string | null
          embedding: string | null
          id: string
          metadata: Json | null
          organization_id: string
          source_id: string
        }
        Insert: {
          content: string
          created_at?: string | null
          embedding?: string | null
          id?: string
          metadata?: Json | null
          organization_id: string
          source_id: string
        }
        Update: {
          content?: string
          created_at?: string | null
          embedding?: string | null
          id?: string
          metadata?: Json | null
          organization_id?: string
          source_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "knowledge_chunks_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "knowledge_chunks_source_id_fkey"
            columns: ["source_id"]
            isOneToOne: false
            referencedRelation: "knowledge_sources"
            referencedColumns: ["id"]
          },
        ]
      }
      knowledge_sources: {
        Row: {
          chunk_count: number | null
          created_at: string | null
          error_message: string | null
          id: string
          last_synced_at: string | null
          name: string
          organization_id: string
          provider: string
          slack_channel_id: string | null
          slack_channel_name: string | null
          status: string | null
        }
        Insert: {
          chunk_count?: number | null
          created_at?: string | null
          error_message?: string | null
          id?: string
          last_synced_at?: string | null
          name: string
          organization_id: string
          provider?: string
          slack_channel_id?: string | null
          slack_channel_name?: string | null
          status?: string | null
        }
        Update: {
          chunk_count?: number | null
          created_at?: string | null
          error_message?: string | null
          id?: string
          last_synced_at?: string | null
          name?: string
          organization_id?: string
          provider?: string
          slack_channel_id?: string | null
          slack_channel_name?: string | null
          status?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "knowledge_sources_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      meeting_events: {
        Row: {
          attendees: string[]
          connection_id: string | null
          created_at: string
          customer_domain: string | null
          description: string | null
          end_at: string | null
          external_id: string
          id: string
          last_seen_at: string
          meeting_url: string | null
          metadata: Json
          organization_id: string
          organizer: string | null
          provider: string
          start_at: string
          status: string
          title: string
          updated_at: string
        }
        Insert: {
          attendees?: string[]
          connection_id?: string | null
          created_at?: string
          customer_domain?: string | null
          description?: string | null
          end_at?: string | null
          external_id: string
          id?: string
          last_seen_at?: string
          meeting_url?: string | null
          metadata?: Json
          organization_id: string
          organizer?: string | null
          provider: string
          start_at: string
          status?: string
          title: string
          updated_at?: string
        }
        Update: {
          attendees?: string[]
          connection_id?: string | null
          created_at?: string
          customer_domain?: string | null
          description?: string | null
          end_at?: string | null
          external_id?: string
          id?: string
          last_seen_at?: string
          meeting_url?: string | null
          metadata?: Json
          organization_id?: string
          organizer?: string | null
          provider?: string
          start_at?: string
          status?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "meeting_events_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      meeting_prep_deliveries: {
        Row: {
          attempt_count: number
          brief_text: string | null
          created_at: string
          delivered_at: string | null
          id: string
          last_attempt_at: string | null
          meeting_event_id: string
          metadata: Json
          organization_id: string
          reason: string | null
          status: string
          target_id: string
          target_name: string | null
          target_provider: string
          updated_at: string
        }
        Insert: {
          attempt_count?: number
          brief_text?: string | null
          created_at?: string
          delivered_at?: string | null
          id?: string
          last_attempt_at?: string | null
          meeting_event_id: string
          metadata?: Json
          organization_id: string
          reason?: string | null
          status?: string
          target_id: string
          target_name?: string | null
          target_provider: string
          updated_at?: string
        }
        Update: {
          attempt_count?: number
          brief_text?: string | null
          created_at?: string
          delivered_at?: string | null
          id?: string
          last_attempt_at?: string | null
          meeting_event_id?: string
          metadata?: Json
          organization_id?: string
          reason?: string | null
          status?: string
          target_id?: string
          target_name?: string | null
          target_provider?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "meeting_prep_deliveries_meeting_event_id_fkey"
            columns: ["meeting_event_id"]
            isOneToOne: false
            referencedRelation: "meeting_events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "meeting_prep_deliveries_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      milestone_check_runs: {
        Row: {
          activity_checked: number
          completed_at: string
          created_at: string
          id: string
          milestone_id: string | null
          new_hire_id: string
          organization_id: string
          outcome: string
          source_event_ids: string[]
          sources_checked: string[]
          started_at: string
          summary: string
          trigger_type: string
        }
        Insert: {
          activity_checked?: number
          completed_at: string
          created_at?: string
          id?: string
          milestone_id?: string | null
          new_hire_id: string
          organization_id: string
          outcome: string
          source_event_ids?: string[]
          sources_checked?: string[]
          started_at: string
          summary: string
          trigger_type: string
        }
        Update: {
          activity_checked?: number
          completed_at?: string
          created_at?: string
          id?: string
          milestone_id?: string | null
          new_hire_id?: string
          organization_id?: string
          outcome?: string
          source_event_ids?: string[]
          sources_checked?: string[]
          started_at?: string
          summary?: string
          trigger_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "milestone_check_runs_milestone_id_fkey"
            columns: ["milestone_id"]
            isOneToOne: false
            referencedRelation: "ramp_milestones"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "milestone_check_runs_new_hire_id_fkey"
            columns: ["new_hire_id"]
            isOneToOne: false
            referencedRelation: "new_hires"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "milestone_check_runs_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      milestone_evidence: {
        Row: {
          confidence: number
          created_at: string | null
          created_by: string | null
          evidence_type: string
          id: string
          metadata: Json
          milestone_id: string
          new_hire_id: string
          progress_id: string | null
          source: string
          source_event_id: string | null
          source_url: string | null
          trust_level: string
        }
        Insert: {
          confidence?: number
          created_at?: string | null
          created_by?: string | null
          evidence_type: string
          id?: string
          metadata?: Json
          milestone_id: string
          new_hire_id: string
          progress_id?: string | null
          source?: string
          source_event_id?: string | null
          source_url?: string | null
          trust_level?: string
        }
        Update: {
          confidence?: number
          created_at?: string | null
          created_by?: string | null
          evidence_type?: string
          id?: string
          metadata?: Json
          milestone_id?: string
          new_hire_id?: string
          progress_id?: string | null
          source?: string
          source_event_id?: string | null
          source_url?: string | null
          trust_level?: string
        }
        Relationships: [
          {
            foreignKeyName: "milestone_evidence_milestone_id_fkey"
            columns: ["milestone_id"]
            isOneToOne: false
            referencedRelation: "ramp_milestones"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "milestone_evidence_new_hire_id_fkey"
            columns: ["new_hire_id"]
            isOneToOne: false
            referencedRelation: "new_hires"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "milestone_evidence_progress_id_fkey"
            columns: ["progress_id"]
            isOneToOne: false
            referencedRelation: "new_hire_milestone_progress"
            referencedColumns: ["id"]
          },
        ]
      }
      milestone_generation_runs: {
        Row: {
          completed_at: string | null
          created_at: string | null
          error_message: string | null
          id: string
          organization_id: string
          proposals_created: number
          requested_by: string | null
          roles_processed: number
          started_at: string | null
          status: string
          updated_at: string | null
        }
        Insert: {
          completed_at?: string | null
          created_at?: string | null
          error_message?: string | null
          id?: string
          organization_id: string
          proposals_created?: number
          requested_by?: string | null
          roles_processed?: number
          started_at?: string | null
          status?: string
          updated_at?: string | null
        }
        Update: {
          completed_at?: string | null
          created_at?: string | null
          error_message?: string | null
          id?: string
          organization_id?: string
          proposals_created?: number
          requested_by?: string | null
          roles_processed?: number
          started_at?: string | null
          status?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "milestone_generation_runs_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      milestone_proposals: {
        Row: {
          approved_at: string | null
          approved_milestone_id: string | null
          briefing_goal: string
          capability_outcome: string
          confidence: number
          created_at: string | null
          evidence_requirements: Json
          id: string
          normalized_key: string
          organization_id: string
          rationale: string | null
          real_work_trigger: string
          rejected_at: string | null
          retrieval_brief: string
          role: string
          source_evidence: Json
          status: string
          success_signals: Json
          suggested_day_trigger: number
          title: string
          updated_at: string | null
        }
        Insert: {
          approved_at?: string | null
          approved_milestone_id?: string | null
          briefing_goal: string
          capability_outcome: string
          confidence?: number
          created_at?: string | null
          evidence_requirements?: Json
          id?: string
          normalized_key: string
          organization_id: string
          rationale?: string | null
          real_work_trigger: string
          rejected_at?: string | null
          retrieval_brief: string
          role: string
          source_evidence?: Json
          status?: string
          success_signals?: Json
          suggested_day_trigger: number
          title: string
          updated_at?: string | null
        }
        Update: {
          approved_at?: string | null
          approved_milestone_id?: string | null
          briefing_goal?: string
          capability_outcome?: string
          confidence?: number
          created_at?: string | null
          evidence_requirements?: Json
          id?: string
          normalized_key?: string
          organization_id?: string
          rationale?: string | null
          real_work_trigger?: string
          rejected_at?: string | null
          retrieval_brief?: string
          role?: string
          source_evidence?: Json
          status?: string
          success_signals?: Json
          suggested_day_trigger?: number
          title?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "milestone_proposals_approved_milestone_id_fkey"
            columns: ["approved_milestone_id"]
            isOneToOne: false
            referencedRelation: "ramp_milestones"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "milestone_proposals_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      new_hire_milestone_progress: {
        Row: {
          created_at: string | null
          current_confidence: number
          first_briefed_at: string | null
          id: string
          last_evidence_at: string | null
          milestone_id: string
          new_hire_id: string
          status: string
          updated_at: string | null
          verified_at: string | null
        }
        Insert: {
          created_at?: string | null
          current_confidence?: number
          first_briefed_at?: string | null
          id?: string
          last_evidence_at?: string | null
          milestone_id: string
          new_hire_id: string
          status?: string
          updated_at?: string | null
          verified_at?: string | null
        }
        Update: {
          created_at?: string | null
          current_confidence?: number
          first_briefed_at?: string | null
          id?: string
          last_evidence_at?: string | null
          milestone_id?: string
          new_hire_id?: string
          status?: string
          updated_at?: string | null
          verified_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "new_hire_milestone_progress_milestone_id_fkey"
            columns: ["milestone_id"]
            isOneToOne: false
            referencedRelation: "ramp_milestones"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "new_hire_milestone_progress_new_hire_id_fkey"
            columns: ["new_hire_id"]
            isOneToOne: false
            referencedRelation: "new_hires"
            referencedColumns: ["id"]
          },
        ]
      }
      new_hires: {
        Row: {
          created_at: string | null
          created_by: string | null
          email: string
          first_name: string
          id: string
          last_name: string
          manager_chat_provider: string
          manager_chat_target_id: string | null
          manager_email: string | null
          manager_name: string | null
          manager_slack_user_id: string | null
          organization_id: string
          ramp_day: number | null
          role: string
          slack_user_id: string | null
          start_date: string
          status: string | null
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          created_by?: string | null
          email: string
          first_name: string
          id?: string
          last_name: string
          manager_chat_provider?: string
          manager_chat_target_id?: string | null
          manager_email?: string | null
          manager_name?: string | null
          manager_slack_user_id?: string | null
          organization_id: string
          ramp_day?: number | null
          role: string
          slack_user_id?: string | null
          start_date: string
          status?: string | null
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          created_by?: string | null
          email?: string
          first_name?: string
          id?: string
          last_name?: string
          manager_chat_provider?: string
          manager_chat_target_id?: string | null
          manager_email?: string | null
          manager_name?: string | null
          manager_slack_user_id?: string | null
          organization_id?: string
          ramp_day?: number | null
          role?: string
          slack_user_id?: string | null
          start_date?: string
          status?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "new_hires_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      oauth_connections: {
        Row: {
          connection_id: string
          created_at: string
          id: string
          metadata: Json | null
          organization_id: string
          provider: string
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          connection_id: string
          created_at?: string
          id?: string
          metadata?: Json | null
          organization_id: string
          provider: string
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          connection_id?: string
          created_at?: string
          id?: string
          metadata?: Json | null
          organization_id?: string
          provider?: string
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "oauth_connections_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      oauth_provider_tokens: {
        Row: {
          access_token: Json
          connection_id: string
          created_at: string
          expires_at: string | null
          id: string
          organization_id: string
          provider: string
          provider_account_id: string | null
          refresh_token: Json | null
          scope: string | null
          token_type: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          access_token: Json
          connection_id: string
          created_at?: string
          expires_at?: string | null
          id?: string
          organization_id: string
          provider: string
          provider_account_id?: string | null
          refresh_token?: Json | null
          scope?: string | null
          token_type?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          access_token?: Json
          connection_id?: string
          created_at?: string
          expires_at?: string | null
          id?: string
          organization_id?: string
          provider?: string
          provider_account_id?: string | null
          refresh_token?: Json | null
          scope?: string | null
          token_type?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "oauth_provider_tokens_connection_id_fkey"
            columns: ["connection_id"]
            isOneToOne: true
            referencedRelation: "oauth_connections"
            referencedColumns: ["connection_id"]
          },
          {
            foreignKeyName: "oauth_provider_tokens_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      onboarding_notifications: {
        Row: {
          body: string
          created_at: string | null
          delivery_channel: string
          id: string
          milestone_id: string | null
          new_hire_id: string | null
          organization_id: string
          read_at: string | null
          slack_sent_at: string | null
          slack_target: string | null
          title: string
          type: string
        }
        Insert: {
          body: string
          created_at?: string | null
          delivery_channel?: string
          id?: string
          milestone_id?: string | null
          new_hire_id?: string | null
          organization_id: string
          read_at?: string | null
          slack_sent_at?: string | null
          slack_target?: string | null
          title: string
          type: string
        }
        Update: {
          body?: string
          created_at?: string | null
          delivery_channel?: string
          id?: string
          milestone_id?: string | null
          new_hire_id?: string | null
          organization_id?: string
          read_at?: string | null
          slack_sent_at?: string | null
          slack_target?: string | null
          title?: string
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "onboarding_notifications_milestone_id_fkey"
            columns: ["milestone_id"]
            isOneToOne: false
            referencedRelation: "ramp_milestones"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "onboarding_notifications_new_hire_id_fkey"
            columns: ["new_hire_id"]
            isOneToOne: false
            referencedRelation: "new_hires"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "onboarding_notifications_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      org_tools: {
        Row: {
          created_at: string | null
          id: string
          organization_id: string
          owner_email: string | null
          owner_name: string | null
          owner_slack_id: string | null
          role: string | null
          tool_name: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          organization_id: string
          owner_email?: string | null
          owner_name?: string | null
          owner_slack_id?: string | null
          role?: string | null
          tool_name: string
        }
        Update: {
          created_at?: string | null
          id?: string
          organization_id?: string
          owner_email?: string | null
          owner_name?: string | null
          owner_slack_id?: string | null
          role?: string | null
          tool_name?: string
        }
        Relationships: [
          {
            foreignKeyName: "org_tools_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      organizations: {
        Row: {
          clerk_org_id: string
          created_at: string | null
          id: string
          name: string
          owner_id: string | null
          slug: string
        }
        Insert: {
          clerk_org_id: string
          created_at?: string | null
          id?: string
          name: string
          owner_id?: string | null
          slug: string
        }
        Update: {
          clerk_org_id?: string
          created_at?: string | null
          id?: string
          name?: string
          owner_id?: string | null
          slug?: string
        }
        Relationships: []
      }
      ramp_deliveries: {
        Row: {
          content_delivered: string | null
          created_at: string | null
          delivered_at: string | null
          delivery_channel: string | null
          delivery_status: string | null
          error_message: string | null
          id: string
          milestone_id: string | null
          new_hire_id: string | null
          slack_ts: string | null
        }
        Insert: {
          content_delivered?: string | null
          created_at?: string | null
          delivered_at?: string | null
          delivery_channel?: string | null
          delivery_status?: string | null
          error_message?: string | null
          id?: string
          milestone_id?: string | null
          new_hire_id?: string | null
          slack_ts?: string | null
        }
        Update: {
          content_delivered?: string | null
          created_at?: string | null
          delivered_at?: string | null
          delivery_channel?: string | null
          delivery_status?: string | null
          error_message?: string | null
          id?: string
          milestone_id?: string | null
          new_hire_id?: string | null
          slack_ts?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ramp_deliveries_milestone_id_fkey"
            columns: ["milestone_id"]
            isOneToOne: false
            referencedRelation: "ramp_milestones"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ramp_deliveries_new_hire_id_fkey"
            columns: ["new_hire_id"]
            isOneToOne: false
            referencedRelation: "new_hires"
            referencedColumns: ["id"]
          },
        ]
      }
      ramp_milestones: {
        Row: {
          approved_from_proposal_id: string | null
          briefing_goal: string | null
          capability_outcome: string | null
          confidence: number
          created_at: string | null
          day_trigger: number
          description: string
          evidence_requirements: Json
          id: string
          knowledge_query: string
          organization_id: string
          real_work_trigger: string | null
          retrieval_brief: string | null
          role: string
          source_evidence: Json
          status: string
          success_signals: Json
          title: string
          updated_at: string | null
        }
        Insert: {
          approved_from_proposal_id?: string | null
          briefing_goal?: string | null
          capability_outcome?: string | null
          confidence?: number
          created_at?: string | null
          day_trigger: number
          description: string
          evidence_requirements?: Json
          id?: string
          knowledge_query: string
          organization_id: string
          real_work_trigger?: string | null
          retrieval_brief?: string | null
          role: string
          source_evidence?: Json
          status?: string
          success_signals?: Json
          title: string
          updated_at?: string | null
        }
        Update: {
          approved_from_proposal_id?: string | null
          briefing_goal?: string | null
          capability_outcome?: string | null
          confidence?: number
          created_at?: string | null
          day_trigger?: number
          description?: string
          evidence_requirements?: Json
          id?: string
          knowledge_query?: string
          organization_id?: string
          real_work_trigger?: string | null
          retrieval_brief?: string | null
          role?: string
          source_evidence?: Json
          status?: string
          success_signals?: Json
          title?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ramp_milestones_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      readiness_delivery_settings: {
        Row: {
          channel_ids: string[]
          channel_names: string[]
          created_at: string | null
          digest_hour_utc: number
          digest_weekday: number
          last_digest_sent_at: string | null
          meeting_prep_enabled: boolean
          meeting_prep_minutes_before: number
          organization_id: string
          slack_user_ids: string[]
          updated_at: string | null
          weekly_digest_enabled: boolean
        }
        Insert: {
          channel_ids?: string[]
          channel_names?: string[]
          created_at?: string | null
          digest_hour_utc?: number
          digest_weekday?: number
          last_digest_sent_at?: string | null
          meeting_prep_enabled?: boolean
          meeting_prep_minutes_before?: number
          organization_id: string
          slack_user_ids?: string[]
          updated_at?: string | null
          weekly_digest_enabled?: boolean
        }
        Update: {
          channel_ids?: string[]
          channel_names?: string[]
          created_at?: string | null
          digest_hour_utc?: number
          digest_weekday?: number
          last_digest_sent_at?: string | null
          meeting_prep_enabled?: boolean
          meeting_prep_minutes_before?: number
          organization_id?: string
          slack_user_ids?: string[]
          updated_at?: string | null
          weekly_digest_enabled?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "readiness_delivery_settings_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: true
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      readiness_delivery_targets: {
        Row: {
          created_at: string
          enabled: boolean
          id: string
          organization_id: string
          provider: string
          target_id: string
          target_name: string | null
          target_type: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          enabled?: boolean
          id?: string
          organization_id: string
          provider: string
          target_id: string
          target_name?: string | null
          target_type: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          enabled?: boolean
          id?: string
          organization_id?: string
          provider?: string
          target_id?: string
          target_name?: string | null
          target_type?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "readiness_delivery_targets_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      readiness_items: {
        Row: {
          affected_roles: string[] | null
          category: string
          created_at: string | null
          detected_at: string | null
          id: string
          impact_level: string | null
          organization_id: string
          recommended_action: string | null
          sent_at: string | null
          source: string | null
          source_metadata: Json | null
          source_url: string | null
          status: string | null
          summary: string
          title: string
          updated_at: string | null
        }
        Insert: {
          affected_roles?: string[] | null
          category: string
          created_at?: string | null
          detected_at?: string | null
          id?: string
          impact_level?: string | null
          organization_id: string
          recommended_action?: string | null
          sent_at?: string | null
          source?: string | null
          source_metadata?: Json | null
          source_url?: string | null
          status?: string | null
          summary: string
          title: string
          updated_at?: string | null
        }
        Update: {
          affected_roles?: string[] | null
          category?: string
          created_at?: string | null
          detected_at?: string | null
          id?: string
          impact_level?: string | null
          organization_id?: string
          recommended_action?: string | null
          sent_at?: string | null
          source?: string | null
          source_metadata?: Json | null
          source_url?: string | null
          status?: string | null
          summary?: string
          title?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "readiness_items_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      readiness_observations: {
        Row: {
          affected_roles: string[]
          category: string
          created_at: string
          dedupe_key: string
          id: string
          impact_level: string
          last_sent_at: string | null
          metadata: Json
          organization_id: string
          recommended_action: string | null
          source_event_ids: string[]
          source_hashes: string[]
          status: string
          summary: string
          title: string
          updated_at: string
        }
        Insert: {
          affected_roles?: string[]
          category: string
          created_at?: string
          dedupe_key: string
          id?: string
          impact_level?: string
          last_sent_at?: string | null
          metadata?: Json
          organization_id: string
          recommended_action?: string | null
          source_event_ids?: string[]
          source_hashes?: string[]
          status?: string
          summary: string
          title: string
          updated_at?: string
        }
        Update: {
          affected_roles?: string[]
          category?: string
          created_at?: string
          dedupe_key?: string
          id?: string
          impact_level?: string
          last_sent_at?: string | null
          metadata?: Json
          organization_id?: string
          recommended_action?: string | null
          source_event_ids?: string[]
          source_hashes?: string[]
          status?: string
          summary?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "readiness_observations_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      readiness_source_events: {
        Row: {
          content: string
          content_hash: string
          created_at: string
          external_id: string
          id: string
          metadata: Json
          occurred_at: string | null
          organization_id: string
          processed_at: string | null
          provider: string
          source_id: string | null
          source_type: string
          status: string
          updated_at: string
        }
        Insert: {
          content: string
          content_hash: string
          created_at?: string
          external_id: string
          id?: string
          metadata?: Json
          occurred_at?: string | null
          organization_id: string
          processed_at?: string | null
          provider: string
          source_id?: string | null
          source_type: string
          status?: string
          updated_at?: string
        }
        Update: {
          content?: string
          content_hash?: string
          created_at?: string
          external_id?: string
          id?: string
          metadata?: Json
          occurred_at?: string | null
          organization_id?: string
          processed_at?: string | null
          provider?: string
          source_id?: string | null
          source_type?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "readiness_source_events_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "readiness_source_events_source_id_fkey"
            columns: ["source_id"]
            isOneToOne: false
            referencedRelation: "knowledge_sources"
            referencedColumns: ["id"]
          },
        ]
      }
      role_profiles: {
        Row: {
          baseline_ramp_days: number
          created_at: string | null
          display_order: number
          id: string
          job_description: string
          organization_id: string
          role: string
          status: string
          target_ramp_days: number
          updated_at: string | null
        }
        Insert: {
          baseline_ramp_days?: number
          created_at?: string | null
          display_order?: number
          id?: string
          job_description?: string
          organization_id: string
          role: string
          status?: string
          target_ramp_days?: number
          updated_at?: string | null
        }
        Update: {
          baseline_ramp_days?: number
          created_at?: string | null
          display_order?: number
          id?: string
          job_description?: string
          organization_id?: string
          role?: string
          status?: string
          target_ramp_days?: number
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "role_profiles_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      match_knowledge_chunks: {
        Args: {
          match_count?: number
          match_threshold?: number
          organization_id: string
          query_embedding: string
        }
        Returns: {
          content: string
          id: string
          metadata: Json
          similarity: number
        }[]
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const
