
export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export type Database = {
  
  "graphql_public": {
          Tables: {
            [_ in never]: never
          }
          Views: {
            [_ in never]: never
          }
          Functions: {
            "graphql":
{ Args: { "extensions"?: Json,"operationName"?: string,"query"?: string,"variables"?: Json }; Returns: Json
                           }
          }
          Enums: {
            [_ in never]: never
          }
          CompositeTypes: {
            [_ in never]: never
          }
        },"public": {
          Tables: {
            "audit_logs": {
                  Row: {
                    "action": string,"actor_id": string | null,"after": Json | null,"before": Json | null,"created_at": string,"entity": string,"entity_id": string | null,"id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "action": string,"actor_id"?: string | null,"after"?: Json | null,"before"?: Json | null,"created_at"?: string,"entity": string,"entity_id"?: string | null,"id"?: string
                  }
                  Update: {
                    "action"?: string,"actor_id"?: string | null,"after"?: Json | null,"before"?: Json | null,"created_at"?: string,"entity"?: string,"entity_id"?: string | null,"id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "audit_logs_actor_id_fkey"
      columns: ["actor_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"deals": {
                  Row: {
                    "agreed_price": number,"balance": number,"buyer_address": string | null,"buyer_contact": string | null,"buyer_name": string,"cancel_reason": string | null,"chassis_no": string | null,"color": string | null,"created_at": string,"created_by": string,"forfeited": boolean,"id": string,"make_type": string | null,"motor_no": string | null,"plate_no": string,"status": string,"total_paid": number,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "agreed_price": number,"balance": number,"buyer_address"?: string | null,"buyer_contact"?: string | null,"buyer_name": string,"cancel_reason"?: string | null,"chassis_no"?: string | null,"color"?: string | null,"created_at"?: string,"created_by": string,"forfeited"?: boolean,"id"?: string,"make_type"?: string | null,"motor_no"?: string | null,"plate_no": string,"status"?: string,"total_paid"?: number,"updated_at"?: string
                  }
                  Update: {
                    "agreed_price"?: number,"balance"?: number,"buyer_address"?: string | null,"buyer_contact"?: string | null,"buyer_name"?: string,"cancel_reason"?: string | null,"chassis_no"?: string | null,"color"?: string | null,"created_at"?: string,"created_by"?: string,"forfeited"?: boolean,"id"?: string,"make_type"?: string | null,"motor_no"?: string | null,"plate_no"?: string,"status"?: string,"total_paid"?: number,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "deals_created_by_fkey"
      columns: ["created_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"profiles": {
                  Row: {
                    "created_at": string,"full_name": string | null,"id": string,"role": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"full_name"?: string | null,"id": string,"role"?: string
                  }
                  Update: {
                    "created_at"?: string,"full_name"?: string | null,"id"?: string,"role"?: string
                  }
                  Relationships: [
                    
                  ]
                },"receipt_drafts": {
                  Row: {
                    "created_at": string,"created_by": string,"error": string | null,"extraction": Json | null,"id": string,"photo_path": string,"status": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"created_by"?: string,"error"?: string | null,"extraction"?: Json | null,"id"?: string,"photo_path": string,"status"?: string
                  }
                  Update: {
                    "created_at"?: string,"created_by"?: string,"error"?: string | null,"extraction"?: Json | null,"id"?: string,"photo_path"?: string,"status"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "receipt_drafts_created_by_fkey"
      columns: ["created_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"receipts": {
                  Row: {
                    "amount": number,"amount_words": string | null,"balance_after": number,"balance_due_date": string | null,"balance_words": string | null,"bank_branch": string | null,"check_no": string | null,"created_at": string,"created_by": string,"deal_id": string,"drive_file_id": string | null,"extraction_raw": Json | null,"id": string,"paper_payment_type": string | null,"payment_method": string | null,"payment_type": string,"photo_path": string | null,"receipt_date": string | null,"receipt_no": string,"status": string,"void_reason": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "amount": number,"amount_words"?: string | null,"balance_after": number,"balance_due_date"?: string | null,"balance_words"?: string | null,"bank_branch"?: string | null,"check_no"?: string | null,"created_at"?: string,"created_by": string,"deal_id": string,"drive_file_id"?: string | null,"extraction_raw"?: Json | null,"id"?: string,"paper_payment_type"?: string | null,"payment_method"?: string | null,"payment_type": string,"photo_path"?: string | null,"receipt_date"?: string | null,"receipt_no": string,"status"?: string,"void_reason"?: string | null
                  }
                  Update: {
                    "amount"?: number,"amount_words"?: string | null,"balance_after"?: number,"balance_due_date"?: string | null,"balance_words"?: string | null,"bank_branch"?: string | null,"check_no"?: string | null,"created_at"?: string,"created_by"?: string,"deal_id"?: string,"drive_file_id"?: string | null,"extraction_raw"?: Json | null,"id"?: string,"paper_payment_type"?: string | null,"payment_method"?: string | null,"payment_type"?: string,"photo_path"?: string | null,"receipt_date"?: string | null,"receipt_no"?: string,"status"?: string,"void_reason"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "receipts_created_by_fkey"
      columns: ["created_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "receipts_deal_id_fkey"
      columns: ["deal_id"]
isOneToOne: false
      referencedRelation: "deals"
      referencedColumns: ["id"]
    }
                  ]
                },"sync_jobs": {
                  Row: {
                    "attempts": number,"created_at": string,"id": string,"last_error": string | null,"next_run_at": string,"receipt_id": string,"status": string,"target": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "attempts"?: number,"created_at"?: string,"id"?: string,"last_error"?: string | null,"next_run_at"?: string,"receipt_id": string,"status"?: string,"target": string,"updated_at"?: string
                  }
                  Update: {
                    "attempts"?: number,"created_at"?: string,"id"?: string,"last_error"?: string | null,"next_run_at"?: string,"receipt_id"?: string,"status"?: string,"target"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "sync_jobs_receipt_id_fkey"
      columns: ["receipt_id"]
isOneToOne: false
      referencedRelation: "receipts"
      referencedColumns: ["id"]
    }
                  ]
                }
          }
          Views: {
            [_ in never]: never
          }
          Functions: {
            "is_admin":
{ Args: Record<PropertyKey, never>; Returns: boolean
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

type DatabaseWithoutInternals = Omit<Database, '__InternalSupabase'>

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
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
  ? (DefaultSchema["Tables"] & DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
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
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
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
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
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
    : never = never
> = DefaultSchemaEnumNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
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
    : never = never
> = PublicCompositeTypeNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
  ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
  : never

export const Constants = {
  "graphql_public": {
          Enums: {
            
          }
        },"public": {
          Enums: {
            
          }
        }
} as const
