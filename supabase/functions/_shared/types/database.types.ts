export type UserEntitlement = Database["public"]["Tables"]["user_entitlements"]["Row"]
export type SubscriptionPlan = Database["public"]["Tables"]["subscription_plans"]["Row"]

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
        PostgrestVersion: "14.1"
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
            customer_portal_configurations: {
                Row: {
                    id: string
                    is_active: boolean
                }
                Insert: {
                    id: string
                    is_active: boolean
                }
                Update: {
                    id?: string
                    is_active?: boolean
                }
                Relationships: []
            }
            subscription_plans: {
                Row: {
                    behavior: Database["public"]["Enums"]["price_behavior"]
                    currency: string
                    description: string
                    downgrade_plan_id: number | null
                    id: number
                    interval_words_limit: number | null
                    is_active: boolean
                    price_id: string
                    product_id: string
                    recurring_interval: Database["public"]["Enums"]["recurring_interval"]
                    recurring_interval_count: number
                    title: string
                    trial_period_days: number | null
                    unit_amount: number
                }
                Insert: {
                    behavior?: Database["public"]["Enums"]["price_behavior"]
                    currency: string
                    description: string
                    downgrade_plan_id?: number | null
                    id?: number
                    interval_words_limit?: number | null
                    is_active: boolean
                    price_id: string
                    product_id: string
                    recurring_interval: Database["public"]["Enums"]["recurring_interval"]
                    recurring_interval_count: number
                    title: string
                    trial_period_days?: number | null
                    unit_amount: number
                }
                Update: {
                    behavior?: Database["public"]["Enums"]["price_behavior"]
                    currency?: string
                    description?: string
                    downgrade_plan_id?: number | null
                    id?: number
                    interval_words_limit?: number | null
                    is_active?: boolean
                    price_id?: string
                    product_id?: string
                    recurring_interval?: Database["public"]["Enums"]["recurring_interval"]
                    recurring_interval_count?: number
                    title?: string
                    trial_period_days?: number | null
                    unit_amount?: number
                }
                Relationships: [
                    {
                        foreignKeyName: "subscription_plans_downgrade_plan_id_fkey"
                        columns: ["downgrade_plan_id"]
                        isOneToOne: false
                        referencedRelation: "subscription_plans"
                        referencedColumns: ["id"]
                    },
                ]
            }
            user_entitlements: {
                Row: {
                    cancel_at: string | null
                    current_period_end: string | null
                    current_period_start: string | null
                    id: string
                    next_period_plan_id: number | null
                    plan_id: number | null
                    stripe_customer_id: string | null
                    subscription_id: string | null
                    subscription_status:
                        | Database["public"]["Enums"]["subscription_status"]
                        | null
                    trial_end: string | null
                    trial_used: boolean
                }
                Insert: {
                    cancel_at?: string | null
                    current_period_end?: string | null
                    current_period_start?: string | null
                    id: string
                    next_period_plan_id?: number | null
                    plan_id?: number | null
                    stripe_customer_id?: string | null
                    subscription_id?: string | null
                    subscription_status?:
                        | Database["public"]["Enums"]["subscription_status"]
                        | null
                    trial_end?: string | null
                    trial_used?: boolean
                }
                Update: {
                    cancel_at?: string | null
                    current_period_end?: string | null
                    current_period_start?: string | null
                    id?: string
                    next_period_plan_id?: number | null
                    plan_id?: number | null
                    stripe_customer_id?: string | null
                    subscription_id?: string | null
                    subscription_status?:
                        | Database["public"]["Enums"]["subscription_status"]
                        | null
                    trial_end?: string | null
                    trial_used?: boolean
                }
                Relationships: [
                    {
                        foreignKeyName: "user_entitlements_next_period_plan_id_fkey"
                        columns: ["next_period_plan_id"]
                        isOneToOne: false
                        referencedRelation: "subscription_plans"
                        referencedColumns: ["id"]
                    },
                ]
            }
        }
        Views: never
        Functions: {
            [_ in never]: never
        }
        Enums: {
            event_type:
                | "transcription"
                | "upgrade_prompt_shown"
                | "quota_exceeded_shown"
                | "upgrade_clicked"
                | "app_launch"
                | "error"
            price_behavior: "one_time" | "recurring"
            recurring_interval: "day" | "week" | "month" | "year"
            subscription_status:
                | "incomplete"
                | "incomplete_expired"
                | "trialing"
                | "active"
                | "past_due"
                | "canceled"
                | "unpaid"
                | "paused"
            user_role: "owner" | "admin" | "user"
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
    } ? keyof (
            & DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
            & DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"]
        )
        : never = never,
> = DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
} ? (
        & DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
        & DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"]
    )[TableName] extends {
        Row: infer R
    } ? R
    : never
    : DefaultSchemaTableNameOrOptions extends keyof (
        & DefaultSchema["Tables"]
        & DefaultSchema["Views"]
    ) ? (
            & DefaultSchema["Tables"]
            & DefaultSchema["Views"]
        )[DefaultSchemaTableNameOrOptions] extends {
            Row: infer R
        } ? R
        : never
    : never

export type TablesInsert<
    DefaultSchemaTableNameOrOptions extends
        | keyof DefaultSchema["Tables"]
        | { schema: keyof DatabaseWithoutInternals },
    TableName extends DefaultSchemaTableNameOrOptions extends {
        schema: keyof DatabaseWithoutInternals
    } ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
        : never = never,
> = DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
} ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
        Insert: infer I
    } ? I
    : never
    : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
        ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
            Insert: infer I
        } ? I
        : never
    : never

export type TablesUpdate<
    DefaultSchemaTableNameOrOptions extends
        | keyof DefaultSchema["Tables"]
        | { schema: keyof DatabaseWithoutInternals },
    TableName extends DefaultSchemaTableNameOrOptions extends {
        schema: keyof DatabaseWithoutInternals
    } ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
        : never = never,
> = DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
} ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
        Update: infer U
    } ? U
    : never
    : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
        ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
            Update: infer U
        } ? U
        : never
    : never

export type Enums<
    DefaultSchemaEnumNameOrOptions extends
        | keyof DefaultSchema["Enums"]
        | { schema: keyof DatabaseWithoutInternals },
    EnumName extends DefaultSchemaEnumNameOrOptions extends {
        schema: keyof DatabaseWithoutInternals
    } ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
        : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
} ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
    : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
        ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
    PublicCompositeTypeNameOrOptions extends
        | keyof DefaultSchema["CompositeTypes"]
        | { schema: keyof DatabaseWithoutInternals },
    CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
        schema: keyof DatabaseWithoutInternals
    } ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
        : never = never,
> = PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
} ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
    : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
        ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
    graphql_public: {
        Enums: {},
    },
    public: {
        Enums: {
            price_behavior: ["one_time", "recurring"],
            recurring_interval: ["day", "week", "month", "year"],
            subscription_status: [
                "incomplete",
                "incomplete_expired",
                "trialing",
                "active",
                "past_due",
                "canceled",
                "unpaid",
                "paused",
            ],
        },
    },
} as const
