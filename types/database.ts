/**
 * Supabase database types for Marianbridge.
 *
 * Hand-authored to match supabase/migrations/0001_init.sql. After applying the
 * migration to a live project, regenerate with:
 *   npm run gen-types
 * (keeps this file authoritative without manual drift).
 */
export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type UserRole =
  | 'captain'
  | 'charter_party'
  | 'ship_agent'
  | 'supplier'
  | 'admin';

export type OverallStatus =
  | 'draft'
  | 'pending_charter_approval'
  | 'charter_rejected'
  | 'pending_payment'
  | 'pending_port_approval'
  | 'active'
  | 'in_execution'
  | 'completed'
  | 'cancelled';

export type LineStatus =
  | 'pending_supplier'
  | 'supplier_quoted'
  | 'pending_charter_selection'
  | 'supplier_accepted'
  | 'supplier_declined'
  | 'preparing'
  | 'ready'
  | 'in_transit'
  | 'delivered'
  | 'cancelled';

export type PaymentMethod = 'online' | 'cod';
export type PaymentStatus = 'unpaid' | 'paid' | 'refunded';
export type DocumentType = 'invoice' | 'delivery_note' | 'certificate' | 'approval_doc' | 'other';
export type NotificationType = 'approval_request' | 'order_update' | 'message' | 'system';

export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string;
          full_name: string;
          role: UserRole;
          company_name: string | null;
          phone: string | null;
          verified: boolean;
          avatar_url: string | null;
          push_token: string | null;
          created_at: string;
          username: string | null;
          email: string | null;
          passport_no: string | null;
          sid_no: string | null;
          cp_no: string | null;
          imo_no: string | null;
          contract_date: string | null;
          agent_type: string | null;
          company_reg_no: string | null;
          imo_agent_code: string | null;
          tin_no: string | null;
          unlocode: string | null;
          port_id_text: string | null;
          isps_code: string | null;
          business_no: string | null;
          duns_no: string | null;
          admin_id: string | null;
          service_category_id: string | null;
        };
        Insert: {
          id: string;
          full_name: string;
          role: UserRole;
          company_name?: string | null;
          phone?: string | null;
          verified?: boolean;
          avatar_url?: string | null;
          push_token?: string | null;
          created_at?: string;
          username?: string | null;
          email?: string | null;
          passport_no?: string | null;
          sid_no?: string | null;
          cp_no?: string | null;
          imo_no?: string | null;
          contract_date?: string | null;
          agent_type?: string | null;
          company_reg_no?: string | null;
          imo_agent_code?: string | null;
          tin_no?: string | null;
          unlocode?: string | null;
          port_id_text?: string | null;
          isps_code?: string | null;
          business_no?: string | null;
          duns_no?: string | null;
          admin_id?: string | null;
          service_category_id?: string | null;
        };
        Update: Partial<Database['public']['Tables']['profiles']['Insert']>;
        Relationships: [];
      };
      ports: {
        Row: {
          id: string;
          name: string;
          country: string | null;
          locode: string | null;
          active: boolean;
        };
        Insert: {
          id?: string;
          name: string;
          country?: string | null;
          locode?: string | null;
          active?: boolean;
        };
        Update: Partial<Database['public']['Tables']['ports']['Insert']>;
        Relationships: [];
      };
      service_categories: {
        Row: {
          id: string;
          name: string;
          icon_name: string | null;
        };
        Insert: {
          id?: string;
          name: string;
          icon_name?: string | null;
        };
        Update: Partial<Database['public']['Tables']['service_categories']['Insert']>;
        Relationships: [];
      };
      supplier_service_mappings: {
        Row: {
          id: string;
          port_id: string | null;
          service_category_id: string | null;
          supplier_profile_id: string | null;
          active: boolean;
        };
        Insert: {
          id?: string;
          port_id?: string | null;
          service_category_id?: string | null;
          supplier_profile_id?: string | null;
          active?: boolean;
        };
        Update: Partial<Database['public']['Tables']['supplier_service_mappings']['Insert']>;
        Relationships: [];
      };
      orders: {
        Row: {
          id: string;
          order_number: string | null;
          captain_id: string | null;
          vessel_name: string;
          imo_number: string | null;
          port_id: string | null;
          eta: string | null;
          etd: string | null;
          overall_status: OverallStatus;
          charter_party_id: string | null;
          ship_agent_id: string | null;
          charter_comments: string | null;
          total_amount: number | null;
          payment_method: PaymentMethod | null;
          payment_status: PaymentStatus | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          order_number?: string | null;
          captain_id?: string | null;
          vessel_name: string;
          imo_number?: string | null;
          port_id?: string | null;
          eta?: string | null;
          etd?: string | null;
          overall_status?: OverallStatus;
          charter_party_id?: string | null;
          ship_agent_id?: string | null;
          charter_comments?: string | null;
          total_amount?: number | null;
          payment_method?: PaymentMethod | null;
          payment_status?: PaymentStatus | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database['public']['Tables']['orders']['Insert']>;
        Relationships: [];
      };
      order_line_items: {
        Row: {
          id: string;
          order_id: string;
          service_category_id: string | null;
          supplier_mapping_id: string | null;
          quantity: number | null;
          unit: string | null;
          specifications: string | null;
          special_instructions: string | null;
          requested_datetime: string | null;
          unit_price: number | null;
          total_price: number | null;
          line_status: LineStatus;
          supplier_decline_reason: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          order_id: string;
          service_category_id?: string | null;
          supplier_mapping_id?: string | null;
          quantity?: number | null;
          unit?: string | null;
          specifications?: string | null;
          special_instructions?: string | null;
          requested_datetime?: string | null;
          unit_price?: number | null;
          total_price?: number | null;
          line_status?: LineStatus;
          supplier_decline_reason?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database['public']['Tables']['order_line_items']['Insert']>;
        Relationships: [];
      };
      order_status_updates: {
        Row: {
          id: string;
          order_line_item_id: string | null;
          updated_by: string | null;
          old_status: string | null;
          new_status: string | null;
          note: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          order_line_item_id?: string | null;
          updated_by?: string | null;
          old_status?: string | null;
          new_status?: string | null;
          note?: string | null;
          created_at?: string;
        };
        Update: Partial<Database['public']['Tables']['order_status_updates']['Insert']>;
        Relationships: [];
      };
      order_documents: {
        Row: {
          id: string;
          order_id: string | null;
          order_line_item_id: string | null;
          uploaded_by: string | null;
          file_name: string | null;
          file_url: string | null;
          document_type: DocumentType | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          order_id?: string | null;
          order_line_item_id?: string | null;
          uploaded_by?: string | null;
          file_name?: string | null;
          file_url?: string | null;
          document_type?: DocumentType | null;
          created_at?: string;
        };
        Update: Partial<Database['public']['Tables']['order_documents']['Insert']>;
        Relationships: [];
      };
      messages: {
        Row: {
          id: string;
          order_id: string | null;
          order_line_item_id: string | null;
          sender_id: string | null;
          receiver_id: string | null;
          content: string;
          read_by: string[] | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          order_id?: string | null;
          order_line_item_id?: string | null;
          sender_id?: string | null;
          receiver_id?: string | null;
          content: string;
          read_by?: string[] | null;
          created_at?: string;
        };
        Update: Partial<Database['public']['Tables']['messages']['Insert']>;
        Relationships: [];
      };
      notifications: {
        Row: {
          id: string;
          recipient_id: string | null;
          title: string | null;
          body: string | null;
          type: NotificationType | null;
          order_id: string | null;
          read: boolean;
          created_at: string;
        };
        Insert: {
          id?: string;
          recipient_id?: string | null;
          title?: string | null;
          body?: string | null;
          type?: NotificationType | null;
          order_id?: string | null;
          read?: boolean;
          created_at?: string;
        };
        Update: Partial<Database['public']['Tables']['notifications']['Insert']>;
        Relationships: [];
      };
      chat_permissions: {
        Row: {
          id: string;
          sender_role: string;
          receiver_role: string;
        };
        Insert: {
          id?: string;
          sender_role: string;
          receiver_role: string;
        };
        Update: Partial<Database['public']['Tables']['chat_permissions']['Insert']>;
        Relationships: [];
      };
      active_sessions: {
        Row: {
          id: string;
          user_id: string;
          last_heartbeat: string;
          metadata: Record<string, unknown> | null;
        };
        Insert: {
          id?: string;
          user_id: string;
          last_heartbeat?: string;
          metadata?: Record<string, unknown> | null;
        };
        Update: Partial<Database['public']['Tables']['active_sessions']['Insert']>;
        Relationships: [];
      };
      admin_password_resets: {
        Row: {
          id: string;
          requested_by: string;
          target_user_id: string;
          reset_token: string;
          used: boolean;
          created_at: string;
          expires_at: string;
        };
        Insert: {
          id?: string;
          requested_by: string;
          target_user_id: string;
          reset_token?: string;
          used?: boolean;
          created_at?: string;
          expires_at?: string;
        };
        Update: Partial<Database['public']['Tables']['admin_password_resets']['Insert']>;
        Relationships: [];
      };
      supplier_quotations: {
        Row: {
          id: string;
          order_line_item_id: string;
          supplier_profile_id: string | null;
          amount: number;
          description: string | null;
          is_selected: boolean;
          created_at: string;
        };
        Insert: {
          id?: string;
          order_line_item_id: string;
          supplier_profile_id?: string | null;
          amount: number;
          description?: string | null;
          is_selected?: boolean;
          created_at?: string;
        };
        Update: Partial<Database['public']['Tables']['supplier_quotations']['Insert']>;
        Relationships: [];
      };
    };
    Views: { [_ in never]: never };
    Functions: {
      current_user_role: { Args: Record<string, never>; Returns: string };
      current_user_verified: { Args: Record<string, never>; Returns: boolean };
      user_can_access_order: { Args: { p_order_id: string }; Returns: boolean };
      supplier_owns_line_item: { Args: { p_line_item_id: string }; Returns: boolean };
      can_chat: { Args: { sender_id: string; receiver_id: string }; Returns: boolean };
      admin_initiate_password_reset: { Args: { target_user_id: string }; Returns: string };
      get_user_email_for_reset: { Args: { target_user_id: string }; Returns: string };
      get_email_by_username: { Args: { p_username: string }; Returns: string };
    };
    Enums: { [_ in never]: never };
    CompositeTypes: { [_ in never]: never };
  };
}

// Convenience row aliases used across the app.
export type Profile = Database['public']['Tables']['profiles']['Row'];
export type Port = Database['public']['Tables']['ports']['Row'];
export type ServiceCategory = Database['public']['Tables']['service_categories']['Row'];
export type SupplierServiceMapping = Database['public']['Tables']['supplier_service_mappings']['Row'];
export type Order = Database['public']['Tables']['orders']['Row'];
export type OrderLineItem = Database['public']['Tables']['order_line_items']['Row'];
export type OrderStatusUpdate = Database['public']['Tables']['order_status_updates']['Row'];
export type OrderDocument = Database['public']['Tables']['order_documents']['Row'];
export type Message = Database['public']['Tables']['messages']['Row'];
export type Notification = Database['public']['Tables']['notifications']['Row'];
export type ChatPermission = Database['public']['Tables']['chat_permissions']['Row'];
export type ActiveSession = Database['public']['Tables']['active_sessions']['Row'];
export type AdminPasswordReset = Database['public']['Tables']['admin_password_resets']['Row'];
export type SupplierQuotation = Database['public']['Tables']['supplier_quotations']['Row'];
