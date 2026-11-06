export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.18"
  }
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      graphql: {
        Args: {
          extensions?: Json
          operationName?: string
          query?: string
          variables?: Json
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string
          full_name: string | null
          role: string
          module_grants: string[]
          module_denies: string[]
          created_at: string
          is_active: boolean
          pcf_role: Database["public"]["Enums"]["pcf_role"] | null
        }
        Insert: {
          id?: string
          full_name?: string | null
          role?: string
          module_grants?: string[]
          module_denies?: string[]
          created_at?: string
          is_active?: boolean
          pcf_role?: Database["public"]["Enums"]["pcf_role"] | null
        }
        Update: {
          id?: string
          full_name?: string | null
          role?: string
          module_grants?: string[]
          module_denies?: string[]
          created_at?: string
          is_active?: boolean
          pcf_role?: Database["public"]["Enums"]["pcf_role"] | null
        }
        Relationships: []
      }
      deals: {
        Row: {
          id: string
          deal_no: string
          buyer_name: string
          buyer_address: string | null
          buyer_contact: string | null
          sale_type: string
          institution: string | null
          agreed_price: number
          down_payment: number | null
          loan_amount: number
          processing_fee: number
          monthly_payment: number | null
          years: number | null
          opening_paid: number
          trade_in_value: number
          trade_in: Json | null
          amount_due: number
          lieu_amount: number
          lieu_until: string | null
          due_date: string | null
          due_text: string | null
          loan_status: string
          loan_since: string | null
          loan_released_on: string | null
          status: string
          cancelled_at: string | null
          cancel_reason: string | null
          refund_amount: number | null
          terms: Json
          created_by: string
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          deal_no?: string
          buyer_name?: string
          buyer_address?: string | null
          buyer_contact?: string | null
          sale_type?: string
          institution?: string | null
          agreed_price?: number
          down_payment?: number | null
          loan_amount?: number
          processing_fee?: number
          monthly_payment?: number | null
          years?: number | null
          opening_paid?: number
          trade_in_value?: number
          trade_in?: Json | null
          amount_due?: number
          lieu_amount?: number
          lieu_until?: string | null
          due_date?: string | null
          due_text?: string | null
          loan_status?: string
          loan_since?: string | null
          loan_released_on?: string | null
          status?: string
          cancelled_at?: string | null
          cancel_reason?: string | null
          refund_amount?: number | null
          terms?: Json
          created_by?: string
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          deal_no?: string
          buyer_name?: string
          buyer_address?: string | null
          buyer_contact?: string | null
          sale_type?: string
          institution?: string | null
          agreed_price?: number
          down_payment?: number | null
          loan_amount?: number
          processing_fee?: number
          monthly_payment?: number | null
          years?: number | null
          opening_paid?: number
          trade_in_value?: number
          trade_in?: Json | null
          amount_due?: number
          lieu_amount?: number
          lieu_until?: string | null
          due_date?: string | null
          due_text?: string | null
          loan_status?: string
          loan_since?: string | null
          loan_released_on?: string | null
          status?: string
          cancelled_at?: string | null
          cancel_reason?: string | null
          refund_amount?: number | null
          terms?: Json
          created_by?: string
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      deal_units: {
        Row: {
          id: string
          deal_id: string
          position: number
          make_type: string
          plate_no: string
          plate_display: string
          motor_no: string | null
          chassis_no: string | null
          color: string | null
          active: boolean
        }
        Insert: {
          id?: string
          deal_id?: string
          position?: number
          make_type?: string
          plate_no?: string
          plate_display?: string
          motor_no?: string | null
          chassis_no?: string | null
          color?: string | null
          active?: boolean
        }
        Update: {
          id?: string
          deal_id?: string
          position?: number
          make_type?: string
          plate_no?: string
          plate_display?: string
          motor_no?: string | null
          chassis_no?: string | null
          color?: string | null
          active?: boolean
        }
        Relationships: []
      }
      receipts: {
        Row: {
          id: string
          deal_id: string
          receipt_no: string
          receipt_date: string
          kind: string
          amount: number
          payout: number
          balance_after: number
          status: string
          submitted_by: string
          submitted_at: string
          reviewed_by: string | null
          reviewed_at: string | null
          reject_reason: string | null
          void_reason: string | null
          voided_by: string | null
          voided_at: string | null
          remarks: string | null
          notes: Json | null
          snapshot: Json
          drive_file_id: string | null
          created_at: string
        }
        Insert: {
          id?: string
          deal_id?: string
          receipt_no?: string
          receipt_date?: string
          kind?: string
          amount?: number
          payout?: number
          balance_after?: number
          status?: string
          submitted_by?: string
          submitted_at?: string
          reviewed_by?: string | null
          reviewed_at?: string | null
          reject_reason?: string | null
          void_reason?: string | null
          voided_by?: string | null
          voided_at?: string | null
          remarks?: string | null
          notes?: Json | null
          snapshot?: Json
          drive_file_id?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          deal_id?: string
          receipt_no?: string
          receipt_date?: string
          kind?: string
          amount?: number
          payout?: number
          balance_after?: number
          status?: string
          submitted_by?: string
          submitted_at?: string
          reviewed_by?: string | null
          reviewed_at?: string | null
          reject_reason?: string | null
          void_reason?: string | null
          voided_by?: string | null
          voided_at?: string | null
          remarks?: string | null
          notes?: Json | null
          snapshot?: Json
          drive_file_id?: string | null
          created_at?: string
        }
        Relationships: []
      }
      receipt_payments: {
        Row: {
          id: string
          receipt_id: string
          position: number
          method: string
          label: string
          amount: number
          reference: string | null
          check_no: string | null
          bank: string | null
          branch: string | null
        }
        Insert: {
          id?: string
          receipt_id?: string
          position?: number
          method?: string
          label?: string
          amount?: number
          reference?: string | null
          check_no?: string | null
          bank?: string | null
          branch?: string | null
        }
        Update: {
          id?: string
          receipt_id?: string
          position?: number
          method?: string
          label?: string
          amount?: number
          reference?: string | null
          check_no?: string | null
          bank?: string | null
          branch?: string | null
        }
        Relationships: []
      }
      attachments: {
        Row: {
          id: string
          receipt_id: string
          payment_id: string | null
          purpose: string
          storage_path: string
          filename: string
          mime_type: string | null
          size_bytes: number | null
          uploaded_by: string | null
          created_at: string
        }
        Insert: {
          id?: string
          receipt_id?: string
          payment_id?: string | null
          purpose?: string
          storage_path?: string
          filename?: string
          mime_type?: string | null
          size_bytes?: number | null
          uploaded_by?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          receipt_id?: string
          payment_id?: string | null
          purpose?: string
          storage_path?: string
          filename?: string
          mime_type?: string | null
          size_bytes?: number | null
          uploaded_by?: string | null
          created_at?: string
        }
        Relationships: []
      }
      app_settings: {
        Row: {
          id: number
          config: Json
          updated_by: string | null
          updated_at: string
        }
        Insert: {
          id?: number
          config?: Json
          updated_by?: string | null
          updated_at?: string
        }
        Update: {
          id?: number
          config?: Json
          updated_by?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      unit_folders: {
        Row: {
          plate_no: string
          plate_display: string
          folder_id: string | null
          folder_name: string | null
          folder_url: string | null
          location: string
          match_status: string
          candidates: Json
          case_type: string | null
          case_source: string
          deal_id: string | null
          scanned_at: string | null
          moved_at: string | null
          moved_by: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          plate_no?: string
          plate_display?: string
          folder_id?: string | null
          folder_name?: string | null
          folder_url?: string | null
          location?: string
          match_status?: string
          candidates?: Json
          case_type?: string | null
          case_source?: string
          deal_id?: string | null
          scanned_at?: string | null
          moved_at?: string | null
          moved_by?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          plate_no?: string
          plate_display?: string
          folder_id?: string | null
          folder_name?: string | null
          folder_url?: string | null
          location?: string
          match_status?: string
          candidates?: Json
          case_type?: string | null
          case_source?: string
          deal_id?: string | null
          scanned_at?: string | null
          moved_at?: string | null
          moved_by?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: [{ foreignKeyName: "unit_folders_deal_id_fkey"; columns: ["deal_id"]; isOneToOne: false; referencedRelation: "deals"; referencedColumns: ["id"] }]
      }
      folder_files: {
        Row: {
          id: string
          plate_no: string
          drive_file_id: string
          filename: string
          mime_type: string | null
          size_bytes: number | null
          drive_url: string | null
          source: string
          uploaded_by: string | null
          read_status: string
          read_error: string | null
          read_at: string | null
          doc_types: string[]
          doc_types_source: string
          details: Json
          flags: string[]
          confidence: number | null
          duplicate_of: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          plate_no?: string
          drive_file_id?: string
          filename?: string
          mime_type?: string | null
          size_bytes?: number | null
          drive_url?: string | null
          source?: string
          uploaded_by?: string | null
          read_status?: string
          read_error?: string | null
          read_at?: string | null
          doc_types?: string[]
          doc_types_source?: string
          details?: Json
          flags?: string[]
          confidence?: number | null
          duplicate_of?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          plate_no?: string
          drive_file_id?: string
          filename?: string
          mime_type?: string | null
          size_bytes?: number | null
          drive_url?: string | null
          source?: string
          uploaded_by?: string | null
          read_status?: string
          read_error?: string | null
          read_at?: string | null
          doc_types?: string[]
          doc_types_source?: string
          details?: Json
          flags?: string[]
          confidence?: number | null
          duplicate_of?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: [{ foreignKeyName: "folder_files_plate_no_fkey"; columns: ["plate_no"]; isOneToOne: false; referencedRelation: "unit_folders"; referencedColumns: ["plate_no"] }]
      }
      sync_jobs: {
        Row: {
          id: string
          receipt_id: string
          target: string
          event: string
          status: string
          attempts: number
          last_error: string | null
          next_run_at: string
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          receipt_id?: string
          target?: string
          event?: string
          status?: string
          attempts?: number
          last_error?: string | null
          next_run_at?: string
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          receipt_id?: string
          target?: string
          event?: string
          status?: string
          attempts?: number
          last_error?: string | null
          next_run_at?: string
          created_at?: string
          updated_at?: string
        }
        Relationships: [{ foreignKeyName: "sync_jobs_receipt_id_fkey"; columns: ["receipt_id"]; isOneToOne: false; referencedRelation: "receipts"; referencedColumns: ["id"] }]
      }
      audit_logs: {
        Row: {
          id: string
          actor_id: string | null
          action: string
          entity: string
          entity_id: string | null
          before: Json | null
          after: Json | null
          created_at: string
        }
        Insert: {
          id?: string
          actor_id?: string | null
          action?: string
          entity?: string
          entity_id?: string | null
          before?: Json | null
          after?: Json | null
          created_at?: string
        }
        Update: {
          id?: string
          actor_id?: string | null
          action?: string
          entity?: string
          entity_id?: string | null
          before?: Json | null
          after?: Json | null
          created_at?: string
        }
        Relationships: []
      }
      audit_log: {
        Row: {
          action: string
          actor_id: string | null
          created_at: string
          entity_id: string
          entity_type: string
          id: number
          new_data: Json | null
          old_data: Json | null
        }
        Insert: {
          action: string
          actor_id?: string | null
          created_at?: string
          entity_id: string
          entity_type: string
          id?: never
          new_data?: Json | null
          old_data?: Json | null
        }
        Update: {
          action?: string
          actor_id?: string | null
          created_at?: string
          entity_id?: string
          entity_type?: string
          id?: never
          new_data?: Json | null
          old_data?: Json | null
        }
        Relationships: []
      }
      cash_counts: {
        Row: {
          counted_by: string
          counted_cash: number
          created_at: string
          expected_cash: number
          fund_id: string
          id: string
          note: string | null
          variance: number | null
        }
        Insert: {
          counted_by: string
          counted_cash: number
          created_at?: string
          expected_cash: number
          fund_id: string
          id?: string
          note?: string | null
          variance?: number | null
        }
        Update: {
          counted_by?: string
          counted_cash?: number
          created_at?: string
          expected_cash?: number
          fund_id?: string
          id?: string
          note?: string | null
          variance?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "cash_counts_counted_by_fkey"
            columns: ["counted_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cash_counts_fund_id_fkey"
            columns: ["fund_id"]
            isOneToOne: false
            referencedRelation: "fund_balance_v"
            referencedColumns: ["fund_id"]
          },
          {
            foreignKeyName: "cash_counts_fund_id_fkey"
            columns: ["fund_id"]
            isOneToOne: false
            referencedRelation: "funds"
            referencedColumns: ["id"]
          },
        ]
      }
      categories: {
        Row: {
          id: string
          is_active: boolean
          name: string
        }
        Insert: {
          id?: string
          is_active?: boolean
          name: string
        }
        Update: {
          id?: string
          is_active?: boolean
          name?: string
        }
        Relationships: []
      }
      fund_counters: {
        Row: {
          fund_id: string
          last_no: number
          year: number
        }
        Insert: {
          fund_id: string
          last_no?: number
          year: number
        }
        Update: {
          fund_id?: string
          last_no?: number
          year?: number
        }
        Relationships: [
          {
            foreignKeyName: "fund_counters_fund_id_fkey"
            columns: ["fund_id"]
            isOneToOne: false
            referencedRelation: "fund_balance_v"
            referencedColumns: ["fund_id"]
          },
          {
            foreignKeyName: "fund_counters_fund_id_fkey"
            columns: ["fund_id"]
            isOneToOne: false
            referencedRelation: "funds"
            referencedColumns: ["id"]
          },
        ]
      }
      fund_custodians: {
        Row: {
          assigned_at: string
          custodian_id: string
          fund_id: string
        }
        Insert: {
          assigned_at?: string
          custodian_id: string
          fund_id: string
        }
        Update: {
          assigned_at?: string
          custodian_id?: string
          fund_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "fund_custodians_custodian_id_fkey"
            columns: ["custodian_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fund_custodians_fund_id_fkey"
            columns: ["fund_id"]
            isOneToOne: false
            referencedRelation: "fund_balance_v"
            referencedColumns: ["fund_id"]
          },
          {
            foreignKeyName: "fund_custodians_fund_id_fkey"
            columns: ["fund_id"]
            isOneToOne: false
            referencedRelation: "funds"
            referencedColumns: ["id"]
          },
        ]
      }
      funds: {
        Row: {
          amount: number
          approval_threshold: number
          created_at: string
          id: string
          is_active: boolean
          low_balance_pct: number
          name: string
          per_txn_limit: number
        }
        Insert: {
          amount: number
          approval_threshold?: number
          created_at?: string
          id?: string
          is_active?: boolean
          low_balance_pct?: number
          name: string
          per_txn_limit: number
        }
        Update: {
          amount?: number
          approval_threshold?: number
          created_at?: string
          id?: string
          is_active?: boolean
          low_balance_pct?: number
          name?: string
          per_txn_limit?: number
        }
        Relationships: []
      }
      notification_log: {
        Row: {
          created_at: string
          entity_id: string | null
          entity_type: string | null
          error: string | null
          event: string
          id: number
          recipient_email: string
          recipient_id: string | null
          status: string
          subject: string
        }
        Insert: {
          created_at?: string
          entity_id?: string | null
          entity_type?: string | null
          error?: string | null
          event: string
          id?: never
          recipient_email: string
          recipient_id?: string | null
          status: string
          subject: string
        }
        Update: {
          created_at?: string
          entity_id?: string | null
          entity_type?: string | null
          error?: string | null
          event?: string
          id?: never
          recipient_email?: string
          recipient_id?: string | null
          status?: string
          subject?: string
        }
        Relationships: []
      }
      rate_limits: {
        Row: {
          hits: number
          key: string
          window_start: string
        }
        Insert: {
          hits?: number
          key: string
          window_start: string
        }
        Update: {
          hits?: number
          key?: string
          window_start?: string
        }
        Relationships: []
      }
      replenishments: {
        Row: {
          created_at: string
          fund_id: string
          id: string
          request_no: string
          requested_by: string | null
          review_note: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          status: Database["public"]["Enums"]["replenishment_status"]
          total: number
        }
        Insert: {
          created_at?: string
          fund_id: string
          id?: string
          request_no: string
          requested_by?: string | null
          review_note?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: Database["public"]["Enums"]["replenishment_status"]
          total?: number
        }
        Update: {
          created_at?: string
          fund_id?: string
          id?: string
          request_no?: string
          requested_by?: string | null
          review_note?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: Database["public"]["Enums"]["replenishment_status"]
          total?: number
        }
        Relationships: [
          {
            foreignKeyName: "replenishments_fund_id_fkey"
            columns: ["fund_id"]
            isOneToOne: false
            referencedRelation: "fund_balance_v"
            referencedColumns: ["fund_id"]
          },
          {
            foreignKeyName: "replenishments_fund_id_fkey"
            columns: ["fund_id"]
            isOneToOne: false
            referencedRelation: "funds"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "replenishments_requested_by_fkey"
            columns: ["requested_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "replenishments_reviewed_by_fkey"
            columns: ["reviewed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      voucher_items: {
        Row: {
          amount: number
          category_id: string
          id: string
          particulars: string
          position: number
          voucher_id: string
        }
        Insert: {
          amount: number
          category_id: string
          id?: string
          particulars: string
          position: number
          voucher_id: string
        }
        Update: {
          amount?: number
          category_id?: string
          id?: string
          particulars?: string
          position?: number
          voucher_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "voucher_items_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "voucher_items_voucher_id_fkey"
            columns: ["voucher_id"]
            isOneToOne: false
            referencedRelation: "vouchers"
            referencedColumns: ["id"]
          },
        ]
      }
      vouchers: {
        Row: {
          amount: number
          approved_at: string | null
          approved_by: string | null
          category_id: string
          created_at: string
          fund_id: string
          id: string
          no_receipt_reason: string | null
          paper_drive_url: string | null
          paper_voucher_path: string | null
          particulars: string
          payee: string
          pcv_number: string
          prepared_by: string
          receipt_drive_url: string | null
          receipt_path: string | null
          reject_reason: string | null
          released_at: string | null
          replenishment_id: string | null
          status: Database["public"]["Enums"]["voucher_status"]
          submitted_at: string | null
          updated_at: string
          void_reason: string | null
          voucher_date: string
        }
        Insert: {
          amount: number
          approved_at?: string | null
          approved_by?: string | null
          category_id: string
          created_at?: string
          fund_id: string
          id?: string
          no_receipt_reason?: string | null
          paper_drive_url?: string | null
          paper_voucher_path?: string | null
          particulars: string
          payee: string
          pcv_number: string
          prepared_by: string
          receipt_drive_url?: string | null
          receipt_path?: string | null
          reject_reason?: string | null
          released_at?: string | null
          replenishment_id?: string | null
          status?: Database["public"]["Enums"]["voucher_status"]
          submitted_at?: string | null
          updated_at?: string
          void_reason?: string | null
          voucher_date?: string
        }
        Update: {
          amount?: number
          approved_at?: string | null
          approved_by?: string | null
          category_id?: string
          created_at?: string
          fund_id?: string
          id?: string
          no_receipt_reason?: string | null
          paper_drive_url?: string | null
          paper_voucher_path?: string | null
          particulars?: string
          payee?: string
          pcv_number?: string
          prepared_by?: string
          receipt_drive_url?: string | null
          receipt_path?: string | null
          reject_reason?: string | null
          released_at?: string | null
          replenishment_id?: string | null
          status?: Database["public"]["Enums"]["voucher_status"]
          submitted_at?: string | null
          updated_at?: string
          void_reason?: string | null
          voucher_date?: string
        }
        Relationships: [
          {
            foreignKeyName: "vouchers_approved_by_fkey"
            columns: ["approved_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vouchers_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vouchers_fund_id_fkey"
            columns: ["fund_id"]
            isOneToOne: false
            referencedRelation: "fund_balance_v"
            referencedColumns: ["fund_id"]
          },
          {
            foreignKeyName: "vouchers_fund_id_fkey"
            columns: ["fund_id"]
            isOneToOne: false
            referencedRelation: "funds"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vouchers_prepared_by_fkey"
            columns: ["prepared_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vouchers_replenishment_id_fkey"
            columns: ["replenishment_id"]
            isOneToOne: false
            referencedRelation: "replenishments"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      deal_summaries: {
        Row: {
          id: string
          deal_no: string
          buyer_name: string
          buyer_address: string | null
          buyer_contact: string | null
          sale_type: string
          institution: string | null
          agreed_price: number
          down_payment: number | null
          amount_due: number
          loan_amount: number
          processing_fee: number
          monthly_payment: number | null
          years: number | null
          opening_paid: number
          trade_in_value: number
          trade_in: Json | null
          lieu_amount: number
          lieu_until: string | null
          due_date: string | null
          due_text: string | null
          loan_status: string
          loan_since: string | null
          loan_released_on: string | null
          status: string
          cancelled_at: string | null
          cancel_reason: string | null
          refund_amount: number | null
          created_by: string
          created_at: string
          terms: Json
          created_by_name: string | null
          approved_paid: number
          approved_payout: number
          approved_count: number
          pending_paid: number
          pending_count: number
          balance: number
          units: Json
          receipt_nos: string | null
        }
        Relationships: []
      }
      receipt_list: {
        Row: {
          id: string
          receipt_no: string
          deal_id: string
          deal_no: string
          buyer_name: string
          sale_type: string
          receipt_date: string
          kind: string
          amount: number
          payout: number
          balance_after: number
          status: string
          submitted_by: string
          submitted_by_name: string | null
          submitted_at: string
          reviewed_by: string | null
          reviewed_by_name: string | null
          reviewed_at: string | null
          reject_reason: string | null
          void_reason: string | null
          remarks: string | null
          notes: Json | null
          snapshot: Json
          drive_file_id: string | null
          created_at: string
          payments: Json
          payout_proofs: number
        }
        Relationships: []
      }
      fund_balance_v: {
        Row: {
          expected_cash: number | null
          fund_amount: number | null
          fund_id: string | null
          is_low: boolean | null
          name: string | null
          released_vouchers_total: number | null
        }
        Relationships: []
      }
    }
    Functions: {
      submit_receipt: { Args: { p_actor: string; p_payload: Json; p_require_proofs?: boolean }; Returns: Json }
      review_receipt: { Args: { p_actor: string; p_receipt_id: string; p_approve: boolean; p_reason?: string }; Returns: Json }
      void_receipt: { Args: { p_actor: string; p_receipt_id: string; p_reason: string }; Returns: Json }
      cancel_deal: { Args: { p_actor: string; p_deal_id: string; p_reason: string; p_refund?: number }; Returns: Json }
      set_loan_status: { Args: { p_actor: string; p_deal_id: string; p_status: string; p_on?: string }; Returns: Json }
      update_settings: { Args: { p_actor: string; p_config: Json }; Returns: undefined }
      queue_sync: { Args: { p_receipt_id: string; p_event: string; p_targets: string[] }; Returns: undefined }
      claim_sync_jobs: { Args: { p_limit?: number; p_receipt_id?: string }; Returns: Database["public"]["Tables"]["sync_jobs"]["Row"][] }
      is_admin: { Args: Record<string, never>; Returns: boolean }
      is_approver: { Args: Record<string, never>; Returns: boolean }
      app_role: {
        Args: never
        Returns: Database["public"]["Enums"]["pcf_role"]
      }
      approve_voucher: { Args: { p_id: string }; Returns: undefined }
      assign_custodian_funds: {
        Args: { p_fund_ids: string[]; p_user_id: string }
        Returns: undefined
      }
      can_access_fund: { Args: { p_fund_id: string }; Returns: boolean }
      check_rate_limit: {
        Args: { p_key: string; p_limit: number; p_window_seconds: number }
        Returns: boolean
      }
      close_replenishment: { Args: { p_id: string }; Returns: undefined }
      create_replenishment: { Args: { p_fund_id: string }; Returns: string }
      create_voucher: {
        Args: {
          p_amount: number
          p_category_id: string
          p_fund_id: string
          p_no_receipt_reason?: string
          p_particulars: string
          p_payee: string
          p_receipt_path?: string
          p_voucher_date?: string
        }
        Returns: string
      }
      create_voucher_lines: {
        Args: {
          p_fund_id: string
          p_items: Json
          p_no_receipt_reason?: string
          p_payee: string
          p_receipt_path?: string
          p_voucher_date?: string
        }
        Returns: string
      }
      next_pcv_number: { Args: { p_fund_id: string }; Returns: string }
      notification_recipients: {
        Args: {
          p_exclude?: string[]
          p_include?: string[]
          p_roles: Database["public"]["Enums"]["pcf_role"][]
        }
        Returns: {
          email: string
          full_name: string
          id: string
          role: Database["public"]["Enums"]["pcf_role"]
        }[]
      }
      record_cash_count: {
        Args: { p_counted: number; p_fund_id: string; p_note?: string }
        Returns: string
      }
      reject_voucher: {
        Args: { p_id: string; p_reason: string }
        Returns: undefined
      }
      release_voucher: { Args: { p_id: string }; Returns: undefined }
      require_fund_access: { Args: { p_fund_id: string }; Returns: undefined }
      require_role: {
        Args: { p_roles: Database["public"]["Enums"]["pcf_role"][] }
        Returns: Database["public"]["Enums"]["pcf_role"]
      }
      requires_pre_approval: {
        Args: { p_amount: number; p_fund_id: string }
        Returns: boolean
      }
      return_voucher: {
        Args: { p_id: string; p_reason: string }
        Returns: undefined
      }
      review_replenishment: {
        Args: { p_approve: boolean; p_id: string; p_note?: string }
        Returns: undefined
      }
      set_fund_custodians: {
        Args: { p_custodian_ids: string[]; p_fund_id: string }
        Returns: undefined
      }
      submit_replenishment: { Args: { p_id: string }; Returns: undefined }
      submit_voucher: { Args: { p_id: string }; Returns: undefined }
      update_voucher_lines: {
        Args: {
          p_id: string
          p_items: Json
          p_payee: string
          p_voucher_date?: string
        }
        Returns: undefined
      }
      void_voucher: {
        Args: { p_id: string; p_reason: string }
        Returns: undefined
      }
    }
    Enums: {
      pcf_role: "admin" | "custodian" | "approver" | "accounting"
      replenishment_status:
        | "draft"
        | "submitted"
        | "approved"
        | "rejected"
        | "closed"
      voucher_status:
        | "draft"
        | "submitted"
        | "approved"
        | "released"
        | "closed"
        | "rejected"
        | "void"
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
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
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {
      pcf_role: ["admin", "custodian", "approver", "accounting"],
      replenishment_status: [
        "draft",
        "submitted",
        "approved",
        "rejected",
        "closed",
      ],
      voucher_status: [
        "draft",
        "submitted",
        "approved",
        "released",
        "closed",
        "rejected",
        "void",
      ],
    },
  },
} as const
