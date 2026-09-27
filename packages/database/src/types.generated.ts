export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  public: {
    Tables: {
      alert_routing: {
        Row: {
          alert_type: Database['public']['Enums']['alert_type'];
          organization_id: string;
          route: Database['public']['Enums']['alert_route'];
          updated_at: string;
        };
        Insert: {
          alert_type: Database['public']['Enums']['alert_type'];
          organization_id: string;
          route: Database['public']['Enums']['alert_route'];
          updated_at?: string;
        };
        Update: {
          alert_type?: Database['public']['Enums']['alert_type'];
          organization_id?: string;
          route?: Database['public']['Enums']['alert_route'];
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'alert_routing_organization_id_fkey';
            columns: ['organization_id'];
            isOneToOne: false;
            referencedRelation: 'organizations';
            referencedColumns: ['id'];
          },
        ];
      };
      alerts: {
        Row: {
          acknowledged_at: string | null;
          acknowledged_by: string | null;
          created_at: string;
          id: string;
          organization_id: string;
          payload: Json;
          severity: Database['public']['Enums']['alert_severity'];
          shift_id: string | null;
          station_id: string | null;
          type: Database['public']['Enums']['alert_type'];
        };
        Insert: {
          acknowledged_at?: string | null;
          acknowledged_by?: string | null;
          created_at?: string;
          id?: string;
          organization_id: string;
          payload?: Json;
          severity?: Database['public']['Enums']['alert_severity'];
          shift_id?: string | null;
          station_id?: string | null;
          type: Database['public']['Enums']['alert_type'];
        };
        Update: {
          acknowledged_at?: string | null;
          acknowledged_by?: string | null;
          created_at?: string;
          id?: string;
          organization_id?: string;
          payload?: Json;
          severity?: Database['public']['Enums']['alert_severity'];
          shift_id?: string | null;
          station_id?: string | null;
          type?: Database['public']['Enums']['alert_type'];
        };
        Relationships: [
          {
            foreignKeyName: 'alerts_shift_id_station_id_fkey';
            columns: ['shift_id', 'station_id'];
            isOneToOne: false;
            referencedRelation: 'shifts';
            referencedColumns: ['id', 'station_id'];
          },
          {
            foreignKeyName: 'alerts_station_id_organization_id_fkey';
            columns: ['station_id', 'organization_id'];
            isOneToOne: false;
            referencedRelation: 'stations';
            referencedColumns: ['id', 'organization_id'];
          },
        ];
      };
      audit_log: {
        Row: {
          action: Database['public']['Enums']['audit_action'];
          actor_employee_id: string | null;
          actor_role: string | null;
          actor_user_id: string | null;
          at: string;
          id: number;
          new_data: Json | null;
          old_data: Json | null;
          organization_id: string | null;
          row_id: string | null;
          table_name: string;
        };
        Insert: {
          action: Database['public']['Enums']['audit_action'];
          actor_employee_id?: string | null;
          actor_role?: string | null;
          actor_user_id?: string | null;
          at?: string;
          id?: never;
          new_data?: Json | null;
          old_data?: Json | null;
          organization_id?: string | null;
          row_id?: string | null;
          table_name: string;
        };
        Update: {
          action?: Database['public']['Enums']['audit_action'];
          actor_employee_id?: string | null;
          actor_role?: string | null;
          actor_user_id?: string | null;
          at?: string;
          id?: never;
          new_data?: Json | null;
          old_data?: Json | null;
          organization_id?: string | null;
          row_id?: string | null;
          table_name?: string;
        };
        Relationships: [];
      };
      bank_deposit_shifts: {
        Row: {
          deposit_id: string;
          organization_id: string;
          shift_id: string;
          station_id: string;
        };
        Insert: {
          deposit_id: string;
          organization_id: string;
          shift_id: string;
          station_id: string;
        };
        Update: {
          deposit_id?: string;
          organization_id?: string;
          shift_id?: string;
          station_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'bank_deposit_shifts_deposit_id_fkey';
            columns: ['deposit_id'];
            isOneToOne: false;
            referencedRelation: 'bank_deposits';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'bank_deposit_shifts_shift_id_fkey';
            columns: ['shift_id'];
            isOneToOne: false;
            referencedRelation: 'shifts';
            referencedColumns: ['id'];
          },
        ];
      };
      bank_deposits: {
        Row: {
          amount_fcfa: number;
          bank_ref: string | null;
          created_at: string;
          deposited_at: string;
          device_created_at: string;
          device_id: string;
          employee_id: string;
          evidence_id: string;
          id: string;
          organization_id: string;
          shift_id: string | null;
          station_id: string;
        };
        Insert: {
          amount_fcfa: number;
          bank_ref?: string | null;
          created_at?: string;
          deposited_at: string;
          device_created_at: string;
          device_id: string;
          employee_id: string;
          evidence_id: string;
          id?: string;
          organization_id: string;
          shift_id?: string | null;
          station_id: string;
        };
        Update: {
          amount_fcfa?: number;
          bank_ref?: string | null;
          created_at?: string;
          deposited_at?: string;
          device_created_at?: string;
          device_id?: string;
          employee_id?: string;
          evidence_id?: string;
          id?: string;
          organization_id?: string;
          shift_id?: string | null;
          station_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'bank_deposits_device_id_station_id_fkey';
            columns: ['device_id', 'station_id'];
            isOneToOne: false;
            referencedRelation: 'devices';
            referencedColumns: ['id', 'station_id'];
          },
          {
            foreignKeyName: 'bank_deposits_employee_id_station_id_fkey';
            columns: ['employee_id', 'station_id'];
            isOneToOne: false;
            referencedRelation: 'employees';
            referencedColumns: ['id', 'station_id'];
          },
          {
            foreignKeyName: 'bank_deposits_evidence_id_station_id_fkey';
            columns: ['evidence_id', 'station_id'];
            isOneToOne: false;
            referencedRelation: 'evidence_files';
            referencedColumns: ['id', 'station_id'];
          },
          {
            foreignKeyName: 'bank_deposits_shift_id_station_id_fkey';
            columns: ['shift_id', 'station_id'];
            isOneToOne: false;
            referencedRelation: 'shifts';
            referencedColumns: ['id', 'station_id'];
          },
          {
            foreignKeyName: 'bank_deposits_station_id_organization_id_fkey';
            columns: ['station_id', 'organization_id'];
            isOneToOne: false;
            referencedRelation: 'stations';
            referencedColumns: ['id', 'organization_id'];
          },
        ];
      };
      blind_count_lines: {
        Row: {
          blind_count_id: string;
          counted_qty: number;
          created_at: string;
          device_created_at: string;
          device_id: string;
          employee_id: string;
          id: string;
          organization_id: string;
          product_id: string;
          station_id: string;
        };
        Insert: {
          blind_count_id: string;
          counted_qty: number;
          created_at?: string;
          device_created_at: string;
          device_id: string;
          employee_id: string;
          id?: string;
          organization_id: string;
          product_id: string;
          station_id: string;
        };
        Update: {
          blind_count_id?: string;
          counted_qty?: number;
          created_at?: string;
          device_created_at?: string;
          device_id?: string;
          employee_id?: string;
          id?: string;
          organization_id?: string;
          product_id?: string;
          station_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'blind_count_lines_blind_count_id_station_id_fkey';
            columns: ['blind_count_id', 'station_id'];
            isOneToOne: false;
            referencedRelation: 'blind_counts';
            referencedColumns: ['id', 'station_id'];
          },
          {
            foreignKeyName: 'blind_count_lines_device_id_station_id_fkey';
            columns: ['device_id', 'station_id'];
            isOneToOne: false;
            referencedRelation: 'devices';
            referencedColumns: ['id', 'station_id'];
          },
          {
            foreignKeyName: 'blind_count_lines_employee_id_station_id_fkey';
            columns: ['employee_id', 'station_id'];
            isOneToOne: false;
            referencedRelation: 'employees';
            referencedColumns: ['id', 'station_id'];
          },
          {
            foreignKeyName: 'blind_count_lines_product_id_organization_id_fkey';
            columns: ['product_id', 'organization_id'];
            isOneToOne: false;
            referencedRelation: 'products';
            referencedColumns: ['id', 'organization_id'];
          },
          {
            foreignKeyName: 'blind_count_lines_station_id_organization_id_fkey';
            columns: ['station_id', 'organization_id'];
            isOneToOne: false;
            referencedRelation: 'stations';
            referencedColumns: ['id', 'organization_id'];
          },
        ];
      };
      blind_counts: {
        Row: {
          created_at: string;
          device_id: string | null;
          due_at: string;
          employee_id: string | null;
          id: string;
          organization_id: string;
          requested_at: string;
          requested_by: string | null;
          station_id: string;
          status: Database['public']['Enums']['blind_count_status'];
          submitted_at: string | null;
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          device_id?: string | null;
          due_at: string;
          employee_id?: string | null;
          id?: string;
          organization_id: string;
          requested_at?: string;
          requested_by?: string | null;
          station_id: string;
          status?: Database['public']['Enums']['blind_count_status'];
          submitted_at?: string | null;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          device_id?: string | null;
          due_at?: string;
          employee_id?: string | null;
          id?: string;
          organization_id?: string;
          requested_at?: string;
          requested_by?: string | null;
          station_id?: string;
          status?: Database['public']['Enums']['blind_count_status'];
          submitted_at?: string | null;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'blind_counts_device_id_station_id_fkey';
            columns: ['device_id', 'station_id'];
            isOneToOne: false;
            referencedRelation: 'devices';
            referencedColumns: ['id', 'station_id'];
          },
          {
            foreignKeyName: 'blind_counts_employee_id_station_id_fkey';
            columns: ['employee_id', 'station_id'];
            isOneToOne: false;
            referencedRelation: 'employees';
            referencedColumns: ['id', 'station_id'];
          },
          {
            foreignKeyName: 'blind_counts_station_id_organization_id_fkey';
            columns: ['station_id', 'organization_id'];
            isOneToOne: false;
            referencedRelation: 'stations';
            referencedColumns: ['id', 'organization_id'];
          },
        ];
      };
      cash_closings: {
        Row: {
          approved_voids_fcfa: number;
          card_fcfa: number;
          cash_count_id: string;
          closed_at: string;
          counted_cash_fcfa: number;
          created_at: string;
          credit_fcfa: number;
          credit_repayments_fcfa: number;
          deposit_mode: Database['public']['Enums']['deposit_mode'];
          details: Json;
          device_id: string;
          employee_id: string;
          expected_cash_fcfa: number;
          expected_fuel_fcfa: number;
          expected_garage_fcfa: number;
          expected_shop_fcfa: number;
          expected_total_fcfa: number;
          expected_wash_fcfa: number;
          id: string;
          justification: string | null;
          orange_money_fcfa: number;
          organization_id: string;
          shift_id: string;
          station_id: string;
          variance_fcfa: number;
          wave_fcfa: number;
        };
        Insert: {
          approved_voids_fcfa?: number;
          card_fcfa?: number;
          cash_count_id: string;
          closed_at?: string;
          counted_cash_fcfa: number;
          created_at?: string;
          credit_fcfa?: number;
          credit_repayments_fcfa?: number;
          deposit_mode: Database['public']['Enums']['deposit_mode'];
          details?: Json;
          device_id: string;
          employee_id: string;
          expected_cash_fcfa: number;
          expected_fuel_fcfa: number;
          expected_garage_fcfa?: number;
          expected_shop_fcfa?: number;
          expected_total_fcfa: number;
          expected_wash_fcfa?: number;
          id?: string;
          justification?: string | null;
          orange_money_fcfa?: number;
          organization_id: string;
          shift_id: string;
          station_id: string;
          variance_fcfa: number;
          wave_fcfa?: number;
        };
        Update: {
          approved_voids_fcfa?: number;
          card_fcfa?: number;
          cash_count_id?: string;
          closed_at?: string;
          counted_cash_fcfa?: number;
          created_at?: string;
          credit_fcfa?: number;
          credit_repayments_fcfa?: number;
          deposit_mode?: Database['public']['Enums']['deposit_mode'];
          details?: Json;
          device_id?: string;
          employee_id?: string;
          expected_cash_fcfa?: number;
          expected_fuel_fcfa?: number;
          expected_garage_fcfa?: number;
          expected_shop_fcfa?: number;
          expected_total_fcfa?: number;
          expected_wash_fcfa?: number;
          id?: string;
          justification?: string | null;
          orange_money_fcfa?: number;
          organization_id?: string;
          shift_id?: string;
          station_id?: string;
          variance_fcfa?: number;
          wave_fcfa?: number;
        };
        Relationships: [
          {
            foreignKeyName: 'cash_closings_cash_count_id_shift_id_fkey';
            columns: ['cash_count_id', 'shift_id'];
            isOneToOne: false;
            referencedRelation: 'cash_counts';
            referencedColumns: ['id', 'shift_id'];
          },
          {
            foreignKeyName: 'cash_closings_device_id_station_id_fkey';
            columns: ['device_id', 'station_id'];
            isOneToOne: false;
            referencedRelation: 'devices';
            referencedColumns: ['id', 'station_id'];
          },
          {
            foreignKeyName: 'cash_closings_employee_id_station_id_fkey';
            columns: ['employee_id', 'station_id'];
            isOneToOne: false;
            referencedRelation: 'employees';
            referencedColumns: ['id', 'station_id'];
          },
          {
            foreignKeyName: 'cash_closings_shift_id_station_id_fkey';
            columns: ['shift_id', 'station_id'];
            isOneToOne: false;
            referencedRelation: 'shifts';
            referencedColumns: ['id', 'station_id'];
          },
          {
            foreignKeyName: 'cash_closings_station_id_organization_id_fkey';
            columns: ['station_id', 'organization_id'];
            isOneToOne: false;
            referencedRelation: 'stations';
            referencedColumns: ['id', 'organization_id'];
          },
        ];
      };
      cash_counts: {
        Row: {
          created_at: string;
          denominations: Json;
          device_created_at: string;
          device_id: string;
          employee_id: string;
          id: string;
          organization_id: string;
          shift_id: string;
          station_id: string;
          total_fcfa: number;
        };
        Insert: {
          created_at?: string;
          denominations: Json;
          device_created_at: string;
          device_id: string;
          employee_id: string;
          id?: string;
          organization_id: string;
          shift_id: string;
          station_id: string;
          total_fcfa?: number;
        };
        Update: {
          created_at?: string;
          denominations?: Json;
          device_created_at?: string;
          device_id?: string;
          employee_id?: string;
          id?: string;
          organization_id?: string;
          shift_id?: string;
          station_id?: string;
          total_fcfa?: number;
        };
        Relationships: [
          {
            foreignKeyName: 'cash_counts_device_id_station_id_fkey';
            columns: ['device_id', 'station_id'];
            isOneToOne: false;
            referencedRelation: 'devices';
            referencedColumns: ['id', 'station_id'];
          },
          {
            foreignKeyName: 'cash_counts_employee_id_station_id_fkey';
            columns: ['employee_id', 'station_id'];
            isOneToOne: false;
            referencedRelation: 'employees';
            referencedColumns: ['id', 'station_id'];
          },
          {
            foreignKeyName: 'cash_counts_shift_id_station_id_fkey';
            columns: ['shift_id', 'station_id'];
            isOneToOne: false;
            referencedRelation: 'shifts';
            referencedColumns: ['id', 'station_id'];
          },
          {
            foreignKeyName: 'cash_counts_station_id_organization_id_fkey';
            columns: ['station_id', 'organization_id'];
            isOneToOne: false;
            referencedRelation: 'stations';
            referencedColumns: ['id', 'organization_id'];
          },
        ];
      };
      cash_variance_decisions: {
        Row: {
          closing_id: string;
          created_at: string;
          decided_by: string;
          decision: Database['public']['Enums']['cash_variance_decision'];
          id: string;
          note: string | null;
          organization_id: string;
          station_id: string;
        };
        Insert: {
          closing_id: string;
          created_at?: string;
          decided_by: string;
          decision: Database['public']['Enums']['cash_variance_decision'];
          id?: string;
          note?: string | null;
          organization_id: string;
          station_id: string;
        };
        Update: {
          closing_id?: string;
          created_at?: string;
          decided_by?: string;
          decision?: Database['public']['Enums']['cash_variance_decision'];
          id?: string;
          note?: string | null;
          organization_id?: string;
          station_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'cash_variance_decisions_closing_id_fkey';
            columns: ['closing_id'];
            isOneToOne: false;
            referencedRelation: 'cash_closings';
            referencedColumns: ['id'];
          },
        ];
      };
      credit_accounts: {
        Row: {
          active: boolean;
          created_at: string;
          customer_name: string;
          decided_at: string | null;
          decided_by: string | null;
          id: string;
          limit_fcfa: number;
          organization_id: string;
          phone: string | null;
          requested_at: string | null;
          requested_by_employee_id: string | null;
          station_id: string;
          status: Database['public']['Enums']['credit_account_status'];
          updated_at: string;
        };
        Insert: {
          active?: boolean;
          created_at?: string;
          customer_name: string;
          decided_at?: string | null;
          decided_by?: string | null;
          id?: string;
          limit_fcfa?: number;
          organization_id: string;
          phone?: string | null;
          requested_at?: string | null;
          requested_by_employee_id?: string | null;
          station_id: string;
          status?: Database['public']['Enums']['credit_account_status'];
          updated_at?: string;
        };
        Update: {
          active?: boolean;
          created_at?: string;
          customer_name?: string;
          decided_at?: string | null;
          decided_by?: string | null;
          id?: string;
          limit_fcfa?: number;
          organization_id?: string;
          phone?: string | null;
          requested_at?: string | null;
          requested_by_employee_id?: string | null;
          station_id?: string;
          status?: Database['public']['Enums']['credit_account_status'];
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'credit_accounts_requested_fk';
            columns: ['requested_by_employee_id', 'station_id'];
            isOneToOne: false;
            referencedRelation: 'employees';
            referencedColumns: ['id', 'station_id'];
          },
          {
            foreignKeyName: 'credit_accounts_station_id_organization_id_fkey';
            columns: ['station_id', 'organization_id'];
            isOneToOne: false;
            referencedRelation: 'stations';
            referencedColumns: ['id', 'organization_id'];
          },
        ];
      };
      credit_entries: {
        Row: {
          amount_fcfa: number;
          created_at: string;
          credit_account_id: string;
          device_created_at: string;
          device_id: string;
          employee_id: string;
          evidence_id: string | null;
          id: string;
          kind: Database['public']['Enums']['credit_entry_kind'];
          organization_id: string;
          payment_id: string | null;
          station_id: string;
          transaction_id: string | null;
          vehicle_plate: string | null;
        };
        Insert: {
          amount_fcfa: number;
          created_at?: string;
          credit_account_id: string;
          device_created_at: string;
          device_id: string;
          employee_id: string;
          evidence_id?: string | null;
          id?: string;
          kind: Database['public']['Enums']['credit_entry_kind'];
          organization_id: string;
          payment_id?: string | null;
          station_id: string;
          transaction_id?: string | null;
          vehicle_plate?: string | null;
        };
        Update: {
          amount_fcfa?: number;
          created_at?: string;
          credit_account_id?: string;
          device_created_at?: string;
          device_id?: string;
          employee_id?: string;
          evidence_id?: string | null;
          id?: string;
          kind?: Database['public']['Enums']['credit_entry_kind'];
          organization_id?: string;
          payment_id?: string | null;
          station_id?: string;
          transaction_id?: string | null;
          vehicle_plate?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'credit_entries_credit_account_id_station_id_fkey';
            columns: ['credit_account_id', 'station_id'];
            isOneToOne: false;
            referencedRelation: 'credit_accounts';
            referencedColumns: ['id', 'station_id'];
          },
          {
            foreignKeyName: 'credit_entries_device_id_station_id_fkey';
            columns: ['device_id', 'station_id'];
            isOneToOne: false;
            referencedRelation: 'devices';
            referencedColumns: ['id', 'station_id'];
          },
          {
            foreignKeyName: 'credit_entries_employee_id_station_id_fkey';
            columns: ['employee_id', 'station_id'];
            isOneToOne: false;
            referencedRelation: 'employees';
            referencedColumns: ['id', 'station_id'];
          },
          {
            foreignKeyName: 'credit_entries_evidence_fk';
            columns: ['evidence_id', 'station_id'];
            isOneToOne: false;
            referencedRelation: 'evidence_files';
            referencedColumns: ['id', 'station_id'];
          },
          {
            foreignKeyName: 'credit_entries_payment_id_station_id_fkey';
            columns: ['payment_id', 'station_id'];
            isOneToOne: false;
            referencedRelation: 'payments';
            referencedColumns: ['id', 'station_id'];
          },
          {
            foreignKeyName: 'credit_entries_station_id_organization_id_fkey';
            columns: ['station_id', 'organization_id'];
            isOneToOne: false;
            referencedRelation: 'stations';
            referencedColumns: ['id', 'organization_id'];
          },
          {
            foreignKeyName: 'credit_entries_transaction_id_station_id_fkey';
            columns: ['transaction_id', 'station_id'];
            isOneToOne: false;
            referencedRelation: 'transactions';
            referencedColumns: ['id', 'station_id'];
          },
        ];
      };
      device_pairing_codes: {
        Row: {
          attempts: number;
          code_hash: string;
          created_at: string;
          created_by: string;
          expires_at: string;
          id: string;
          organization_id: string;
          station_id: string;
          used_at: string | null;
          used_by_device_id: string | null;
        };
        Insert: {
          attempts?: number;
          code_hash: string;
          created_at?: string;
          created_by: string;
          expires_at: string;
          id?: string;
          organization_id: string;
          station_id: string;
          used_at?: string | null;
          used_by_device_id?: string | null;
        };
        Update: {
          attempts?: number;
          code_hash?: string;
          created_at?: string;
          created_by?: string;
          expires_at?: string;
          id?: string;
          organization_id?: string;
          station_id?: string;
          used_at?: string | null;
          used_by_device_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'device_pairing_codes_station_id_organization_id_fkey';
            columns: ['station_id', 'organization_id'];
            isOneToOne: false;
            referencedRelation: 'stations';
            referencedColumns: ['id', 'organization_id'];
          },
          {
            foreignKeyName: 'device_pairing_codes_used_by_device_id_fkey';
            columns: ['used_by_device_id'];
            isOneToOne: false;
            referencedRelation: 'devices';
            referencedColumns: ['id'];
          },
        ];
      };
      devices: {
        Row: {
          active: boolean;
          auth_user_id: string;
          created_at: string;
          id: string;
          label: string;
          organization_id: string;
          registered_at: string;
          station_id: string;
          updated_at: string;
        };
        Insert: {
          active?: boolean;
          auth_user_id: string;
          created_at?: string;
          id?: string;
          label: string;
          organization_id: string;
          registered_at?: string;
          station_id: string;
          updated_at?: string;
        };
        Update: {
          active?: boolean;
          auth_user_id?: string;
          created_at?: string;
          id?: string;
          label?: string;
          organization_id?: string;
          registered_at?: string;
          station_id?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'devices_station_id_organization_id_fkey';
            columns: ['station_id', 'organization_id'];
            isOneToOne: false;
            referencedRelation: 'stations';
            referencedColumns: ['id', 'organization_id'];
          },
        ];
      };
      employee_pins: {
        Row: {
          employee_id: string;
          organization_id: string;
          pin_hash: string;
          updated_at: string;
        };
        Insert: {
          employee_id: string;
          organization_id: string;
          pin_hash: string;
          updated_at?: string;
        };
        Update: {
          employee_id?: string;
          organization_id?: string;
          pin_hash?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'employee_pins_employee_id_fkey';
            columns: ['employee_id'];
            isOneToOne: true;
            referencedRelation: 'employees';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'employee_pins_organization_id_fkey';
            columns: ['organization_id'];
            isOneToOne: false;
            referencedRelation: 'organizations';
            referencedColumns: ['id'];
          },
        ];
      };
      employee_sessions: {
        Row: {
          created_at: string;
          device_id: string;
          employee_id: string;
          ended_at: string | null;
          ended_reason: Database['public']['Enums']['session_end_reason'] | null;
          expires_at: string;
          id: string;
          organization_id: string;
          started_at: string;
          station_id: string;
        };
        Insert: {
          created_at?: string;
          device_id: string;
          employee_id: string;
          ended_at?: string | null;
          ended_reason?: Database['public']['Enums']['session_end_reason'] | null;
          expires_at: string;
          id?: string;
          organization_id: string;
          started_at?: string;
          station_id: string;
        };
        Update: {
          created_at?: string;
          device_id?: string;
          employee_id?: string;
          ended_at?: string | null;
          ended_reason?: Database['public']['Enums']['session_end_reason'] | null;
          expires_at?: string;
          id?: string;
          organization_id?: string;
          started_at?: string;
          station_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'employee_sessions_device_id_station_id_fkey';
            columns: ['device_id', 'station_id'];
            isOneToOne: false;
            referencedRelation: 'devices';
            referencedColumns: ['id', 'station_id'];
          },
          {
            foreignKeyName: 'employee_sessions_employee_id_station_id_fkey';
            columns: ['employee_id', 'station_id'];
            isOneToOne: false;
            referencedRelation: 'employees';
            referencedColumns: ['id', 'station_id'];
          },
          {
            foreignKeyName: 'employee_sessions_station_id_organization_id_fkey';
            columns: ['station_id', 'organization_id'];
            isOneToOne: false;
            referencedRelation: 'stations';
            referencedColumns: ['id', 'organization_id'];
          },
        ];
      };
      employees: {
        Row: {
          active: boolean;
          created_at: string;
          full_name: string;
          id: string;
          organization_id: string;
          phone_e164: string | null;
          role: Database['public']['Enums']['employee_role'];
          station_id: string;
          updated_at: string;
        };
        Insert: {
          active?: boolean;
          created_at?: string;
          full_name: string;
          id?: string;
          organization_id: string;
          phone_e164?: string | null;
          role: Database['public']['Enums']['employee_role'];
          station_id: string;
          updated_at?: string;
        };
        Update: {
          active?: boolean;
          created_at?: string;
          full_name?: string;
          id?: string;
          organization_id?: string;
          phone_e164?: string | null;
          role?: Database['public']['Enums']['employee_role'];
          station_id?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'employees_station_id_organization_id_fkey';
            columns: ['station_id', 'organization_id'];
            isOneToOne: false;
            referencedRelation: 'stations';
            referencedColumns: ['id', 'organization_id'];
          },
        ];
      };
      evidence_files: {
        Row: {
          captured_at_device: string;
          created_at: string;
          device_created_at: string;
          device_id: string;
          employee_id: string;
          gps_lat: number | null;
          gps_lng: number | null;
          id: string;
          kind: Database['public']['Enums']['evidence_kind'];
          organization_id: string;
          sha256: string;
          station_id: string;
          storage_path: string;
        };
        Insert: {
          captured_at_device: string;
          created_at?: string;
          device_created_at: string;
          device_id: string;
          employee_id: string;
          gps_lat?: number | null;
          gps_lng?: number | null;
          id?: string;
          kind: Database['public']['Enums']['evidence_kind'];
          organization_id: string;
          sha256: string;
          station_id: string;
          storage_path: string;
        };
        Update: {
          captured_at_device?: string;
          created_at?: string;
          device_created_at?: string;
          device_id?: string;
          employee_id?: string;
          gps_lat?: number | null;
          gps_lng?: number | null;
          id?: string;
          kind?: Database['public']['Enums']['evidence_kind'];
          organization_id?: string;
          sha256?: string;
          station_id?: string;
          storage_path?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'evidence_files_device_id_station_id_fkey';
            columns: ['device_id', 'station_id'];
            isOneToOne: false;
            referencedRelation: 'devices';
            referencedColumns: ['id', 'station_id'];
          },
          {
            foreignKeyName: 'evidence_files_employee_id_station_id_fkey';
            columns: ['employee_id', 'station_id'];
            isOneToOne: false;
            referencedRelation: 'employees';
            referencedColumns: ['id', 'station_id'];
          },
          {
            foreignKeyName: 'evidence_files_station_id_organization_id_fkey';
            columns: ['station_id', 'organization_id'];
            isOneToOne: false;
            referencedRelation: 'stations';
            referencedColumns: ['id', 'organization_id'];
          },
        ];
      };
      evidence_uploads: {
        Row: {
          evidence_id: string;
          object_size: number | null;
          organization_id: string;
          station_id: string;
          uploaded_at: string;
        };
        Insert: {
          evidence_id: string;
          object_size?: number | null;
          organization_id: string;
          station_id: string;
          uploaded_at?: string;
        };
        Update: {
          evidence_id?: string;
          object_size?: number | null;
          organization_id?: string;
          station_id?: string;
          uploaded_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'evidence_uploads_evidence_id_fkey';
            columns: ['evidence_id'];
            isOneToOne: true;
            referencedRelation: 'evidence_files';
            referencedColumns: ['id'];
          },
        ];
      };
      fuel_deliveries: {
        Row: {
          after_cl: number;
          after_reading_id: string | null;
          before_cl: number;
          before_reading_id: string | null;
          created_at: string;
          device_created_at: string;
          device_id: string;
          employee_id: string;
          evidence_id: string;
          id: string;
          invoice_ref: string | null;
          invoiced_cl: number;
          organization_id: string;
          received_cl: number | null;
          reserve_reason: string | null;
          reverses_id: string | null;
          session_id: string | null;
          signed_with_reserve: boolean;
          station_id: string;
          supplier: string | null;
          tank_id: string;
          unloading_ended_at: string | null;
          unloading_started_at: string | null;
          variance_pct: number | null;
        };
        Insert: {
          after_cl: number;
          after_reading_id?: string | null;
          before_cl: number;
          before_reading_id?: string | null;
          created_at?: string;
          device_created_at: string;
          device_id: string;
          employee_id: string;
          evidence_id: string;
          id?: string;
          invoice_ref?: string | null;
          invoiced_cl: number;
          organization_id: string;
          received_cl?: number | null;
          reserve_reason?: string | null;
          reverses_id?: string | null;
          session_id?: string | null;
          signed_with_reserve?: boolean;
          station_id: string;
          supplier?: string | null;
          tank_id: string;
          unloading_ended_at?: string | null;
          unloading_started_at?: string | null;
          variance_pct?: number | null;
        };
        Update: {
          after_cl?: number;
          after_reading_id?: string | null;
          before_cl?: number;
          before_reading_id?: string | null;
          created_at?: string;
          device_created_at?: string;
          device_id?: string;
          employee_id?: string;
          evidence_id?: string;
          id?: string;
          invoice_ref?: string | null;
          invoiced_cl?: number;
          organization_id?: string;
          received_cl?: number | null;
          reserve_reason?: string | null;
          reverses_id?: string | null;
          session_id?: string | null;
          signed_with_reserve?: boolean;
          station_id?: string;
          supplier?: string | null;
          tank_id?: string;
          unloading_ended_at?: string | null;
          unloading_started_at?: string | null;
          variance_pct?: number | null;
        };
        Relationships: [
          {
            foreignKeyName: 'fuel_deliveries_device_id_station_id_fkey';
            columns: ['device_id', 'station_id'];
            isOneToOne: false;
            referencedRelation: 'devices';
            referencedColumns: ['id', 'station_id'];
          },
          {
            foreignKeyName: 'fuel_deliveries_employee_id_station_id_fkey';
            columns: ['employee_id', 'station_id'];
            isOneToOne: false;
            referencedRelation: 'employees';
            referencedColumns: ['id', 'station_id'];
          },
          {
            foreignKeyName: 'fuel_deliveries_evidence_id_station_id_fkey';
            columns: ['evidence_id', 'station_id'];
            isOneToOne: false;
            referencedRelation: 'evidence_files';
            referencedColumns: ['id', 'station_id'];
          },
          {
            foreignKeyName: 'fuel_deliveries_readings_fk_after';
            columns: ['after_reading_id', 'tank_id'];
            isOneToOne: false;
            referencedRelation: 'tank_readings';
            referencedColumns: ['id', 'tank_id'];
          },
          {
            foreignKeyName: 'fuel_deliveries_readings_fk_before';
            columns: ['before_reading_id', 'tank_id'];
            isOneToOne: false;
            referencedRelation: 'tank_readings';
            referencedColumns: ['id', 'tank_id'];
          },
          {
            foreignKeyName: 'fuel_deliveries_reverses_id_fkey';
            columns: ['reverses_id'];
            isOneToOne: false;
            referencedRelation: 'fuel_deliveries';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'fuel_deliveries_session_id_fkey';
            columns: ['session_id'];
            isOneToOne: false;
            referencedRelation: 'fuel_delivery_sessions';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'fuel_deliveries_station_id_organization_id_fkey';
            columns: ['station_id', 'organization_id'];
            isOneToOne: false;
            referencedRelation: 'stations';
            referencedColumns: ['id', 'organization_id'];
          },
          {
            foreignKeyName: 'fuel_deliveries_tank_id_station_id_fkey';
            columns: ['tank_id', 'station_id'];
            isOneToOne: false;
            referencedRelation: 'tanks';
            referencedColumns: ['id', 'station_id'];
          },
        ];
      };
      fuel_delivery_sessions: {
        Row: {
          after_reading_id: string | null;
          arrived_at: string;
          before_reading_id: string | null;
          created_at: string;
          delivery_id: string | null;
          device_created_at: string;
          device_id: string;
          driver_name: string | null;
          employee_id: string;
          id: string;
          invoice_evidence_id: string | null;
          invoice_ref: string | null;
          invoiced_cl: number | null;
          organization_id: string;
          shift_id: string | null;
          signed_at: string | null;
          station_id: string;
          status: Database['public']['Enums']['delivery_status'];
          supplier: string | null;
          tank_id: string;
          truck_plate: string | null;
          unloading_ended_at: string | null;
          unloading_started_at: string | null;
          updated_at: string;
        };
        Insert: {
          after_reading_id?: string | null;
          arrived_at?: string;
          before_reading_id?: string | null;
          created_at?: string;
          delivery_id?: string | null;
          device_created_at: string;
          device_id: string;
          driver_name?: string | null;
          employee_id: string;
          id?: string;
          invoice_evidence_id?: string | null;
          invoice_ref?: string | null;
          invoiced_cl?: number | null;
          organization_id: string;
          shift_id?: string | null;
          signed_at?: string | null;
          station_id: string;
          status?: Database['public']['Enums']['delivery_status'];
          supplier?: string | null;
          tank_id: string;
          truck_plate?: string | null;
          unloading_ended_at?: string | null;
          unloading_started_at?: string | null;
          updated_at?: string;
        };
        Update: {
          after_reading_id?: string | null;
          arrived_at?: string;
          before_reading_id?: string | null;
          created_at?: string;
          delivery_id?: string | null;
          device_created_at?: string;
          device_id?: string;
          driver_name?: string | null;
          employee_id?: string;
          id?: string;
          invoice_evidence_id?: string | null;
          invoice_ref?: string | null;
          invoiced_cl?: number | null;
          organization_id?: string;
          shift_id?: string | null;
          signed_at?: string | null;
          station_id?: string;
          status?: Database['public']['Enums']['delivery_status'];
          supplier?: string | null;
          tank_id?: string;
          truck_plate?: string | null;
          unloading_ended_at?: string | null;
          unloading_started_at?: string | null;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'fuel_delivery_sessions_device_id_station_id_fkey';
            columns: ['device_id', 'station_id'];
            isOneToOne: false;
            referencedRelation: 'devices';
            referencedColumns: ['id', 'station_id'];
          },
          {
            foreignKeyName: 'fuel_delivery_sessions_employee_id_station_id_fkey';
            columns: ['employee_id', 'station_id'];
            isOneToOne: false;
            referencedRelation: 'employees';
            referencedColumns: ['id', 'station_id'];
          },
          {
            foreignKeyName: 'fuel_delivery_sessions_invoice_evidence_id_station_id_fkey';
            columns: ['invoice_evidence_id', 'station_id'];
            isOneToOne: false;
            referencedRelation: 'evidence_files';
            referencedColumns: ['id', 'station_id'];
          },
          {
            foreignKeyName: 'fuel_delivery_sessions_shift_id_station_id_fkey';
            columns: ['shift_id', 'station_id'];
            isOneToOne: false;
            referencedRelation: 'shifts';
            referencedColumns: ['id', 'station_id'];
          },
          {
            foreignKeyName: 'fuel_delivery_sessions_station_id_organization_id_fkey';
            columns: ['station_id', 'organization_id'];
            isOneToOne: false;
            referencedRelation: 'stations';
            referencedColumns: ['id', 'organization_id'];
          },
          {
            foreignKeyName: 'fuel_delivery_sessions_tank_id_station_id_fkey';
            columns: ['tank_id', 'station_id'];
            isOneToOne: false;
            referencedRelation: 'tanks';
            referencedColumns: ['id', 'station_id'];
          },
        ];
      };
      fuel_products: {
        Row: {
          code: Database['public']['Enums']['fuel_code'];
          created_at: string;
          label: string;
        };
        Insert: {
          code: Database['public']['Enums']['fuel_code'];
          created_at?: string;
          label: string;
        };
        Update: {
          code?: Database['public']['Enums']['fuel_code'];
          created_at?: string;
          label?: string;
        };
        Relationships: [];
      };
      inventory_movements: {
        Row: {
          created_at: string;
          device_created_at: string | null;
          device_id: string | null;
          employee_id: string | null;
          id: string;
          kind: Database['public']['Enums']['inventory_movement_kind'];
          organization_id: string;
          product_id: string;
          quantity: number;
          reference_id: string | null;
          reference_kind: string | null;
          station_id: string;
          unit_cost_fcfa: number | null;
        };
        Insert: {
          created_at?: string;
          device_created_at?: string | null;
          device_id?: string | null;
          employee_id?: string | null;
          id?: string;
          kind: Database['public']['Enums']['inventory_movement_kind'];
          organization_id: string;
          product_id: string;
          quantity: number;
          reference_id?: string | null;
          reference_kind?: string | null;
          station_id: string;
          unit_cost_fcfa?: number | null;
        };
        Update: {
          created_at?: string;
          device_created_at?: string | null;
          device_id?: string | null;
          employee_id?: string | null;
          id?: string;
          kind?: Database['public']['Enums']['inventory_movement_kind'];
          organization_id?: string;
          product_id?: string;
          quantity?: number;
          reference_id?: string | null;
          reference_kind?: string | null;
          station_id?: string;
          unit_cost_fcfa?: number | null;
        };
        Relationships: [
          {
            foreignKeyName: 'inventory_movements_device_id_station_id_fkey';
            columns: ['device_id', 'station_id'];
            isOneToOne: false;
            referencedRelation: 'devices';
            referencedColumns: ['id', 'station_id'];
          },
          {
            foreignKeyName: 'inventory_movements_employee_id_station_id_fkey';
            columns: ['employee_id', 'station_id'];
            isOneToOne: false;
            referencedRelation: 'employees';
            referencedColumns: ['id', 'station_id'];
          },
          {
            foreignKeyName: 'inventory_movements_product_id_organization_id_fkey';
            columns: ['product_id', 'organization_id'];
            isOneToOne: false;
            referencedRelation: 'products';
            referencedColumns: ['id', 'organization_id'];
          },
          {
            foreignKeyName: 'inventory_movements_station_id_organization_id_fkey';
            columns: ['station_id', 'organization_id'];
            isOneToOne: false;
            referencedRelation: 'stations';
            referencedColumns: ['id', 'organization_id'];
          },
        ];
      };
      meter_readings: {
        Row: {
          created_at: string;
          device_created_at: string;
          device_id: string;
          employee_id: string;
          evidence_id: string;
          flagged_regression: boolean;
          gps_lat: number | null;
          gps_lng: number | null;
          handover_id: string | null;
          handover_side: Database['public']['Enums']['handover_side'] | null;
          id: string;
          index_cl: number;
          justification: string | null;
          kind: Database['public']['Enums']['meter_reading_kind'];
          nozzle_id: string;
          organization_id: string;
          previous_index_cl: number | null;
          price_change_id: string | null;
          shift_id: string;
          station_id: string;
        };
        Insert: {
          created_at?: string;
          device_created_at: string;
          device_id: string;
          employee_id: string;
          evidence_id: string;
          flagged_regression?: boolean;
          gps_lat?: number | null;
          gps_lng?: number | null;
          handover_id?: string | null;
          handover_side?: Database['public']['Enums']['handover_side'] | null;
          id?: string;
          index_cl: number;
          justification?: string | null;
          kind: Database['public']['Enums']['meter_reading_kind'];
          nozzle_id: string;
          organization_id: string;
          previous_index_cl?: number | null;
          price_change_id?: string | null;
          shift_id: string;
          station_id: string;
        };
        Update: {
          created_at?: string;
          device_created_at?: string;
          device_id?: string;
          employee_id?: string;
          evidence_id?: string;
          flagged_regression?: boolean;
          gps_lat?: number | null;
          gps_lng?: number | null;
          handover_id?: string | null;
          handover_side?: Database['public']['Enums']['handover_side'] | null;
          id?: string;
          index_cl?: number;
          justification?: string | null;
          kind?: Database['public']['Enums']['meter_reading_kind'];
          nozzle_id?: string;
          organization_id?: string;
          previous_index_cl?: number | null;
          price_change_id?: string | null;
          shift_id?: string;
          station_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'meter_readings_device_id_station_id_fkey';
            columns: ['device_id', 'station_id'];
            isOneToOne: false;
            referencedRelation: 'devices';
            referencedColumns: ['id', 'station_id'];
          },
          {
            foreignKeyName: 'meter_readings_employee_id_station_id_fkey';
            columns: ['employee_id', 'station_id'];
            isOneToOne: false;
            referencedRelation: 'employees';
            referencedColumns: ['id', 'station_id'];
          },
          {
            foreignKeyName: 'meter_readings_evidence_id_station_id_fkey';
            columns: ['evidence_id', 'station_id'];
            isOneToOne: false;
            referencedRelation: 'evidence_files';
            referencedColumns: ['id', 'station_id'];
          },
          {
            foreignKeyName: 'meter_readings_handover_fk';
            columns: ['handover_id'];
            isOneToOne: false;
            referencedRelation: 'shift_handovers';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'meter_readings_nozzle_id_station_id_fkey';
            columns: ['nozzle_id', 'station_id'];
            isOneToOne: false;
            referencedRelation: 'nozzles';
            referencedColumns: ['id', 'station_id'];
          },
          {
            foreignKeyName: 'meter_readings_price_change_id_fkey';
            columns: ['price_change_id'];
            isOneToOne: false;
            referencedRelation: 'current_fuel_prices';
            referencedColumns: ['price_change_id'];
          },
          {
            foreignKeyName: 'meter_readings_price_change_id_fkey';
            columns: ['price_change_id'];
            isOneToOne: false;
            referencedRelation: 'price_changes';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'meter_readings_shift_id_station_id_fkey';
            columns: ['shift_id', 'station_id'];
            isOneToOne: false;
            referencedRelation: 'shifts';
            referencedColumns: ['id', 'station_id'];
          },
          {
            foreignKeyName: 'meter_readings_station_id_organization_id_fkey';
            columns: ['station_id', 'organization_id'];
            isOneToOne: false;
            referencedRelation: 'stations';
            referencedColumns: ['id', 'organization_id'];
          },
        ];
      };
      mobile_money_imports: {
        Row: {
          created_at: string;
          filename: string | null;
          id: string;
          imported_by: string | null;
          line_count: number;
          mapping: Json;
          matched_count: number;
          organization_id: string;
          provider: Database['public']['Enums']['mobile_money_provider'];
          unmatched_count: number;
        };
        Insert: {
          created_at?: string;
          filename?: string | null;
          id?: string;
          imported_by?: string | null;
          line_count?: number;
          mapping?: Json;
          matched_count?: number;
          organization_id: string;
          provider: Database['public']['Enums']['mobile_money_provider'];
          unmatched_count?: number;
        };
        Update: {
          created_at?: string;
          filename?: string | null;
          id?: string;
          imported_by?: string | null;
          line_count?: number;
          mapping?: Json;
          matched_count?: number;
          organization_id?: string;
          provider?: Database['public']['Enums']['mobile_money_provider'];
          unmatched_count?: number;
        };
        Relationships: [
          {
            foreignKeyName: 'mobile_money_imports_organization_id_fkey';
            columns: ['organization_id'];
            isOneToOne: false;
            referencedRelation: 'organizations';
            referencedColumns: ['id'];
          },
        ];
      };
      mobile_money_statement_lines: {
        Row: {
          amount_fcfa: number;
          created_at: string;
          id: string;
          import_id: string;
          organization_id: string;
          paid_at: string;
          provider: Database['public']['Enums']['mobile_money_provider'];
          raw: Json;
          reference: string;
        };
        Insert: {
          amount_fcfa: number;
          created_at?: string;
          id?: string;
          import_id: string;
          organization_id: string;
          paid_at: string;
          provider: Database['public']['Enums']['mobile_money_provider'];
          raw?: Json;
          reference: string;
        };
        Update: {
          amount_fcfa?: number;
          created_at?: string;
          id?: string;
          import_id?: string;
          organization_id?: string;
          paid_at?: string;
          provider?: Database['public']['Enums']['mobile_money_provider'];
          raw?: Json;
          reference?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'mobile_money_statement_lines_import_id_fkey';
            columns: ['import_id'];
            isOneToOne: false;
            referencedRelation: 'mobile_money_imports';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'mobile_money_statement_lines_organization_id_fkey';
            columns: ['organization_id'];
            isOneToOne: false;
            referencedRelation: 'organizations';
            referencedColumns: ['id'];
          },
        ];
      };
      notification_outbox: {
        Row: {
          attempts: number;
          body: string;
          channel: Database['public']['Enums']['notification_channel'];
          created_at: string;
          delivered_at: string | null;
          fallback_of: string | null;
          id: string;
          idempotency_key: string;
          kind: Database['public']['Enums']['notification_kind'];
          last_error: string | null;
          next_attempt_at: string;
          organization_id: string;
          provider_message_id: string | null;
          recipient_id: string | null;
          sent_at: string | null;
          station_id: string | null;
          status: Database['public']['Enums']['notification_status'];
          template: string;
          to_phone: string;
          variables: Json;
        };
        Insert: {
          attempts?: number;
          body: string;
          channel?: Database['public']['Enums']['notification_channel'];
          created_at?: string;
          delivered_at?: string | null;
          fallback_of?: string | null;
          id?: string;
          idempotency_key: string;
          kind: Database['public']['Enums']['notification_kind'];
          last_error?: string | null;
          next_attempt_at?: string;
          organization_id: string;
          provider_message_id?: string | null;
          recipient_id?: string | null;
          sent_at?: string | null;
          station_id?: string | null;
          status?: Database['public']['Enums']['notification_status'];
          template: string;
          to_phone: string;
          variables?: Json;
        };
        Update: {
          attempts?: number;
          body?: string;
          channel?: Database['public']['Enums']['notification_channel'];
          created_at?: string;
          delivered_at?: string | null;
          fallback_of?: string | null;
          id?: string;
          idempotency_key?: string;
          kind?: Database['public']['Enums']['notification_kind'];
          last_error?: string | null;
          next_attempt_at?: string;
          organization_id?: string;
          provider_message_id?: string | null;
          recipient_id?: string | null;
          sent_at?: string | null;
          station_id?: string | null;
          status?: Database['public']['Enums']['notification_status'];
          template?: string;
          to_phone?: string;
          variables?: Json;
        };
        Relationships: [
          {
            foreignKeyName: 'notification_outbox_fallback_of_fkey';
            columns: ['fallback_of'];
            isOneToOne: false;
            referencedRelation: 'notification_outbox';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'notification_outbox_organization_id_fkey';
            columns: ['organization_id'];
            isOneToOne: false;
            referencedRelation: 'organizations';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'notification_outbox_recipient_id_fkey';
            columns: ['recipient_id'];
            isOneToOne: false;
            referencedRelation: 'notification_recipients';
            referencedColumns: ['id'];
          },
        ];
      };
      notification_outbox_events: {
        Row: {
          at: string;
          error: string | null;
          id: number;
          organization_id: string;
          outbox_id: string;
          provider_message_id: string | null;
          status: Database['public']['Enums']['notification_status'];
        };
        Insert: {
          at?: string;
          error?: string | null;
          id?: never;
          organization_id: string;
          outbox_id: string;
          provider_message_id?: string | null;
          status: Database['public']['Enums']['notification_status'];
        };
        Update: {
          at?: string;
          error?: string | null;
          id?: never;
          organization_id?: string;
          outbox_id?: string;
          provider_message_id?: string | null;
          status?: Database['public']['Enums']['notification_status'];
        };
        Relationships: [
          {
            foreignKeyName: 'notification_outbox_events_outbox_id_fkey';
            columns: ['outbox_id'];
            isOneToOne: false;
            referencedRelation: 'notification_outbox';
            referencedColumns: ['id'];
          },
        ];
      };
      notification_recipients: {
        Row: {
          active: boolean;
          created_at: string;
          id: string;
          name: string;
          organization_id: string;
          phone_e164: string;
          receives_alerts: boolean;
          receives_report: boolean;
          updated_at: string;
        };
        Insert: {
          active?: boolean;
          created_at?: string;
          id?: string;
          name: string;
          organization_id: string;
          phone_e164: string;
          receives_alerts?: boolean;
          receives_report?: boolean;
          updated_at?: string;
        };
        Update: {
          active?: boolean;
          created_at?: string;
          id?: string;
          name?: string;
          organization_id?: string;
          phone_e164?: string;
          receives_alerts?: boolean;
          receives_report?: boolean;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'notification_recipients_organization_id_fkey';
            columns: ['organization_id'];
            isOneToOne: false;
            referencedRelation: 'organizations';
            referencedColumns: ['id'];
          },
        ];
      };
      nozzles: {
        Row: {
          active: boolean;
          created_at: string;
          id: string;
          label: string;
          organization_id: string;
          pump_id: string;
          station_id: string;
          tank_id: string;
          updated_at: string;
        };
        Insert: {
          active?: boolean;
          created_at?: string;
          id?: string;
          label: string;
          organization_id: string;
          pump_id: string;
          station_id: string;
          tank_id: string;
          updated_at?: string;
        };
        Update: {
          active?: boolean;
          created_at?: string;
          id?: string;
          label?: string;
          organization_id?: string;
          pump_id?: string;
          station_id?: string;
          tank_id?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'nozzles_pump_id_station_id_fkey';
            columns: ['pump_id', 'station_id'];
            isOneToOne: false;
            referencedRelation: 'pumps';
            referencedColumns: ['id', 'station_id'];
          },
          {
            foreignKeyName: 'nozzles_station_id_organization_id_fkey';
            columns: ['station_id', 'organization_id'];
            isOneToOne: false;
            referencedRelation: 'stations';
            referencedColumns: ['id', 'organization_id'];
          },
          {
            foreignKeyName: 'nozzles_tank_id_station_id_fkey';
            columns: ['tank_id', 'station_id'];
            isOneToOne: false;
            referencedRelation: 'tanks';
            referencedColumns: ['id', 'station_id'];
          },
        ];
      };
      org_members: {
        Row: {
          created_at: string;
          id: string;
          organization_id: string;
          role: Database['public']['Enums']['org_member_role'];
          updated_at: string;
          user_id: string;
        };
        Insert: {
          created_at?: string;
          id?: string;
          organization_id: string;
          role: Database['public']['Enums']['org_member_role'];
          updated_at?: string;
          user_id: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          organization_id?: string;
          role?: Database['public']['Enums']['org_member_role'];
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'org_members_organization_id_fkey';
            columns: ['organization_id'];
            isOneToOne: false;
            referencedRelation: 'organizations';
            referencedColumns: ['id'];
          },
        ];
      };
      organization_settings: {
        Row: {
          cash_tolerance_fcfa: number;
          delivery_variance_pct: number;
          deposit_missing_hours: number;
          organization_id: string;
          report_mode: Database['public']['Enums']['report_mode'];
          report_time: string;
          report_timezone: string;
          small_variance_cumulative_fcfa: number;
          sms_fallback: boolean;
          sms_fallback_minutes: number;
          tank_variance_pct: number;
          updated_at: string;
          web_base_url: string;
        };
        Insert: {
          cash_tolerance_fcfa?: number;
          delivery_variance_pct?: number;
          deposit_missing_hours?: number;
          organization_id: string;
          report_mode?: Database['public']['Enums']['report_mode'];
          report_time?: string;
          report_timezone?: string;
          small_variance_cumulative_fcfa?: number;
          sms_fallback?: boolean;
          sms_fallback_minutes?: number;
          tank_variance_pct?: number;
          updated_at?: string;
          web_base_url?: string;
        };
        Update: {
          cash_tolerance_fcfa?: number;
          delivery_variance_pct?: number;
          deposit_missing_hours?: number;
          organization_id?: string;
          report_mode?: Database['public']['Enums']['report_mode'];
          report_time?: string;
          report_timezone?: string;
          small_variance_cumulative_fcfa?: number;
          sms_fallback?: boolean;
          sms_fallback_minutes?: number;
          tank_variance_pct?: number;
          updated_at?: string;
          web_base_url?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'organization_settings_organization_id_fkey';
            columns: ['organization_id'];
            isOneToOne: true;
            referencedRelation: 'organizations';
            referencedColumns: ['id'];
          },
        ];
      };
      organizations: {
        Row: {
          created_at: string;
          id: string;
          name: string;
          plan_code: Database['public']['Enums']['plan_code'];
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          id?: string;
          name: string;
          plan_code: Database['public']['Enums']['plan_code'];
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          name?: string;
          plan_code?: Database['public']['Enums']['plan_code'];
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'organizations_plan_code_fkey';
            columns: ['plan_code'];
            isOneToOne: false;
            referencedRelation: 'plans';
            referencedColumns: ['code'];
          },
        ];
      };
      pairing_rate_limits: {
        Row: {
          attempts: number;
          ip: string;
          window_start: string;
        };
        Insert: {
          attempts?: number;
          ip: string;
          window_start?: string;
        };
        Update: {
          attempts?: number;
          ip?: string;
          window_start?: string;
        };
        Relationships: [];
      };
      payment_matches: {
        Row: {
          created_at: string;
          id: string;
          organization_id: string;
          payment_id: string | null;
          statement_line_id: string | null;
          station_id: string | null;
          status: Database['public']['Enums']['payment_match_status'];
        };
        Insert: {
          created_at?: string;
          id?: string;
          organization_id: string;
          payment_id?: string | null;
          statement_line_id?: string | null;
          station_id?: string | null;
          status: Database['public']['Enums']['payment_match_status'];
        };
        Update: {
          created_at?: string;
          id?: string;
          organization_id?: string;
          payment_id?: string | null;
          statement_line_id?: string | null;
          station_id?: string | null;
          status?: Database['public']['Enums']['payment_match_status'];
        };
        Relationships: [
          {
            foreignKeyName: 'payment_matches_payment_id_fkey';
            columns: ['payment_id'];
            isOneToOne: false;
            referencedRelation: 'payments';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'payment_matches_statement_line_id_fkey';
            columns: ['statement_line_id'];
            isOneToOne: false;
            referencedRelation: 'mobile_money_statement_lines';
            referencedColumns: ['id'];
          },
        ];
      };
      payments: {
        Row: {
          amount_fcfa: number;
          card_last4: string | null;
          created_at: string;
          credit_account_id: string | null;
          device_created_at: string;
          device_id: string;
          employee_id: string;
          external_ref: string | null;
          id: string;
          method: Database['public']['Enums']['payment_method'];
          organization_id: string;
          station_id: string;
          transaction_id: string;
        };
        Insert: {
          amount_fcfa: number;
          card_last4?: string | null;
          created_at?: string;
          credit_account_id?: string | null;
          device_created_at: string;
          device_id: string;
          employee_id: string;
          external_ref?: string | null;
          id?: string;
          method: Database['public']['Enums']['payment_method'];
          organization_id: string;
          station_id: string;
          transaction_id: string;
        };
        Update: {
          amount_fcfa?: number;
          card_last4?: string | null;
          created_at?: string;
          credit_account_id?: string | null;
          device_created_at?: string;
          device_id?: string;
          employee_id?: string;
          external_ref?: string | null;
          id?: string;
          method?: Database['public']['Enums']['payment_method'];
          organization_id?: string;
          station_id?: string;
          transaction_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'payments_credit_account_id_station_id_fkey';
            columns: ['credit_account_id', 'station_id'];
            isOneToOne: false;
            referencedRelation: 'credit_accounts';
            referencedColumns: ['id', 'station_id'];
          },
          {
            foreignKeyName: 'payments_device_id_station_id_fkey';
            columns: ['device_id', 'station_id'];
            isOneToOne: false;
            referencedRelation: 'devices';
            referencedColumns: ['id', 'station_id'];
          },
          {
            foreignKeyName: 'payments_employee_id_station_id_fkey';
            columns: ['employee_id', 'station_id'];
            isOneToOne: false;
            referencedRelation: 'employees';
            referencedColumns: ['id', 'station_id'];
          },
          {
            foreignKeyName: 'payments_station_id_organization_id_fkey';
            columns: ['station_id', 'organization_id'];
            isOneToOne: false;
            referencedRelation: 'stations';
            referencedColumns: ['id', 'organization_id'];
          },
          {
            foreignKeyName: 'payments_transaction_id_station_id_fkey';
            columns: ['transaction_id', 'station_id'];
            isOneToOne: false;
            referencedRelation: 'transactions';
            referencedColumns: ['id', 'station_id'];
          },
        ];
      };
      pin_attempts: {
        Row: {
          at: string;
          device_id: string;
          employee_id: string;
          id: number;
          organization_id: string;
          station_id: string;
          success: boolean;
        };
        Insert: {
          at?: string;
          device_id: string;
          employee_id: string;
          id?: never;
          organization_id: string;
          station_id: string;
          success: boolean;
        };
        Update: {
          at?: string;
          device_id?: string;
          employee_id?: string;
          id?: never;
          organization_id?: string;
          station_id?: string;
          success?: boolean;
        };
        Relationships: [
          {
            foreignKeyName: 'pin_attempts_device_id_station_id_fkey';
            columns: ['device_id', 'station_id'];
            isOneToOne: false;
            referencedRelation: 'devices';
            referencedColumns: ['id', 'station_id'];
          },
          {
            foreignKeyName: 'pin_attempts_employee_id_station_id_fkey';
            columns: ['employee_id', 'station_id'];
            isOneToOne: false;
            referencedRelation: 'employees';
            referencedColumns: ['id', 'station_id'];
          },
        ];
      };
      plans: {
        Row: {
          code: Database['public']['Enums']['plan_code'];
          created_at: string;
          label: string;
          max_stations: number | null;
          updated_at: string;
        };
        Insert: {
          code: Database['public']['Enums']['plan_code'];
          created_at?: string;
          label: string;
          max_stations?: number | null;
          updated_at?: string;
        };
        Update: {
          code?: Database['public']['Enums']['plan_code'];
          created_at?: string;
          label?: string;
          max_stations?: number | null;
          updated_at?: string;
        };
        Relationships: [];
      };
      price_changes: {
        Row: {
          created_at: string;
          created_by: string;
          effective_at: string;
          fuel_product_code: Database['public']['Enums']['fuel_code'];
          id: string;
          organization_id: string;
          price_fcfa_per_litre: number;
          station_id: string;
        };
        Insert: {
          created_at?: string;
          created_by: string;
          effective_at?: string;
          fuel_product_code: Database['public']['Enums']['fuel_code'];
          id?: string;
          organization_id: string;
          price_fcfa_per_litre: number;
          station_id: string;
        };
        Update: {
          created_at?: string;
          created_by?: string;
          effective_at?: string;
          fuel_product_code?: Database['public']['Enums']['fuel_code'];
          id?: string;
          organization_id?: string;
          price_fcfa_per_litre?: number;
          station_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'price_changes_fuel_product_code_fkey';
            columns: ['fuel_product_code'];
            isOneToOne: false;
            referencedRelation: 'fuel_products';
            referencedColumns: ['code'];
          },
          {
            foreignKeyName: 'price_changes_station_id_organization_id_fkey';
            columns: ['station_id', 'organization_id'];
            isOneToOne: false;
            referencedRelation: 'stations';
            referencedColumns: ['id', 'organization_id'];
          },
        ];
      };
      products: {
        Row: {
          active: boolean;
          barcode: string | null;
          category: Database['public']['Enums']['product_category'];
          created_at: string;
          id: string;
          name: string;
          organization_id: string;
          reorder_threshold: number;
          sale_price_fcfa: number | null;
          unit: Database['public']['Enums']['product_unit'];
          updated_at: string;
        };
        Insert: {
          active?: boolean;
          barcode?: string | null;
          category: Database['public']['Enums']['product_category'];
          created_at?: string;
          id?: string;
          name: string;
          organization_id: string;
          reorder_threshold?: number;
          sale_price_fcfa?: number | null;
          unit?: Database['public']['Enums']['product_unit'];
          updated_at?: string;
        };
        Update: {
          active?: boolean;
          barcode?: string | null;
          category?: Database['public']['Enums']['product_category'];
          created_at?: string;
          id?: string;
          name?: string;
          organization_id?: string;
          reorder_threshold?: number;
          sale_price_fcfa?: number | null;
          unit?: Database['public']['Enums']['product_unit'];
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'products_organization_id_fkey';
            columns: ['organization_id'];
            isOneToOne: false;
            referencedRelation: 'organizations';
            referencedColumns: ['id'];
          },
        ];
      };
      pumps: {
        Row: {
          active: boolean;
          created_at: string;
          id: string;
          label: string;
          organization_id: string;
          station_id: string;
          updated_at: string;
        };
        Insert: {
          active?: boolean;
          created_at?: string;
          id?: string;
          label: string;
          organization_id: string;
          station_id: string;
          updated_at?: string;
        };
        Update: {
          active?: boolean;
          created_at?: string;
          id?: string;
          label?: string;
          organization_id?: string;
          station_id?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'pumps_station_id_organization_id_fkey';
            columns: ['station_id', 'organization_id'];
            isOneToOne: false;
            referencedRelation: 'stations';
            referencedColumns: ['id', 'organization_id'];
          },
        ];
      };
      reconciliations: {
        Row: {
          actual: number;
          created_at: string;
          details: Json;
          expected: number;
          id: string;
          kind: Database['public']['Enums']['reconciliation_kind'];
          organization_id: string;
          shift_id: string | null;
          station_id: string;
          status: Database['public']['Enums']['reconciliation_status'];
          variance: number | null;
        };
        Insert: {
          actual: number;
          created_at?: string;
          details?: Json;
          expected: number;
          id?: string;
          kind: Database['public']['Enums']['reconciliation_kind'];
          organization_id: string;
          shift_id?: string | null;
          station_id: string;
          status?: Database['public']['Enums']['reconciliation_status'];
          variance?: number | null;
        };
        Update: {
          actual?: number;
          created_at?: string;
          details?: Json;
          expected?: number;
          id?: string;
          kind?: Database['public']['Enums']['reconciliation_kind'];
          organization_id?: string;
          shift_id?: string | null;
          station_id?: string;
          status?: Database['public']['Enums']['reconciliation_status'];
          variance?: number | null;
        };
        Relationships: [
          {
            foreignKeyName: 'reconciliations_shift_id_station_id_fkey';
            columns: ['shift_id', 'station_id'];
            isOneToOne: false;
            referencedRelation: 'shifts';
            referencedColumns: ['id', 'station_id'];
          },
          {
            foreignKeyName: 'reconciliations_station_id_organization_id_fkey';
            columns: ['station_id', 'organization_id'];
            isOneToOne: false;
            referencedRelation: 'stations';
            referencedColumns: ['id', 'organization_id'];
          },
        ];
      };
      shift_handovers: {
        Row: {
          attributed_shift_id: string | null;
          created_at: string;
          created_by_session_id: string | null;
          device_created_at: string;
          device_id: string;
          discrepancies: Json | null;
          discrepancy_reason: string | null;
          discrepancy_reported: boolean;
          from_shift_id: string;
          id: string;
          incoming_employee_id: string;
          organization_id: string;
          outgoing_employee_id: string;
          signed_in_at: string | null;
          signed_out_at: string | null;
          station_id: string;
          status: Database['public']['Enums']['handover_status'];
          to_shift_id: string | null;
          updated_at: string;
        };
        Insert: {
          attributed_shift_id?: string | null;
          created_at?: string;
          created_by_session_id?: string | null;
          device_created_at: string;
          device_id: string;
          discrepancies?: Json | null;
          discrepancy_reason?: string | null;
          discrepancy_reported?: boolean;
          from_shift_id: string;
          id?: string;
          incoming_employee_id: string;
          organization_id: string;
          outgoing_employee_id: string;
          signed_in_at?: string | null;
          signed_out_at?: string | null;
          station_id: string;
          status?: Database['public']['Enums']['handover_status'];
          to_shift_id?: string | null;
          updated_at?: string;
        };
        Update: {
          attributed_shift_id?: string | null;
          created_at?: string;
          created_by_session_id?: string | null;
          device_created_at?: string;
          device_id?: string;
          discrepancies?: Json | null;
          discrepancy_reason?: string | null;
          discrepancy_reported?: boolean;
          from_shift_id?: string;
          id?: string;
          incoming_employee_id?: string;
          organization_id?: string;
          outgoing_employee_id?: string;
          signed_in_at?: string | null;
          signed_out_at?: string | null;
          station_id?: string;
          status?: Database['public']['Enums']['handover_status'];
          to_shift_id?: string | null;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'shift_handovers_attributed_shift_id_fkey';
            columns: ['attributed_shift_id'];
            isOneToOne: false;
            referencedRelation: 'shifts';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'shift_handovers_created_by_session_id_fkey';
            columns: ['created_by_session_id'];
            isOneToOne: false;
            referencedRelation: 'employee_sessions';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'shift_handovers_device_id_station_id_fkey';
            columns: ['device_id', 'station_id'];
            isOneToOne: false;
            referencedRelation: 'devices';
            referencedColumns: ['id', 'station_id'];
          },
          {
            foreignKeyName: 'shift_handovers_from_shift_id_station_id_fkey';
            columns: ['from_shift_id', 'station_id'];
            isOneToOne: false;
            referencedRelation: 'shifts';
            referencedColumns: ['id', 'station_id'];
          },
          {
            foreignKeyName: 'shift_handovers_incoming_employee_id_station_id_fkey';
            columns: ['incoming_employee_id', 'station_id'];
            isOneToOne: false;
            referencedRelation: 'employees';
            referencedColumns: ['id', 'station_id'];
          },
          {
            foreignKeyName: 'shift_handovers_outgoing_employee_id_station_id_fkey';
            columns: ['outgoing_employee_id', 'station_id'];
            isOneToOne: false;
            referencedRelation: 'employees';
            referencedColumns: ['id', 'station_id'];
          },
          {
            foreignKeyName: 'shift_handovers_station_id_organization_id_fkey';
            columns: ['station_id', 'organization_id'];
            isOneToOne: false;
            referencedRelation: 'stations';
            referencedColumns: ['id', 'organization_id'];
          },
          {
            foreignKeyName: 'shift_handovers_to_shift_id_station_id_fkey';
            columns: ['to_shift_id', 'station_id'];
            isOneToOne: false;
            referencedRelation: 'shifts';
            referencedColumns: ['id', 'station_id'];
          },
        ];
      };
      shifts: {
        Row: {
          closed_at: string | null;
          closed_by: string | null;
          created_at: string;
          device_created_at: string;
          device_id: string;
          fuel_closed_at: string | null;
          id: string;
          label: string | null;
          opened_at: string;
          opened_by: string;
          organization_id: string;
          station_id: string;
          status: Database['public']['Enums']['shift_status'];
          updated_at: string;
        };
        Insert: {
          closed_at?: string | null;
          closed_by?: string | null;
          created_at?: string;
          device_created_at: string;
          device_id: string;
          fuel_closed_at?: string | null;
          id?: string;
          label?: string | null;
          opened_at: string;
          opened_by: string;
          organization_id: string;
          station_id: string;
          status?: Database['public']['Enums']['shift_status'];
          updated_at?: string;
        };
        Update: {
          closed_at?: string | null;
          closed_by?: string | null;
          created_at?: string;
          device_created_at?: string;
          device_id?: string;
          fuel_closed_at?: string | null;
          id?: string;
          label?: string | null;
          opened_at?: string;
          opened_by?: string;
          organization_id?: string;
          station_id?: string;
          status?: Database['public']['Enums']['shift_status'];
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'shifts_closed_by_station_id_fkey';
            columns: ['closed_by', 'station_id'];
            isOneToOne: false;
            referencedRelation: 'employees';
            referencedColumns: ['id', 'station_id'];
          },
          {
            foreignKeyName: 'shifts_device_id_station_id_fkey';
            columns: ['device_id', 'station_id'];
            isOneToOne: false;
            referencedRelation: 'devices';
            referencedColumns: ['id', 'station_id'];
          },
          {
            foreignKeyName: 'shifts_opened_by_station_id_fkey';
            columns: ['opened_by', 'station_id'];
            isOneToOne: false;
            referencedRelation: 'employees';
            referencedColumns: ['id', 'station_id'];
          },
          {
            foreignKeyName: 'shifts_station_id_organization_id_fkey';
            columns: ['station_id', 'organization_id'];
            isOneToOne: false;
            referencedRelation: 'stations';
            referencedColumns: ['id', 'organization_id'];
          },
        ];
      };
      sn_communes: {
        Row: {
          code: string;
          department_code: string;
          name: string;
        };
        Insert: {
          code: string;
          department_code: string;
          name: string;
        };
        Update: {
          code?: string;
          department_code?: string;
          name?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'sn_communes_department_code_fkey';
            columns: ['department_code'];
            isOneToOne: false;
            referencedRelation: 'sn_departments';
            referencedColumns: ['code'];
          },
        ];
      };
      sn_departments: {
        Row: {
          code: string;
          name: string;
          region_code: string;
        };
        Insert: {
          code: string;
          name: string;
          region_code: string;
        };
        Update: {
          code?: string;
          name?: string;
          region_code?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'sn_departments_region_code_fkey';
            columns: ['region_code'];
            isOneToOne: false;
            referencedRelation: 'sn_regions';
            referencedColumns: ['code'];
          },
        ];
      };
      sn_regions: {
        Row: {
          code: string;
          name: string;
        };
        Insert: {
          code: string;
          name: string;
        };
        Update: {
          code?: string;
          name?: string;
        };
        Relationships: [];
      };
      station_settings: {
        Row: {
          cash_tolerance_fcfa: number | null;
          delivery_variance_pct: number | null;
          deposit_missing_hours: number | null;
          organization_id: string;
          small_variance_cumulative_fcfa: number | null;
          station_id: string;
          tank_variance_pct: number | null;
          updated_at: string;
        };
        Insert: {
          cash_tolerance_fcfa?: number | null;
          delivery_variance_pct?: number | null;
          deposit_missing_hours?: number | null;
          organization_id: string;
          small_variance_cumulative_fcfa?: number | null;
          station_id: string;
          tank_variance_pct?: number | null;
          updated_at?: string;
        };
        Update: {
          cash_tolerance_fcfa?: number | null;
          delivery_variance_pct?: number | null;
          deposit_missing_hours?: number | null;
          organization_id?: string;
          small_variance_cumulative_fcfa?: number | null;
          station_id?: string;
          tank_variance_pct?: number | null;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'station_settings_station_id_organization_id_fkey';
            columns: ['station_id', 'organization_id'];
            isOneToOne: false;
            referencedRelation: 'stations';
            referencedColumns: ['id', 'organization_id'];
          },
        ];
      };
      stations: {
        Row: {
          active: boolean;
          city: string | null;
          commune_code: string | null;
          created_at: string;
          id: string;
          name: string;
          organization_id: string;
          timezone: string;
          updated_at: string;
        };
        Insert: {
          active?: boolean;
          city?: string | null;
          commune_code?: string | null;
          created_at?: string;
          id?: string;
          name: string;
          organization_id: string;
          timezone?: string;
          updated_at?: string;
        };
        Update: {
          active?: boolean;
          city?: string | null;
          commune_code?: string | null;
          created_at?: string;
          id?: string;
          name?: string;
          organization_id?: string;
          timezone?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'stations_commune_code_fkey';
            columns: ['commune_code'];
            isOneToOne: false;
            referencedRelation: 'sn_communes';
            referencedColumns: ['code'];
          },
          {
            foreignKeyName: 'stations_organization_id_fkey';
            columns: ['organization_id'];
            isOneToOne: false;
            referencedRelation: 'organizations';
            referencedColumns: ['id'];
          },
        ];
      };
      supervisor_invitations: {
        Row: {
          accepted_at: string | null;
          email: string;
          id: string;
          invited_at: string;
          invited_by: string | null;
          organization_id: string;
          revoked_at: string | null;
          status: Database['public']['Enums']['invitation_status'];
          user_id: string | null;
        };
        Insert: {
          accepted_at?: string | null;
          email: string;
          id?: string;
          invited_at?: string;
          invited_by?: string | null;
          organization_id: string;
          revoked_at?: string | null;
          status?: Database['public']['Enums']['invitation_status'];
          user_id?: string | null;
        };
        Update: {
          accepted_at?: string | null;
          email?: string;
          id?: string;
          invited_at?: string;
          invited_by?: string | null;
          organization_id?: string;
          revoked_at?: string | null;
          status?: Database['public']['Enums']['invitation_status'];
          user_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'supervisor_invitations_organization_id_fkey';
            columns: ['organization_id'];
            isOneToOne: false;
            referencedRelation: 'organizations';
            referencedColumns: ['id'];
          },
        ];
      };
      tank_calibration_versions: {
        Row: {
          certificate_path: string | null;
          created_at: string;
          created_by: string | null;
          effective_from: string;
          id: string;
          note: string | null;
          organization_id: string;
          station_id: string;
          tank_id: string;
          version: number;
        };
        Insert: {
          certificate_path?: string | null;
          created_at?: string;
          created_by?: string | null;
          effective_from?: string;
          id?: string;
          note?: string | null;
          organization_id: string;
          station_id: string;
          tank_id: string;
          version: number;
        };
        Update: {
          certificate_path?: string | null;
          created_at?: string;
          created_by?: string | null;
          effective_from?: string;
          id?: string;
          note?: string | null;
          organization_id?: string;
          station_id?: string;
          tank_id?: string;
          version?: number;
        };
        Relationships: [
          {
            foreignKeyName: 'tank_calibration_versions_station_id_organization_id_fkey';
            columns: ['station_id', 'organization_id'];
            isOneToOne: false;
            referencedRelation: 'stations';
            referencedColumns: ['id', 'organization_id'];
          },
          {
            foreignKeyName: 'tank_calibration_versions_tank_id_station_id_fkey';
            columns: ['tank_id', 'station_id'];
            isOneToOne: false;
            referencedRelation: 'tanks';
            referencedColumns: ['id', 'station_id'];
          },
        ];
      };
      tank_calibrations: {
        Row: {
          created_at: string;
          height_mm: number;
          id: string;
          organization_id: string;
          station_id: string;
          tank_id: string;
          updated_at: string;
          version_id: string;
          volume_cl: number;
        };
        Insert: {
          created_at?: string;
          height_mm: number;
          id?: string;
          organization_id: string;
          station_id: string;
          tank_id: string;
          updated_at?: string;
          version_id: string;
          volume_cl: number;
        };
        Update: {
          created_at?: string;
          height_mm?: number;
          id?: string;
          organization_id?: string;
          station_id?: string;
          tank_id?: string;
          updated_at?: string;
          version_id?: string;
          volume_cl?: number;
        };
        Relationships: [
          {
            foreignKeyName: 'tank_calibrations_station_id_organization_id_fkey';
            columns: ['station_id', 'organization_id'];
            isOneToOne: false;
            referencedRelation: 'stations';
            referencedColumns: ['id', 'organization_id'];
          },
          {
            foreignKeyName: 'tank_calibrations_tank_id_station_id_fkey';
            columns: ['tank_id', 'station_id'];
            isOneToOne: false;
            referencedRelation: 'tanks';
            referencedColumns: ['id', 'station_id'];
          },
          {
            foreignKeyName: 'tank_calibrations_version_fk';
            columns: ['version_id', 'tank_id'];
            isOneToOne: false;
            referencedRelation: 'tank_calibration_versions';
            referencedColumns: ['id', 'tank_id'];
          },
        ];
      };
      tank_readings: {
        Row: {
          created_at: string;
          device_created_at: string;
          device_id: string;
          employee_id: string;
          evidence_id: string;
          expected_cl: number | null;
          gps_lat: number | null;
          gps_lng: number | null;
          height_mm: number;
          id: string;
          kind: Database['public']['Enums']['tank_reading_kind'];
          organization_id: string;
          shift_id: string | null;
          station_id: string;
          tank_id: string;
          variance_cl: number | null;
          volume_cl: number;
        };
        Insert: {
          created_at?: string;
          device_created_at: string;
          device_id: string;
          employee_id: string;
          evidence_id: string;
          expected_cl?: number | null;
          gps_lat?: number | null;
          gps_lng?: number | null;
          height_mm: number;
          id?: string;
          kind?: Database['public']['Enums']['tank_reading_kind'];
          organization_id: string;
          shift_id?: string | null;
          station_id: string;
          tank_id: string;
          variance_cl?: number | null;
          volume_cl: number;
        };
        Update: {
          created_at?: string;
          device_created_at?: string;
          device_id?: string;
          employee_id?: string;
          evidence_id?: string;
          expected_cl?: number | null;
          gps_lat?: number | null;
          gps_lng?: number | null;
          height_mm?: number;
          id?: string;
          kind?: Database['public']['Enums']['tank_reading_kind'];
          organization_id?: string;
          shift_id?: string | null;
          station_id?: string;
          tank_id?: string;
          variance_cl?: number | null;
          volume_cl?: number;
        };
        Relationships: [
          {
            foreignKeyName: 'tank_readings_device_id_station_id_fkey';
            columns: ['device_id', 'station_id'];
            isOneToOne: false;
            referencedRelation: 'devices';
            referencedColumns: ['id', 'station_id'];
          },
          {
            foreignKeyName: 'tank_readings_employee_id_station_id_fkey';
            columns: ['employee_id', 'station_id'];
            isOneToOne: false;
            referencedRelation: 'employees';
            referencedColumns: ['id', 'station_id'];
          },
          {
            foreignKeyName: 'tank_readings_evidence_id_station_id_fkey';
            columns: ['evidence_id', 'station_id'];
            isOneToOne: false;
            referencedRelation: 'evidence_files';
            referencedColumns: ['id', 'station_id'];
          },
          {
            foreignKeyName: 'tank_readings_shift_fk';
            columns: ['shift_id', 'station_id'];
            isOneToOne: false;
            referencedRelation: 'shifts';
            referencedColumns: ['id', 'station_id'];
          },
          {
            foreignKeyName: 'tank_readings_station_id_organization_id_fkey';
            columns: ['station_id', 'organization_id'];
            isOneToOne: false;
            referencedRelation: 'stations';
            referencedColumns: ['id', 'organization_id'];
          },
          {
            foreignKeyName: 'tank_readings_tank_id_station_id_fkey';
            columns: ['tank_id', 'station_id'];
            isOneToOne: false;
            referencedRelation: 'tanks';
            referencedColumns: ['id', 'station_id'];
          },
        ];
      };
      tanks: {
        Row: {
          active: boolean;
          capacity_cl: number;
          created_at: string;
          fuel_product_code: Database['public']['Enums']['fuel_code'];
          id: string;
          label: string;
          organization_id: string;
          reorder_threshold_pct: number;
          station_id: string;
          updated_at: string;
        };
        Insert: {
          active?: boolean;
          capacity_cl: number;
          created_at?: string;
          fuel_product_code: Database['public']['Enums']['fuel_code'];
          id?: string;
          label: string;
          organization_id: string;
          reorder_threshold_pct?: number;
          station_id: string;
          updated_at?: string;
        };
        Update: {
          active?: boolean;
          capacity_cl?: number;
          created_at?: string;
          fuel_product_code?: Database['public']['Enums']['fuel_code'];
          id?: string;
          label?: string;
          organization_id?: string;
          reorder_threshold_pct?: number;
          station_id?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'tanks_fuel_product_code_fkey';
            columns: ['fuel_product_code'];
            isOneToOne: false;
            referencedRelation: 'fuel_products';
            referencedColumns: ['code'];
          },
          {
            foreignKeyName: 'tanks_station_id_organization_id_fkey';
            columns: ['station_id', 'organization_id'];
            isOneToOne: false;
            referencedRelation: 'stations';
            referencedColumns: ['id', 'organization_id'];
          },
        ];
      };
      transaction_items: {
        Row: {
          amount_fcfa: number;
          created_at: string;
          description: string;
          id: string;
          nozzle_id: string | null;
          organization_id: string;
          product_id: string | null;
          quantity: number;
          station_id: string;
          transaction_id: string;
          unit_price_fcfa: number;
        };
        Insert: {
          amount_fcfa: number;
          created_at?: string;
          description: string;
          id?: string;
          nozzle_id?: string | null;
          organization_id: string;
          product_id?: string | null;
          quantity: number;
          station_id: string;
          transaction_id: string;
          unit_price_fcfa: number;
        };
        Update: {
          amount_fcfa?: number;
          created_at?: string;
          description?: string;
          id?: string;
          nozzle_id?: string | null;
          organization_id?: string;
          product_id?: string | null;
          quantity?: number;
          station_id?: string;
          transaction_id?: string;
          unit_price_fcfa?: number;
        };
        Relationships: [
          {
            foreignKeyName: 'transaction_items_nozzle_id_station_id_fkey';
            columns: ['nozzle_id', 'station_id'];
            isOneToOne: false;
            referencedRelation: 'nozzles';
            referencedColumns: ['id', 'station_id'];
          },
          {
            foreignKeyName: 'transaction_items_product_fk';
            columns: ['product_id', 'organization_id'];
            isOneToOne: false;
            referencedRelation: 'products';
            referencedColumns: ['id', 'organization_id'];
          },
          {
            foreignKeyName: 'transaction_items_station_id_organization_id_fkey';
            columns: ['station_id', 'organization_id'];
            isOneToOne: false;
            referencedRelation: 'stations';
            referencedColumns: ['id', 'organization_id'];
          },
          {
            foreignKeyName: 'transaction_items_transaction_id_station_id_fkey';
            columns: ['transaction_id', 'station_id'];
            isOneToOne: false;
            referencedRelation: 'transactions';
            referencedColumns: ['id', 'station_id'];
          },
        ];
      };
      transactions: {
        Row: {
          created_at: string;
          device_created_at: string;
          device_id: string;
          employee_id: string;
          id: string;
          kind: Database['public']['Enums']['transaction_kind'];
          note: string | null;
          organization_id: string;
          reverses_id: string | null;
          shift_id: string;
          station_id: string;
          total_fcfa: number;
        };
        Insert: {
          created_at?: string;
          device_created_at: string;
          device_id: string;
          employee_id: string;
          id?: string;
          kind: Database['public']['Enums']['transaction_kind'];
          note?: string | null;
          organization_id: string;
          reverses_id?: string | null;
          shift_id: string;
          station_id: string;
          total_fcfa: number;
        };
        Update: {
          created_at?: string;
          device_created_at?: string;
          device_id?: string;
          employee_id?: string;
          id?: string;
          kind?: Database['public']['Enums']['transaction_kind'];
          note?: string | null;
          organization_id?: string;
          reverses_id?: string | null;
          shift_id?: string;
          station_id?: string;
          total_fcfa?: number;
        };
        Relationships: [
          {
            foreignKeyName: 'transactions_device_id_station_id_fkey';
            columns: ['device_id', 'station_id'];
            isOneToOne: false;
            referencedRelation: 'devices';
            referencedColumns: ['id', 'station_id'];
          },
          {
            foreignKeyName: 'transactions_employee_id_station_id_fkey';
            columns: ['employee_id', 'station_id'];
            isOneToOne: false;
            referencedRelation: 'employees';
            referencedColumns: ['id', 'station_id'];
          },
          {
            foreignKeyName: 'transactions_reverses_id_fkey';
            columns: ['reverses_id'];
            isOneToOne: false;
            referencedRelation: 'transactions';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'transactions_shift_id_station_id_fkey';
            columns: ['shift_id', 'station_id'];
            isOneToOne: false;
            referencedRelation: 'shifts';
            referencedColumns: ['id', 'station_id'];
          },
          {
            foreignKeyName: 'transactions_station_id_organization_id_fkey';
            columns: ['station_id', 'organization_id'];
            isOneToOne: false;
            referencedRelation: 'stations';
            referencedColumns: ['id', 'organization_id'];
          },
        ];
      };
      void_approvals: {
        Row: {
          decided_at: string;
          decided_by: string;
          decision: Database['public']['Enums']['approval_decision'];
          id: string;
          note: string | null;
          organization_id: string;
          station_id: string;
          void_id: string;
        };
        Insert: {
          decided_at?: string;
          decided_by: string;
          decision: Database['public']['Enums']['approval_decision'];
          id?: string;
          note?: string | null;
          organization_id: string;
          station_id: string;
          void_id: string;
        };
        Update: {
          decided_at?: string;
          decided_by?: string;
          decision?: Database['public']['Enums']['approval_decision'];
          id?: string;
          note?: string | null;
          organization_id?: string;
          station_id?: string;
          void_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'void_approvals_void_id_fkey';
            columns: ['void_id'];
            isOneToOne: true;
            referencedRelation: 'voids';
            referencedColumns: ['id'];
          },
        ];
      };
      void_role_limits: {
        Row: {
          max_fcfa: number;
          organization_id: string;
          role: Database['public']['Enums']['employee_role'];
          updated_at: string;
        };
        Insert: {
          max_fcfa: number;
          organization_id: string;
          role: Database['public']['Enums']['employee_role'];
          updated_at?: string;
        };
        Update: {
          max_fcfa?: number;
          organization_id?: string;
          role?: Database['public']['Enums']['employee_role'];
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'void_role_limits_organization_id_fkey';
            columns: ['organization_id'];
            isOneToOne: false;
            referencedRelation: 'organizations';
            referencedColumns: ['id'];
          },
        ];
      };
      voids: {
        Row: {
          amount_fcfa: number;
          approved_by: string | null;
          created_at: string;
          device_created_at: string | null;
          device_id: string | null;
          employee_id: string | null;
          id: string;
          organization_id: string;
          reason: string;
          shift_id: string | null;
          station_id: string;
          transaction_id: string;
        };
        Insert: {
          amount_fcfa: number;
          approved_by?: string | null;
          created_at?: string;
          device_created_at?: string | null;
          device_id?: string | null;
          employee_id?: string | null;
          id?: string;
          organization_id: string;
          reason: string;
          shift_id?: string | null;
          station_id: string;
          transaction_id: string;
        };
        Update: {
          amount_fcfa?: number;
          approved_by?: string | null;
          created_at?: string;
          device_created_at?: string | null;
          device_id?: string | null;
          employee_id?: string | null;
          id?: string;
          organization_id?: string;
          reason?: string;
          shift_id?: string | null;
          station_id?: string;
          transaction_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'voids_device_id_station_id_fkey';
            columns: ['device_id', 'station_id'];
            isOneToOne: false;
            referencedRelation: 'devices';
            referencedColumns: ['id', 'station_id'];
          },
          {
            foreignKeyName: 'voids_employee_id_station_id_fkey';
            columns: ['employee_id', 'station_id'];
            isOneToOne: false;
            referencedRelation: 'employees';
            referencedColumns: ['id', 'station_id'];
          },
          {
            foreignKeyName: 'voids_shift_fk';
            columns: ['shift_id', 'station_id'];
            isOneToOne: false;
            referencedRelation: 'shifts';
            referencedColumns: ['id', 'station_id'];
          },
          {
            foreignKeyName: 'voids_station_id_organization_id_fkey';
            columns: ['station_id', 'organization_id'];
            isOneToOne: false;
            referencedRelation: 'stations';
            referencedColumns: ['id', 'organization_id'];
          },
          {
            foreignKeyName: 'voids_transaction_id_station_id_fkey';
            columns: ['transaction_id', 'station_id'];
            isOneToOne: false;
            referencedRelation: 'transactions';
            referencedColumns: ['id', 'station_id'];
          },
        ];
      };
    };
    Views: {
      current_fuel_prices: {
        Row: {
          effective_at: string | null;
          fuel_product_code: Database['public']['Enums']['fuel_code'] | null;
          organization_id: string | null;
          price_change_id: string | null;
          price_fcfa_per_litre: number | null;
          station_id: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'price_changes_fuel_product_code_fkey';
            columns: ['fuel_product_code'];
            isOneToOne: false;
            referencedRelation: 'fuel_products';
            referencedColumns: ['code'];
          },
          {
            foreignKeyName: 'price_changes_station_id_organization_id_fkey';
            columns: ['station_id', 'organization_id'];
            isOneToOne: false;
            referencedRelation: 'stations';
            referencedColumns: ['id', 'organization_id'];
          },
        ];
      };
    };
    Functions: {
      advance_delivery: {
        Args: { p_reading_id?: string; p_session_id: string; p_step: string };
        Returns: Json;
      };
      alert_route_for: {
        Args: {
          p_org: string;
          p_type: Database['public']['Enums']['alert_type'];
        };
        Returns: Database['public']['Enums']['alert_route'];
      };
      build_evening_report: { Args: { p_closing_id: string }; Returns: Json };
      build_summary_report: {
        Args: { p_date: string; p_org: string };
        Returns: Json;
      };
      calibration_version_at: {
        Args: { p_at?: string; p_tank_id: string };
        Returns: string;
      };
      claim_notifications: {
        Args: { p_limit?: number };
        Returns: {
          attempts: number;
          body: string;
          channel: Database['public']['Enums']['notification_channel'];
          created_at: string;
          delivered_at: string | null;
          fallback_of: string | null;
          id: string;
          idempotency_key: string;
          kind: Database['public']['Enums']['notification_kind'];
          last_error: string | null;
          next_attempt_at: string;
          organization_id: string;
          provider_message_id: string | null;
          recipient_id: string | null;
          sent_at: string | null;
          station_id: string | null;
          status: Database['public']['Enums']['notification_status'];
          template: string;
          to_phone: string;
          variables: Json;
        }[];
        SetofOptions: {
          from: '*';
          to: 'notification_outbox';
          isOneToOne: false;
          isSetofReturn: true;
        };
      };
      close_shift_cash: {
        Args: {
          p_deposit_mode?: Database['public']['Enums']['deposit_mode'];
          p_justification?: string;
          p_shift_id: string;
        };
        Returns: Json;
      };
      close_shift_fuel: { Args: { p_shift_id: string }; Returns: Json };
      compare_handover: {
        Args: { p_handover_id: string };
        Returns: {
          index_incoming_cl: number;
          index_outgoing_cl: number;
          label: string;
          nozzle_id: string;
          variance_cl: number;
        }[];
      };
      confirm_evidence_upload: {
        Args: { p_evidence_id: string };
        Returns: Json;
      };
      consume_pairing_code: {
        Args: { p_code: string; p_ip: string; p_pairing_id?: string };
        Returns: Json;
      };
      create_calibration_version: {
        Args: {
          p_certificate_path?: string;
          p_note?: string;
          p_points: Json;
          p_tank_id: string;
        };
        Returns: string;
      };
      create_organization: {
        Args: {
          p_name: string;
          p_plan_code: Database['public']['Enums']['plan_code'];
        };
        Returns: string;
      };
      create_pairing_code: { Args: { p_station_id: string }; Returns: Json };
      credit_account_balance: {
        Args: { p_account_id: string };
        Returns: number;
      };
      credit_account_statement: {
        Args: { p_account_id: string };
        Returns: {
          amount_fcfa: number;
          at: string;
          balance_fcfa: number;
          employee_name: string;
          entry_id: string;
          kind: Database['public']['Enums']['credit_entry_kind'];
          payment_id: string;
          transaction_id: string;
          vehicle_plate: string;
        }[];
      };
      current_device_id: { Args: never; Returns: string };
      current_device_organization_id: { Args: never; Returns: string };
      current_device_station_id: { Args: never; Returns: string };
      current_employee_id: { Args: never; Returns: string };
      current_employee_session: { Args: never; Returns: Json };
      current_org_ids: { Args: never; Returns: string[] };
      current_station_ids: { Args: never; Returns: string[] };
      dashboard_summary: {
        Args: { p_from: string; p_station_id?: string; p_to: string };
        Returns: Json;
      };
      decide_cash_variance: {
        Args: {
          p_closing_id: string;
          p_decision: Database['public']['Enums']['cash_variance_decision'];
          p_note?: string;
        };
        Returns: undefined;
      };
      decide_credit_account: {
        Args: {
          p_account_id: string;
          p_approve: boolean;
          p_limit_fcfa?: number;
        };
        Returns: undefined;
      };
      decide_void: {
        Args: { p_approve: boolean; p_note?: string; p_void_id: string };
        Returns: undefined;
      };
      declare_bank_deposit: {
        Args: {
          p_amount_fcfa: number;
          p_bank_ref?: string;
          p_deposited_at?: string;
          p_evidence_id: string;
          p_shift_ids: string[];
        };
        Returns: Json;
      };
      dispatch_scheduled_reports: { Args: never; Returns: number };
      effective_setting: {
        Args: { p_key: string; p_station_id: string };
        Returns: number;
      };
      employee_small_variance_cumulative: {
        Args: { p_days?: number; p_employee_id: string };
        Returns: number;
      };
      employee_variance_scores: {
        Args: { p_days?: number; p_station_id?: string };
        Returns: {
          cash_variances: number;
          employee_id: string;
          full_name: string;
          handover_variances: number;
          meter_regressions: number;
          rejected_voids: number;
          score: number;
          shifts: number;
          small_variances: number;
          station_id: string;
          station_name: string;
          weighted: number;
        }[];
      };
      employees_with_pin: { Args: never; Returns: string[] };
      end_employee_session: {
        Args: {
          p_reason?: Database['public']['Enums']['session_end_reason'];
          p_session_id: string;
        };
        Returns: undefined;
      };
      enqueue_evening_report: {
        Args: { p_closing_id: string };
        Returns: number;
      };
      enqueue_summary_report: {
        Args: { p_date: string; p_org: string };
        Returns: number;
      };
      escalate_undelivered: { Args: never; Returns: number };
      evidence_is_uploaded: {
        Args: { p_evidence_id: string };
        Returns: boolean;
      };
      flag_missing_deposits: { Args: never; Returns: number };
      flag_pending_mobile_money: { Args: never; Returns: number };
      format_fcfa: { Args: { p: number }; Returns: string };
      format_litres: { Args: { p_cl: number }; Returns: string };
      format_pct: { Args: { p: number }; Returns: string };
      fuel_price_at: {
        Args: {
          p_at: string;
          p_product: Database['public']['Enums']['fuel_code'];
          p_station_id: string;
        };
        Returns: number;
      };
      import_mobile_money_statement: {
        Args: {
          p_filename?: string;
          p_lines: Json;
          p_mapping?: Json;
          p_provider: Database['public']['Enums']['mobile_money_provider'];
        };
        Returns: Json;
      };
      is_org_owner: { Args: { p_org_id: string }; Returns: boolean };
      last_closing_index: {
        Args: { p_nozzle_id: string };
        Returns: {
          at: string;
          index_cl: number;
          shift_id: string;
        }[];
      };
      last_meter_index: {
        Args: { p_before?: string; p_nozzle_id: string };
        Returns: {
          at: string;
          index_cl: number;
          kind: Database['public']['Enums']['meter_reading_kind'];
          reading_id: string;
        }[];
      };
      latest_cash_count: {
        Args: { p_shift_id: string };
        Returns: {
          created_at: string;
          denominations: Json;
          id: string;
          total_fcfa: number;
        }[];
      };
      locked_tolerances: { Args: never; Returns: Json };
      normaliser_localite: { Args: { p: string }; Returns: string };
      nozzle_is_paused: { Args: { p_nozzle_id: string }; Returns: boolean };
      open_shift: { Args: { p_shift_id: string }; Returns: Json };
      payment_match_status: {
        Args: { p_payment_id: string };
        Returns: Database['public']['Enums']['payment_match_status'];
      };
      pending_validations: { Args: never; Returns: Json };
      record_credit_repayment: {
        Args: {
          p_account_id: string;
          p_amount_fcfa: number;
          p_external_ref?: string;
          p_method: Database['public']['Enums']['payment_method'];
          p_shift_id?: string;
        };
        Returns: Json;
      };
      record_delivery_status: {
        Args: {
          p_error?: string;
          p_provider_message_id: string;
          p_status: string;
        };
        Returns: number;
      };
      record_sale: { Args: { p: Json }; Returns: Json };
      register_paired_device: {
        Args: { p_auth_user_id: string; p_label: string; p_pairing_id: string };
        Returns: string;
      };
      register_supervisor_invitation: {
        Args: {
          p_email: string;
          p_invited_by: string;
          p_org: string;
          p_user_id: string;
        };
        Returns: string;
      };
      remind_manager: { Args: { p_shift_id: string }; Returns: Json };
      render_alert_message: { Args: { p_alert_id: string }; Returns: string };
      render_evening_report: { Args: { r: Json }; Returns: string };
      render_summary_report: { Args: { r: Json }; Returns: string };
      report_handover_discrepancy: {
        Args: { p_handover_id: string; p_reason: string };
        Returns: Json;
      };
      request_credit_account: {
        Args: { p_customer_name: string; p_phone?: string };
        Returns: string;
      };
      request_void: {
        Args: {
          p_amount_fcfa: number;
          p_reason: string;
          p_transaction_id: string;
        };
        Returns: Json;
      };
      reverse_delivery: {
        Args: { p_delivery_id: string; p_reason: string };
        Returns: string;
      };
      revoke_device: { Args: { p_device_id: string }; Returns: undefined };
      revoke_supervisor: {
        Args: { p_invitation_id: string };
        Returns: undefined;
      };
      set_employee_pin: {
        Args: { p_employee_id: string; p_pin: string };
        Returns: undefined;
      };
      set_notification_status: {
        Args: {
          p_error?: string;
          p_id: string;
          p_provider_message_id?: string;
          p_retry_after_seconds?: number;
          p_status: Database['public']['Enums']['notification_status'];
        };
        Returns: undefined;
      };
      shift_cash_summary: { Args: { p_shift_id: string }; Returns: Json };
      shift_expected_fuel: { Args: { p_shift_id: string }; Returns: Json };
      shift_fuel_summary: { Args: { p_shift_id: string }; Returns: Json };
      shift_missing_items: {
        Args: { p_kind: string; p_shift_id: string };
        Returns: Json;
      };
      shift_price_changes: {
        Args: { p_shift_id: string };
        Returns: {
          effective_at: string;
          fuel_product_code: Database['public']['Enums']['fuel_code'];
          missing_nozzles: Json;
          price_change_id: string;
          price_fcfa_per_litre: number;
        }[];
      };
      sign_delivery: {
        Args: {
          p_invoice_evidence_id: string;
          p_invoice_ref?: string;
          p_invoiced_cl: number;
          p_reserve_reason?: string;
          p_session_id: string;
          p_with_reserve?: boolean;
        };
        Returns: Json;
      };
      sign_handover_incoming: { Args: { p_handover_id: string }; Returns: Json };
      sign_handover_outgoing: { Args: { p_handover_id: string }; Returns: Json };
      start_delivery: {
        Args: {
          p_driver_name?: string;
          p_supplier?: string;
          p_tank_id: string;
          p_truck_plate?: string;
        };
        Returns: Json;
      };
      start_handover: {
        Args: { p_incoming_employee_id: string; p_shift_id: string };
        Returns: Json;
      };
      station_fuel_setup_status: {
        Args: { p_station_id: string };
        Returns: Json;
      };
      station_localite: { Args: { p_station_id: string }; Returns: Json };
      supervisor_invitation_status: {
        Args: { p_invitation_id: string };
        Returns: Database['public']['Enums']['invitation_status'];
      };
      tank_levels: {
        Args: { p_station_id?: string };
        Returns: {
          active: boolean;
          autonomy_days: number;
          below_threshold: boolean;
          capacity_cl: number;
          daily_sales_cl: number;
          fuel_product_code: Database['public']['Enums']['fuel_code'];
          has_gauge: boolean;
          label: string;
          measured_at: string;
          measured_cl: number;
          reorder_cl: number;
          reorder_threshold_pct: number;
          station_id: string;
          tank_id: string;
          theoretical_cl: number;
          variance_cl: number;
          variance_pct: number;
        }[];
      };
      tank_litres_sold_between: {
        Args: { p_from: string; p_tank_id: string; p_to: string };
        Returns: number;
      };
      theoretical_stock_cl: {
        Args: { p_at?: string; p_tank_id: string };
        Returns: {
          base_at: string;
          base_reading_id: string;
          delivered_cl: number;
          expected_cl: number;
          litres_sold_cl: number;
        }[];
      };
      verify_employee_pin: {
        Args: { p_employee_id: string; p_pin: string };
        Returns: Json;
      };
      void_is_approved: { Args: { p_void_id: string }; Returns: boolean };
      void_limit_for: {
        Args: {
          p_org: string;
          p_role: Database['public']['Enums']['employee_role'];
        };
        Returns: number;
      };
      volume_from_calibration: {
        Args: { p_at?: string; p_height_mm: number; p_tank_id: string };
        Returns: number;
      };
    };
    Enums: {
      alert_route: 'immediate' | 'report';
      alert_severity: 'info' | 'warning' | 'critical';
      alert_type:
        | 'cash_variance'
        | 'tank_variance'
        | 'handover_mismatch'
        | 'delivery_variance'
        | 'void_requested'
        | 'missing_evidence'
        | 'credit_limit'
        | 'price_change'
        | 'blind_count_variance'
        | 'unknown_device'
        | 'other'
        | 'pin_lockout'
        | 'device_paired'
        | 'device_revoked'
        | 'meter_regression'
        | 'delivery_shortfall'
        | 'shift_opened'
        | 'void_over_limit'
        | 'deposit_mismatch'
        | 'deposit_missing'
        | 'mobile_money_unmatched'
        | 'mobile_money_pending'
        | 'credit_account_requested'
        | 'price_change_reading_missing'
        | 'cash_small_variance_cumulative'
        | 'tank_low';
      approval_decision: 'approved' | 'rejected';
      audit_action: 'INSERT' | 'UPDATE' | 'DELETE';
      blind_count_status: 'requested' | 'submitted' | 'cancelled';
      cash_variance_decision: 'accept_loss' | 'salary_deduction' | 'recount';
      credit_account_status: 'pending' | 'active' | 'rejected' | 'closed';
      credit_entry_kind: 'sale' | 'repayment' | 'adjustment';
      delivery_status:
        'gauging_before' | 'unloading' | 'gauging_after' | 'signing' | 'signed' | 'cancelled';
      deposit_mode: 'slip' | 'later';
      employee_role: 'manager' | 'pump_attendant' | 'shop_cashier' | 'mechanic' | 'washer';
      evidence_kind:
        | 'meter_photo'
        | 'tank_gauge'
        | 'delivery_note'
        | 'bank_slip'
        | 'vehicle_plate'
        | 'count_photo'
        | 'other'
        | 'credit_note'
        | 'card_receipt';
      fuel_code: 'super' | 'gasoil';
      handover_side: 'outgoing' | 'incoming';
      handover_status: 'pending' | 'signed' | 'disputed';
      inventory_movement_kind:
        | 'purchase'
        | 'sale'
        | 'work_order'
        | 'wash'
        | 'loss'
        | 'adjustment'
        | 'transfer'
        | 'count_correction';
      invitation_status: 'sent' | 'accepted' | 'revoked';
      meter_reading_kind: 'open' | 'close' | 'handover' | 'price_change';
      mobile_money_provider: 'wave' | 'orange_money';
      notification_channel: 'dev' | 'whatsapp' | 'sms';
      notification_kind: 'evening_report' | 'summary_report' | 'alert' | 'reminder';
      notification_status: 'queued' | 'sent' | 'delivered' | 'failed' | 'cancelled';
      org_member_role: 'owner' | 'supervisor';
      payment_match_status: 'pending' | 'matched' | 'unmatched';
      payment_method: 'cash' | 'card' | 'wave' | 'orange_money' | 'credit';
      plan_code: 'solo' | 'groupe' | 'reseau';
      product_category: 'shop' | 'garage_part' | 'lubricant' | 'wash_supply' | 'gas';
      product_unit: 'unit' | 'cl';
      reconciliation_kind: 'tank' | 'cash' | 'mobile_money';
      reconciliation_status: 'ok' | 'variance' | 'pending';
      report_mode: 'after_each_closing' | 'fixed_time';
      session_end_reason: 'logout' | 'replaced' | 'expired' | 'revoked' | 'inactivity' | 'handover';
      shift_status: 'opening' | 'open' | 'closing' | 'closed';
      tank_reading_kind: 'open' | 'close' | 'delivery_before' | 'delivery_after' | 'spot';
      transaction_kind: 'fuel' | 'shop' | 'garage' | 'wash' | 'adjustment' | 'credit_repayment';
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};

type DatabaseWithoutInternals = Omit<Database, '__InternalSupabase'>;

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, 'public'>];

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema['Tables'] & DefaultSchema['Views'])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Views'])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Views'])[TableName] extends {
      Row: infer R;
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema['Tables'] & DefaultSchema['Views'])
    ? (DefaultSchema['Tables'] & DefaultSchema['Views'])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R;
      }
      ? R
      : never
    : never;

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema['Tables'] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables']
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'][TableName] extends {
      Insert: infer I;
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema['Tables']
    ? DefaultSchema['Tables'][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I;
      }
      ? I
      : never
    : never;

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema['Tables'] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables']
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'][TableName] extends {
      Update: infer U;
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema['Tables']
    ? DefaultSchema['Tables'][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U;
      }
      ? U
      : never
    : never;

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    keyof DefaultSchema['Enums'] | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions['schema']]['Enums']
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions['schema']]['Enums'][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema['Enums']
    ? DefaultSchema['Enums'][DefaultSchemaEnumNameOrOptions]
    : never;

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    keyof DefaultSchema['CompositeTypes'] | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions['schema']]['CompositeTypes']
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions['schema']]['CompositeTypes'][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema['CompositeTypes']
    ? DefaultSchema['CompositeTypes'][PublicCompositeTypeNameOrOptions]
    : never;

export const Constants = {
  public: {
    Enums: {
      alert_route: ['immediate', 'report'],
      alert_severity: ['info', 'warning', 'critical'],
      alert_type: [
        'cash_variance',
        'tank_variance',
        'handover_mismatch',
        'delivery_variance',
        'void_requested',
        'missing_evidence',
        'credit_limit',
        'price_change',
        'blind_count_variance',
        'unknown_device',
        'other',
        'pin_lockout',
        'device_paired',
        'device_revoked',
        'meter_regression',
        'delivery_shortfall',
        'shift_opened',
        'void_over_limit',
        'deposit_mismatch',
        'deposit_missing',
        'mobile_money_unmatched',
        'mobile_money_pending',
        'credit_account_requested',
        'price_change_reading_missing',
        'cash_small_variance_cumulative',
        'tank_low',
      ],
      approval_decision: ['approved', 'rejected'],
      audit_action: ['INSERT', 'UPDATE', 'DELETE'],
      blind_count_status: ['requested', 'submitted', 'cancelled'],
      cash_variance_decision: ['accept_loss', 'salary_deduction', 'recount'],
      credit_account_status: ['pending', 'active', 'rejected', 'closed'],
      credit_entry_kind: ['sale', 'repayment', 'adjustment'],
      delivery_status: [
        'gauging_before',
        'unloading',
        'gauging_after',
        'signing',
        'signed',
        'cancelled',
      ],
      deposit_mode: ['slip', 'later'],
      employee_role: ['manager', 'pump_attendant', 'shop_cashier', 'mechanic', 'washer'],
      evidence_kind: [
        'meter_photo',
        'tank_gauge',
        'delivery_note',
        'bank_slip',
        'vehicle_plate',
        'count_photo',
        'other',
        'credit_note',
        'card_receipt',
      ],
      fuel_code: ['super', 'gasoil'],
      handover_side: ['outgoing', 'incoming'],
      handover_status: ['pending', 'signed', 'disputed'],
      inventory_movement_kind: [
        'purchase',
        'sale',
        'work_order',
        'wash',
        'loss',
        'adjustment',
        'transfer',
        'count_correction',
      ],
      invitation_status: ['sent', 'accepted', 'revoked'],
      meter_reading_kind: ['open', 'close', 'handover', 'price_change'],
      mobile_money_provider: ['wave', 'orange_money'],
      notification_channel: ['dev', 'whatsapp', 'sms'],
      notification_kind: ['evening_report', 'summary_report', 'alert', 'reminder'],
      notification_status: ['queued', 'sent', 'delivered', 'failed', 'cancelled'],
      org_member_role: ['owner', 'supervisor'],
      payment_match_status: ['pending', 'matched', 'unmatched'],
      payment_method: ['cash', 'card', 'wave', 'orange_money', 'credit'],
      plan_code: ['solo', 'groupe', 'reseau'],
      product_category: ['shop', 'garage_part', 'lubricant', 'wash_supply', 'gas'],
      product_unit: ['unit', 'cl'],
      reconciliation_kind: ['tank', 'cash', 'mobile_money'],
      reconciliation_status: ['ok', 'variance', 'pending'],
      report_mode: ['after_each_closing', 'fixed_time'],
      session_end_reason: ['logout', 'replaced', 'expired', 'revoked', 'inactivity', 'handover'],
      shift_status: ['opening', 'open', 'closing', 'closed'],
      tank_reading_kind: ['open', 'close', 'delivery_before', 'delivery_after', 'spot'],
      transaction_kind: ['fuel', 'shop', 'garage', 'wash', 'adjustment', 'credit_repayment'],
    },
  },
} as const;
