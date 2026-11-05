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
          created_at: string
        }
        Insert: {
          id?: string
          full_name?: string | null
          role?: string
          created_at?: string
        }
        Update: {
          id?: string
          full_name?: string | null
          role?: string
          created_at?: string
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
    Enums: {},
  },
} as const
