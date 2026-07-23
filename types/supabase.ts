export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  public: {
    Tables: {
      marketing_waitlist_leads: {
        Row: {
          id: string;
          lead_identity_hash: string;
          restaurant_name: string | null;
          contact: string;
          contact_email: string | null;
          contact_phone: string | null;
          business_type: "cafe" | "milk-tea" | "restaurant" | "small-eatery" | "chain";
          pilot_goal: "qr-ordering" | "ai-operations" | "staff-inventory";
          selected_plan: "pro" | "premium";
          source: string;
          variant: string;
          page_path: string | null;
          utm_source: string | null;
          utm_medium: string | null;
          utm_campaign: string | null;
          utm_content: string | null;
          status: "captured" | "qualified" | "contacted" | "signed_up" | "archived";
          nurture_stage: string;
          submission_count: number;
          metadata: Json;
          created_at: string;
          updated_at: string;
          last_submitted_at: string;
        };
        Insert: {
          id?: string;
          lead_identity_hash: string;
          restaurant_name?: string | null;
          contact: string;
          contact_email?: string | null;
          contact_phone?: string | null;
          business_type?: "cafe" | "milk-tea" | "restaurant" | "small-eatery" | "chain";
          pilot_goal?: "qr-ordering" | "ai-operations" | "staff-inventory";
          selected_plan?: "pro" | "premium";
          source?: string;
          variant?: string;
          page_path?: string | null;
          utm_source?: string | null;
          utm_medium?: string | null;
          utm_campaign?: string | null;
          utm_content?: string | null;
          status?: "captured" | "qualified" | "contacted" | "signed_up" | "archived";
          nurture_stage?: string;
          submission_count?: number;
          metadata?: Json;
          created_at?: string;
          updated_at?: string;
          last_submitted_at?: string;
        };
        Update: {
          id?: string;
          lead_identity_hash?: string;
          restaurant_name?: string | null;
          contact?: string;
          contact_email?: string | null;
          contact_phone?: string | null;
          business_type?: "cafe" | "milk-tea" | "restaurant" | "small-eatery" | "chain";
          pilot_goal?: "qr-ordering" | "ai-operations" | "staff-inventory";
          selected_plan?: "pro" | "premium";
          source?: string;
          variant?: string;
          page_path?: string | null;
          utm_source?: string | null;
          utm_medium?: string | null;
          utm_campaign?: string | null;
          utm_content?: string | null;
          status?: "captured" | "qualified" | "contacted" | "signed_up" | "archived";
          nurture_stage?: string;
          submission_count?: number;
          metadata?: Json;
          created_at?: string;
          updated_at?: string;
          last_submitted_at?: string;
        };
        Relationships: [];
      };
      marketing_funnel_events: {
        Row: {
          id: string;
          session_id: string;
          event_name: string;
          page_path: string | null;
          source: string | null;
          variant: string | null;
          target_href: string | null;
          target_text: string | null;
          plan_code: string | null;
          lead_id: string | null;
          metadata: Json;
          user_agent: string | null;
          ip_hash: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          session_id: string;
          event_name: string;
          page_path?: string | null;
          source?: string | null;
          variant?: string | null;
          target_href?: string | null;
          target_text?: string | null;
          plan_code?: string | null;
          lead_id?: string | null;
          metadata?: Json;
          user_agent?: string | null;
          ip_hash?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          session_id?: string;
          event_name?: string;
          page_path?: string | null;
          source?: string | null;
          variant?: string | null;
          target_href?: string | null;
          target_text?: string | null;
          plan_code?: string | null;
          lead_id?: string | null;
          metadata?: Json;
          user_agent?: string | null;
          ip_hash?: string | null;
          created_at?: string;
        };
        Relationships: [];
      };
      restaurants: {
        Row: {
          id: string;
          name: string;
          slug: string;
          owner_user_id: string | null;
          staff_code: string;
          staff_code_generated_at: string | null;
          business_type: "CAFE" | "RESTAURANT" | "FAST_FOOD" | "BAR" | "OTHER" | null;
          timezone: string;
          table_count: number | null;
          bank_code: string | null;
          bank_account: string | null;
          bank_account_name: string | null;
          contact_email: string | null;
          hotline: string | null;
          address: string | null;
          description: string | null;
          logo_url: string | null;
          opening_time: string | null;
          closing_time: string | null;
          brand_primary: string | null;
          brand_accent: string | null;
          allow_legacy_qr: boolean;
          online_ordering_enabled: boolean;
          pickup_enabled: boolean;
          delivery_enabled: boolean;
          store_lat: number | null;
          store_lng: number | null;
          store_geog: unknown | null;
          delivery_radius_km: number;
          free_delivery_radius_km: number;
          delivery_base_fee: number;
          delivery_fee_per_km: number;
          min_order_for_delivery: number;
          pickup_eta_minutes: number;
          delivery_eta_minutes: number;
          online_payment_mode: "PAY_AFTER" | "QR_PREPAID";
          delivery_tracking_enabled: boolean;
          map_provider: "maplibre" | "mapbox";
          map_geocoding_provider: "nominatim" | "mapbox" | "vietmap" | "goong";
          map_routing_provider: "osrm" | "mapbox" | "vietmap" | "goong";
          map_default_zoom: number;
          map_display_style: "LIGHT" | "DARK";
          show_store_marker_on_ordering: boolean;
          show_customer_distance: boolean;
          delivery_area_mode: "RADIUS" | "CUSTOM";
          delivery_area_name: string | null;
          delivery_area_note: string | null;
          delivery_area_polygon: Json;
          delivery_area_ward_count: number;
          delivery_exclusion_zones: Json;
          delivery_fee_enabled: boolean;
          delivery_fee_tiers: Json;
          service_fee_enabled: boolean;
          service_fee_type: "ORDER_PERCENT";
          service_fee_percent: number;
          service_fee_min: number;
          service_fee_max: number | null;
          allow_outside_delivery_area: boolean;
          show_delivery_eta: boolean;
          require_outside_area_confirmation: boolean;
          auto_suggest_nearest_branch: boolean;
          notify_new_order: boolean;
          notify_payment_waiting: boolean;
          receipt_footer: string | null;
          receipt_show_qr: boolean;
          show_promotions_on_menu: boolean;
          reservations_enabled: boolean;
          reservation_deposit_enabled: boolean;
          reservation_deposit_type: "FIXED" | "PER_PERSON";
          reservation_deposit_value: number;
          reservation_hold_minutes: number;
          reservation_duration_minutes: number;
          reservation_buffer_minutes: number;
          reservation_min_notice_minutes: number;
          reservation_max_days_ahead: number;
          reservation_arrival_grace_minutes: number;
          platform_status: "active" | "suspended" | "deleted";
          suspended_at: string | null;
          suspended_reason: string | null;
          deleted_at: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          name: string;
          slug: string;
          owner_user_id?: string | null;
          staff_code?: string;
          staff_code_generated_at?: string | null;
          business_type?: "CAFE" | "RESTAURANT" | "FAST_FOOD" | "BAR" | "OTHER" | null;
          timezone?: string;
          table_count?: number | null;
          bank_code?: string | null;
          bank_account?: string | null;
          bank_account_name?: string | null;
          contact_email?: string | null;
          hotline?: string | null;
          address?: string | null;
          description?: string | null;
          logo_url?: string | null;
          opening_time?: string | null;
          closing_time?: string | null;
          brand_primary?: string | null;
          brand_accent?: string | null;
          allow_legacy_qr?: boolean;
          online_ordering_enabled?: boolean;
          pickup_enabled?: boolean;
          delivery_enabled?: boolean;
          store_lat?: number | null;
          store_lng?: number | null;
          store_geog?: never;
          delivery_radius_km?: number;
          free_delivery_radius_km?: number;
          delivery_base_fee?: number;
          delivery_fee_per_km?: number;
          min_order_for_delivery?: number;
          pickup_eta_minutes?: number;
          delivery_eta_minutes?: number;
          online_payment_mode?: "PAY_AFTER" | "QR_PREPAID";
          delivery_tracking_enabled?: boolean;
          map_provider?: "maplibre" | "mapbox";
          map_geocoding_provider?: "nominatim" | "mapbox" | "vietmap" | "goong";
          map_routing_provider?: "osrm" | "mapbox" | "vietmap" | "goong";
          map_default_zoom?: number;
          map_display_style?: "LIGHT" | "DARK";
          show_store_marker_on_ordering?: boolean;
          show_customer_distance?: boolean;
          delivery_area_mode?: "RADIUS" | "CUSTOM";
          delivery_area_name?: string | null;
          delivery_area_note?: string | null;
          delivery_area_polygon?: Json;
          delivery_area_ward_count?: number;
          delivery_exclusion_zones?: Json;
          delivery_fee_enabled?: boolean;
          delivery_fee_tiers?: Json;
          service_fee_enabled?: boolean;
          service_fee_type?: "ORDER_PERCENT";
          service_fee_percent?: number;
          service_fee_min?: number;
          service_fee_max?: number | null;
          allow_outside_delivery_area?: boolean;
          show_delivery_eta?: boolean;
          require_outside_area_confirmation?: boolean;
          auto_suggest_nearest_branch?: boolean;
          notify_new_order?: boolean;
          notify_payment_waiting?: boolean;
          receipt_footer?: string | null;
          receipt_show_qr?: boolean;
          show_promotions_on_menu?: boolean;
          reservations_enabled?: boolean;
          reservation_deposit_enabled?: boolean;
          reservation_deposit_type?: "FIXED" | "PER_PERSON";
          reservation_deposit_value?: number;
          reservation_hold_minutes?: number;
          reservation_duration_minutes?: number;
          reservation_buffer_minutes?: number;
          reservation_min_notice_minutes?: number;
          reservation_max_days_ahead?: number;
          reservation_arrival_grace_minutes?: number;
          platform_status?: "active" | "suspended" | "deleted";
          suspended_at?: string | null;
          suspended_reason?: string | null;
          deleted_at?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          name?: string;
          slug?: string;
          owner_user_id?: string | null;
          staff_code?: string;
          staff_code_generated_at?: string | null;
          business_type?: "CAFE" | "RESTAURANT" | "FAST_FOOD" | "BAR" | "OTHER" | null;
          timezone?: string;
          table_count?: number | null;
          bank_code?: string | null;
          bank_account?: string | null;
          bank_account_name?: string | null;
          contact_email?: string | null;
          hotline?: string | null;
          address?: string | null;
          description?: string | null;
          logo_url?: string | null;
          opening_time?: string | null;
          closing_time?: string | null;
          brand_primary?: string | null;
          brand_accent?: string | null;
          allow_legacy_qr?: boolean;
          online_ordering_enabled?: boolean;
          pickup_enabled?: boolean;
          delivery_enabled?: boolean;
          store_lat?: number | null;
          store_lng?: number | null;
          store_geog?: never;
          delivery_radius_km?: number;
          free_delivery_radius_km?: number;
          delivery_base_fee?: number;
          delivery_fee_per_km?: number;
          min_order_for_delivery?: number;
          pickup_eta_minutes?: number;
          delivery_eta_minutes?: number;
          online_payment_mode?: "PAY_AFTER" | "QR_PREPAID";
          delivery_tracking_enabled?: boolean;
          map_provider?: "maplibre" | "mapbox";
          map_geocoding_provider?: "nominatim" | "mapbox" | "vietmap" | "goong";
          map_routing_provider?: "osrm" | "mapbox" | "vietmap" | "goong";
          map_default_zoom?: number;
          map_display_style?: "LIGHT" | "DARK";
          show_store_marker_on_ordering?: boolean;
          show_customer_distance?: boolean;
          delivery_area_mode?: "RADIUS" | "CUSTOM";
          delivery_area_name?: string | null;
          delivery_area_note?: string | null;
          delivery_area_polygon?: Json;
          delivery_area_ward_count?: number;
          delivery_exclusion_zones?: Json;
          delivery_fee_enabled?: boolean;
          delivery_fee_tiers?: Json;
          service_fee_enabled?: boolean;
          service_fee_type?: "ORDER_PERCENT";
          service_fee_percent?: number;
          service_fee_min?: number;
          service_fee_max?: number | null;
          allow_outside_delivery_area?: boolean;
          show_delivery_eta?: boolean;
          require_outside_area_confirmation?: boolean;
          auto_suggest_nearest_branch?: boolean;
          notify_new_order?: boolean;
          notify_payment_waiting?: boolean;
          receipt_footer?: string | null;
          receipt_show_qr?: boolean;
          show_promotions_on_menu?: boolean;
          reservations_enabled?: boolean;
          reservation_deposit_enabled?: boolean;
          reservation_deposit_type?: "FIXED" | "PER_PERSON";
          reservation_deposit_value?: number;
          reservation_hold_minutes?: number;
          reservation_duration_minutes?: number;
          reservation_buffer_minutes?: number;
          reservation_min_notice_minutes?: number;
          reservation_max_days_ahead?: number;
          reservation_arrival_grace_minutes?: number;
          platform_status?: "active" | "suspended" | "deleted";
          suspended_at?: string | null;
          suspended_reason?: string | null;
          deleted_at?: string | null;
          created_at?: string;
        };
        Relationships: [];
      };
      users: {
        Row: {
          id: string;
          email: string;
          role: "ADMIN" | "STAFF";
          restaurant_id: string;
          staff_title: string;
          permission_profile: "manager" | "cashier" | "kitchen" | "service" | "delivery" | "viewer";
          permissions: Json;
          account_status: "active" | "blocked";
          blocked_at: string | null;
          blocked_reason: string | null;
        };
        Insert: {
          id: string;
          email: string;
          role?: "ADMIN" | "STAFF";
          restaurant_id: string;
          staff_title?: string;
          permission_profile?: "manager" | "cashier" | "kitchen" | "service" | "delivery" | "viewer";
          permissions?: Json;
          account_status?: "active" | "blocked";
          blocked_at?: string | null;
          blocked_reason?: string | null;
        };
        Update: {
          email?: string;
          role?: "ADMIN" | "STAFF";
          restaurant_id?: string;
          staff_title?: string;
          permission_profile?: "manager" | "cashier" | "kitchen" | "service" | "delivery" | "viewer";
          permissions?: Json;
          account_status?: "active" | "blocked";
          blocked_at?: string | null;
          blocked_reason?: string | null;
        };
        Relationships: [];
      };
      table_areas: {
        Row: {
          id: string;
          restaurant_id: string;
          branch_id: string | null;
          name: string;
          floor_label: string;
          seating_zone: "indoor" | "outdoor" | "mixed";
          sort_order: number;
          is_active: boolean;
          metadata: Json;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          restaurant_id: string;
          branch_id?: string | null;
          name: string;
          floor_label?: string;
          seating_zone?: "indoor" | "outdoor" | "mixed";
          sort_order?: number;
          is_active?: boolean;
          metadata?: Json;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          restaurant_id?: string;
          branch_id?: string | null;
          name?: string;
          floor_label?: string;
          seating_zone?: "indoor" | "outdoor" | "mixed";
          sort_order?: number;
          is_active?: boolean;
          metadata?: Json;
          updated_at?: string;
        };
        Relationships: [];
      };
      tables: {
        Row: {
          id: string;
          restaurant_id: string;
          branch_id: string | null;
          name: string;
          area: string;
          capacity: number;
          qr_enabled: boolean;
          table_area_id: string | null;
          floor_label: string;
          seating_zone: "indoor" | "outdoor" | "mixed";
          table_kind: "standard" | "vip" | "bar" | "community";
          reservation_priority: number;
          is_bookable: boolean;
          is_hidden: boolean;
          is_under_maintenance: boolean;
          metadata: Json;
          qr_token_version: number;
          qr_token_enforced: boolean;
          qr_token_rotated_at: string | null;
        };
        Insert: {
          id?: string;
          restaurant_id: string;
          branch_id?: string | null;
          name: string;
          area?: string;
          capacity?: number;
          qr_enabled?: boolean;
          table_area_id?: string | null;
          floor_label?: string;
          seating_zone?: "indoor" | "outdoor" | "mixed";
          table_kind?: "standard" | "vip" | "bar" | "community";
          reservation_priority?: number;
          is_bookable?: boolean;
          is_hidden?: boolean;
          is_under_maintenance?: boolean;
          metadata?: Json;
          qr_token_version?: number;
          qr_token_enforced?: boolean;
          qr_token_rotated_at?: string | null;
        };
        Update: {
          restaurant_id?: string;
          branch_id?: string | null;
          name?: string;
          area?: string;
          capacity?: number;
          qr_enabled?: boolean;
          table_area_id?: string | null;
          floor_label?: string;
          seating_zone?: "indoor" | "outdoor" | "mixed";
          table_kind?: "standard" | "vip" | "bar" | "community";
          reservation_priority?: number;
          is_bookable?: boolean;
          is_hidden?: boolean;
          is_under_maintenance?: boolean;
          metadata?: Json;
          qr_token_version?: number;
          qr_token_enforced?: boolean;
          qr_token_rotated_at?: string | null;
        };
        Relationships: [];
      };
      store_branches: {
        Row: {
          id: string;
          restaurant_id: string;
          name: string;
          address: string;
          latitude: number | null;
          longitude: number | null;
          location_geog: unknown | null;
          is_primary: boolean;
          is_active: boolean;
          delivery_radius_km: number;
          free_delivery_radius_km: number;
          delivery_base_fee: number;
          delivery_fee_per_km: number;
          pickup_eta_minutes: number;
          delivery_eta_minutes: number;
          accepting_delivery: boolean;
          delivery_paused: boolean;
          temporarily_closed: boolean;
          delivery_opening_time: string | null;
          delivery_closing_time: string | null;
          delivery_availability_note: string | null;
          metadata: Json;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          restaurant_id: string;
          name: string;
          address: string;
          latitude?: number | null;
          longitude?: number | null;
          location_geog?: never;
          is_primary?: boolean;
          is_active?: boolean;
          delivery_radius_km?: number;
          free_delivery_radius_km?: number;
          delivery_base_fee?: number;
          delivery_fee_per_km?: number;
          pickup_eta_minutes?: number;
          delivery_eta_minutes?: number;
          accepting_delivery?: boolean;
          delivery_paused?: boolean;
          temporarily_closed?: boolean;
          delivery_opening_time?: string | null;
          delivery_closing_time?: string | null;
          delivery_availability_note?: string | null;
          metadata?: Json;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          restaurant_id?: string;
          name?: string;
          address?: string;
          latitude?: number | null;
          longitude?: number | null;
          location_geog?: never;
          is_primary?: boolean;
          is_active?: boolean;
          delivery_radius_km?: number;
          free_delivery_radius_km?: number;
          delivery_base_fee?: number;
          delivery_fee_per_km?: number;
          pickup_eta_minutes?: number;
          delivery_eta_minutes?: number;
          accepting_delivery?: boolean;
          delivery_paused?: boolean;
          temporarily_closed?: boolean;
          delivery_opening_time?: string | null;
          delivery_closing_time?: string | null;
          delivery_availability_note?: string | null;
          metadata?: Json;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      table_bills: {
        Row: {
          id: string;
          restaurant_id: string;
          table_id: string;
          status: "open" | "waiting_payment" | "waiting_confirm" | "paid" | "cancelled";
          total: number;
          payment_method: "QR" | "CASH" | null;
          customer_session_id: string | null;
          reservation_id: string | null;
          deposit_applied_amount: number;
          created_at: string;
          updated_at: string | null;
          paid_at: string | null;
          closed_at: string | null;
          state_version: number;
        };
        Insert: {
          id?: string;
          restaurant_id: string;
          table_id: string;
          status?: "open" | "waiting_payment" | "waiting_confirm" | "paid" | "cancelled";
          total?: number;
          payment_method?: "QR" | "CASH" | null;
          customer_session_id?: string | null;
          reservation_id?: string | null;
          deposit_applied_amount?: number;
          created_at?: string;
          updated_at?: string | null;
          paid_at?: string | null;
          closed_at?: string | null;
          state_version?: number;
        };
        Update: {
          status?: "open" | "waiting_payment" | "waiting_confirm" | "paid" | "cancelled";
          total?: number;
          payment_method?: "QR" | "CASH" | null;
          customer_session_id?: string | null;
          reservation_id?: string | null;
          deposit_applied_amount?: number;
          updated_at?: string | null;
          paid_at?: string | null;
          closed_at?: string | null;
          state_version?: number;
        };
        Relationships: [];
      };
      menu_categories: {
        Row: { id: string; restaurant_id: string; name: string };
        Insert: { id?: string; restaurant_id: string; name: string };
        Update: { restaurant_id?: string; name?: string };
        Relationships: [];
      };
      menu_items: {
        Row: {
          id: string;
          restaurant_id: string;
          category_id: string;
          name: string;
          price: number;
          image_url: string | null;
          is_available: boolean;
        };
        Insert: {
          id?: string;
          restaurant_id: string;
          category_id: string;
          name: string;
          price: number;
          image_url?: string | null;
          is_available?: boolean;
        };
        Update: {
          restaurant_id?: string;
          category_id?: string;
          name?: string;
          price?: number;
          image_url?: string | null;
          is_available?: boolean;
        };
        Relationships: [];
      };
      menu_modifier_groups: {
        Row: {
          id: string;
          restaurant_id: string;
          menu_item_id: string;
          name: string;
          kind: "SIZE" | "TOPPING" | "ICE" | "SUGAR" | "ADDON" | "COMBO" | "CHOICE" | "NOTE_PRESET" | "CUSTOM";
          selection_type: "SINGLE" | "MULTIPLE" | "QUANTITY";
          allow_quantity: boolean;
          is_required: boolean;
          min_select: number;
          max_select: number | null;
          sort_order: number;
          is_active: boolean;
          created_at: string;
          updated_at: string | null;
        };
        Insert: {
          id?: string;
          restaurant_id: string;
          menu_item_id: string;
          name: string;
          kind?: "SIZE" | "TOPPING" | "ICE" | "SUGAR" | "ADDON" | "COMBO" | "CHOICE" | "NOTE_PRESET" | "CUSTOM";
          selection_type?: "SINGLE" | "MULTIPLE" | "QUANTITY";
          allow_quantity?: boolean;
          is_required?: boolean;
          min_select?: number;
          max_select?: number | null;
          sort_order?: number;
          is_active?: boolean;
          created_at?: string;
          updated_at?: string | null;
        };
        Update: {
          restaurant_id?: string;
          menu_item_id?: string;
          name?: string;
          kind?: "SIZE" | "TOPPING" | "ICE" | "SUGAR" | "ADDON" | "COMBO" | "CHOICE" | "NOTE_PRESET" | "CUSTOM";
          selection_type?: "SINGLE" | "MULTIPLE" | "QUANTITY";
          allow_quantity?: boolean;
          is_required?: boolean;
          min_select?: number;
          max_select?: number | null;
          sort_order?: number;
          is_active?: boolean;
          updated_at?: string | null;
        };
        Relationships: [];
      };
      menu_modifier_options: {
        Row: {
          id: string;
          restaurant_id: string;
          group_id: string;
          name: string;
          price_delta: number;
          pricing_mode: "DELTA" | "ABSOLUTE";
          price_value: number | null;
          is_default: boolean;
          is_available: boolean;
          sort_order: number;
          created_at: string;
          updated_at: string | null;
        };
        Insert: {
          id?: string;
          restaurant_id: string;
          group_id: string;
          name: string;
          price_delta?: number;
          pricing_mode?: "DELTA" | "ABSOLUTE";
          price_value?: number | null;
          is_default?: boolean;
          is_available?: boolean;
          sort_order?: number;
          created_at?: string;
          updated_at?: string | null;
        };
        Update: {
          restaurant_id?: string;
          group_id?: string;
          name?: string;
          price_delta?: number;
          pricing_mode?: "DELTA" | "ABSOLUTE";
          price_value?: number | null;
          is_default?: boolean;
          is_available?: boolean;
          sort_order?: number;
          updated_at?: string | null;
        };
        Relationships: [];
      };
      orders: {
        Row: {
          id: string;
          restaurant_id: string;
          table_id: string | null;
          bill_id: string | null;
          branch_id: string | null;
          branch_assignment_source: "delivery_quote" | "single_branch" | "primary_branch" | "manual" | "legacy_backfill" | null;
          fulfillment_type: "DINE_IN" | "PICKUP" | "DELIVERY";
          status: "pending" | "ordering" | "waiting_payment" | "waiting_confirm" | "paid" | "completed" | "cancelled";
          subtotal: number;
          discount_amount: number;
          promotion_id: string | null;
          promotion_code: string | null;
          promotion_customer_key_hash: string | null;
          total: number;
          payment_method: "QR" | "CASH" | null;
          payment_status: "unpaid" | "waiting_payment" | "waiting_confirm" | "paid" | "failed" | "refunded";
          paid_at: string | null;
          customer_session_id: string | null;
          customer_note: string | null;
          customer_name: string | null;
          customer_phone: string | null;
          delivery_address: string | null;
          delivery_lat: number | null;
          delivery_lng: number | null;
          delivery_distance_km: number | null;
          delivery_fee: number;
          service_fee: number;
          delivery_status: "none" | "requested" | "accepted" | "out_for_delivery" | "delivered" | "rejected";
          delivery_route_geometry: Json | null;
          delivery_route_duration_minutes: number | null;
          delivery_route_provider: "goong" | "vietmap" | "osrm" | "mapbox" | "haversine" | null;
          delivery_route_confidence: "high" | "medium" | "low" | null;
          delivery_quote_version: string | null;
          delivery_quote_snapshot: Json | null;
          delivery_tracking_updated_at: string | null;
          delivery_courier_id: string | null;
          delivery_assigned_at: string | null;
          idempotency_key: string | null;
          request_fingerprint: string | null;
          state_version: number;
          created_at: string;
          updated_at: string | null;
          accepted_at: string | null;
          served_at: string | null;
          service_due_at: string | null;
        };
        Insert: {
          id?: string;
          restaurant_id: string;
          table_id?: string | null;
          bill_id?: string | null;
          branch_id?: string | null;
          branch_assignment_source?: "delivery_quote" | "single_branch" | "primary_branch" | "manual" | "legacy_backfill" | null;
          fulfillment_type?: "DINE_IN" | "PICKUP" | "DELIVERY";
          status?: "pending" | "ordering" | "waiting_payment" | "waiting_confirm" | "paid" | "completed" | "cancelled";
          subtotal: number;
          discount_amount?: number;
          promotion_id?: string | null;
          promotion_code?: string | null;
          promotion_customer_key_hash?: string | null;
          total: number;
          payment_method?: "QR" | "CASH" | null;
          payment_status?: "unpaid" | "waiting_payment" | "waiting_confirm" | "paid" | "failed" | "refunded";
          paid_at?: string | null;
          customer_session_id?: string | null;
          customer_note?: string | null;
          customer_name?: string | null;
          customer_phone?: string | null;
          delivery_address?: string | null;
          delivery_lat?: number | null;
          delivery_lng?: number | null;
          delivery_distance_km?: number | null;
          delivery_fee?: number;
          service_fee?: number;
          delivery_status?: "none" | "requested" | "accepted" | "out_for_delivery" | "delivered" | "rejected";
          delivery_route_geometry?: Json | null;
          delivery_route_duration_minutes?: number | null;
          delivery_route_provider?: "goong" | "vietmap" | "osrm" | "mapbox" | "haversine" | null;
          delivery_route_confidence?: "high" | "medium" | "low" | null;
          delivery_quote_version?: string | null;
          delivery_quote_snapshot?: Json | null;
          delivery_tracking_updated_at?: string | null;
          delivery_courier_id?: string | null;
          delivery_assigned_at?: string | null;
          idempotency_key?: string | null;
          request_fingerprint?: string | null;
          state_version?: number;
          created_at?: string;
          updated_at?: string | null;
          accepted_at?: string | null;
          served_at?: string | null;
          service_due_at?: string | null;
        };
        Update: {
          status?: "pending" | "ordering" | "waiting_payment" | "waiting_confirm" | "paid" | "completed" | "cancelled";
          table_id?: string | null;
          bill_id?: string | null;
          branch_id?: string | null;
          branch_assignment_source?: "delivery_quote" | "single_branch" | "primary_branch" | "manual" | "legacy_backfill" | null;
          fulfillment_type?: "DINE_IN" | "PICKUP" | "DELIVERY";
          subtotal?: number;
          discount_amount?: number;
          promotion_id?: string | null;
          promotion_code?: string | null;
          promotion_customer_key_hash?: string | null;
          total?: number;
          payment_method?: "QR" | "CASH" | null;
          payment_status?: "unpaid" | "waiting_payment" | "waiting_confirm" | "paid" | "failed" | "refunded";
          paid_at?: string | null;
          customer_session_id?: string | null;
          customer_note?: string | null;
          customer_name?: string | null;
          customer_phone?: string | null;
          delivery_address?: string | null;
          delivery_lat?: number | null;
          delivery_lng?: number | null;
          delivery_distance_km?: number | null;
          delivery_fee?: number;
          service_fee?: number;
          delivery_status?: "none" | "requested" | "accepted" | "out_for_delivery" | "delivered" | "rejected";
          delivery_route_geometry?: Json | null;
          delivery_route_duration_minutes?: number | null;
          delivery_route_provider?: "goong" | "vietmap" | "osrm" | "mapbox" | "haversine" | null;
          delivery_route_confidence?: "high" | "medium" | "low" | null;
          delivery_quote_version?: string | null;
          delivery_quote_snapshot?: Json | null;
          delivery_tracking_updated_at?: string | null;
          delivery_courier_id?: string | null;
          delivery_assigned_at?: string | null;
          idempotency_key?: string | null;
          request_fingerprint?: string | null;
          state_version?: number;
          updated_at?: string | null;
          accepted_at?: string | null;
          served_at?: string | null;
          service_due_at?: string | null;
        };
        Relationships: [];
      };
      order_items: {
        Row: {
          id: string;
          order_id: string;
          menu_item_id: string;
          quantity: number;
          price: number;
          base_price: number;
          modifier_total: number;
          modifier_snapshot: Json;
          note: string | null;
          prepared_at: string | null;
        };
        Insert: {
          id?: string;
          order_id: string;
          menu_item_id: string;
          quantity: number;
          price: number;
          base_price?: number;
          modifier_total?: number;
          modifier_snapshot?: Json;
          note?: string | null;
          prepared_at?: string | null;
        };
        Update: {
          quantity?: number;
          price?: number;
          base_price?: number;
          modifier_total?: number;
          modifier_snapshot?: Json;
          note?: string | null;
          prepared_at?: string | null;
        };
        Relationships: [];
      };
      map_provider_request_logs: {
        Row: {
          id: string;
          restaurant_id: string | null;
          restaurant_slug: string | null;
          source: string | null;
          operation: "geocode" | "reverse" | "route";
          provider: "goong" | "vietmap" | "mapbox" | "nominatim" | "osrm";
          outcome: "success" | "http_error" | "timeout" | "error" | "empty";
          status_code: number | null;
          latency_ms: number;
          estimated_cost_vnd: number;
          created_at: string;
        };
        Insert: {
          id?: string;
          restaurant_id?: string | null;
          restaurant_slug?: string | null;
          source?: string | null;
          operation: "geocode" | "reverse" | "route";
          provider: "goong" | "vietmap" | "mapbox" | "nominatim" | "osrm";
          outcome: "success" | "http_error" | "timeout" | "error" | "empty";
          status_code?: number | null;
          latency_ms?: number;
          estimated_cost_vnd?: number;
          created_at?: string;
        };
        Update: {
          restaurant_id?: string | null;
          restaurant_slug?: string | null;
          source?: string | null;
          operation?: "geocode" | "reverse" | "route";
          provider?: "goong" | "vietmap" | "mapbox" | "nominatim" | "osrm";
          outcome?: "success" | "http_error" | "timeout" | "error" | "empty";
          status_code?: number | null;
          latency_ms?: number;
          estimated_cost_vnd?: number;
        };
        Relationships: [];
      };
      map_cache_event_logs: {
        Row: {
          id: string;
          restaurant_id: string | null;
          restaurant_slug: string | null;
          source: string | null;
          operation: "geocode" | "reverse" | "route" | "delivery_quote";
          namespace: string;
          hit: boolean;
          created_at: string;
        };
        Insert: {
          id?: string;
          restaurant_id?: string | null;
          restaurant_slug?: string | null;
          source?: string | null;
          operation: "geocode" | "reverse" | "route" | "delivery_quote";
          namespace: string;
          hit: boolean;
          created_at?: string;
        };
        Update: {
          restaurant_id?: string | null;
          restaurant_slug?: string | null;
          source?: string | null;
          operation?: "geocode" | "reverse" | "route" | "delivery_quote";
          namespace?: string;
          hit?: boolean;
        };
        Relationships: [];
      };
      delivery_quote_metric_logs: {
        Row: {
          id: string;
          restaurant_id: string | null;
          restaurant_slug: string;
          accepted: boolean;
          provider: "goong" | "vietmap" | "mapbox" | "nominatim" | "osrm" | "manual" | "browser-location+haversine";
          route_provider: "goong" | "vietmap" | "mapbox" | "osrm" | "haversine" | null;
          confidence: "high" | "medium" | "low" | null;
          is_estimated: boolean | null;
          distance_km: number | null;
          fee: number | null;
          latency_ms: number;
          created_at: string;
        };
        Insert: {
          id?: string;
          restaurant_id?: string | null;
          restaurant_slug: string;
          accepted: boolean;
          provider: "goong" | "vietmap" | "mapbox" | "nominatim" | "osrm" | "manual" | "browser-location+haversine";
          route_provider?: "goong" | "vietmap" | "mapbox" | "osrm" | "haversine" | null;
          confidence?: "high" | "medium" | "low" | null;
          is_estimated?: boolean | null;
          distance_km?: number | null;
          fee?: number | null;
          latency_ms?: number;
          created_at?: string;
        };
        Update: {
          restaurant_id?: string | null;
          restaurant_slug?: string;
          accepted?: boolean;
          provider?: "goong" | "vietmap" | "mapbox" | "nominatim" | "osrm" | "manual" | "browser-location+haversine";
          route_provider?: "goong" | "vietmap" | "mapbox" | "osrm" | "haversine" | null;
          confidence?: "high" | "medium" | "low" | null;
          is_estimated?: boolean | null;
          distance_km?: number | null;
          fee?: number | null;
          latency_ms?: number;
        };
        Relationships: [];
      };
      delivery_couriers: {
        Row: {
          id: string;
          restaurant_id: string;
          name: string;
          phone: string | null;
          status: "offline" | "available" | "assigned" | "busy" | "paused";
          metadata: Json;
          last_location_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          restaurant_id: string;
          name: string;
          phone?: string | null;
          status?: "offline" | "available" | "assigned" | "busy" | "paused";
          metadata?: Json;
          last_location_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          restaurant_id?: string;
          name?: string;
          phone?: string | null;
          status?: "offline" | "available" | "assigned" | "busy" | "paused";
          metadata?: Json;
          last_location_at?: string | null;
          updated_at?: string;
        };
        Relationships: [];
      };
      courier_locations: {
        Row: {
          id: string;
          restaurant_id: string;
          courier_id: string | null;
          order_id: string | null;
          latitude: number;
          longitude: number;
          location_geog: unknown;
          accuracy_meters: number | null;
          heading_degrees: number | null;
          speed_mps: number | null;
          source: "admin_dashboard" | "driver_app" | "manual" | "system";
          captured_at: string;
          created_at: string;
          metadata: Json;
        };
        Insert: {
          id?: string;
          restaurant_id: string;
          courier_id?: string | null;
          order_id?: string | null;
          latitude: number;
          longitude: number;
          location_geog?: never;
          accuracy_meters?: number | null;
          heading_degrees?: number | null;
          speed_mps?: number | null;
          source?: "admin_dashboard" | "driver_app" | "manual" | "system";
          captured_at?: string;
          created_at?: string;
          metadata?: Json;
        };
        Update: {
          restaurant_id?: string;
          courier_id?: string | null;
          order_id?: string | null;
          latitude?: number;
          longitude?: number;
          location_geog?: never;
          accuracy_meters?: number | null;
          heading_degrees?: number | null;
          speed_mps?: number | null;
          source?: "admin_dashboard" | "driver_app" | "manual" | "system";
          captured_at?: string;
          metadata?: Json;
        };
        Relationships: [];
      };
      delivery_tracking_events: {
        Row: {
          id: string;
          restaurant_id: string;
          order_id: string;
          courier_id: string | null;
          event_type: "status_changed" | "location_ping" | "assigned" | "unassigned" | "eta_adjusted" | "handoff_note";
          delivery_status: "requested" | "accepted" | "out_for_delivery" | "delivered" | "rejected" | null;
          latitude: number | null;
          longitude: number | null;
          location_geog: unknown | null;
          accuracy_meters: number | null;
          heading_degrees: number | null;
          speed_mps: number | null;
          source: "admin_dashboard" | "driver_app" | "manual" | "system";
          note: string | null;
          metadata: Json;
          created_by: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          restaurant_id: string;
          order_id: string;
          courier_id?: string | null;
          event_type: "status_changed" | "location_ping" | "assigned" | "unassigned" | "eta_adjusted" | "handoff_note";
          delivery_status?: "requested" | "accepted" | "out_for_delivery" | "delivered" | "rejected" | null;
          latitude?: number | null;
          longitude?: number | null;
          location_geog?: never;
          accuracy_meters?: number | null;
          heading_degrees?: number | null;
          speed_mps?: number | null;
          source?: "admin_dashboard" | "driver_app" | "manual" | "system";
          note?: string | null;
          metadata?: Json;
          created_by?: string | null;
          created_at?: string;
        };
        Update: {
          restaurant_id?: string;
          order_id?: string;
          courier_id?: string | null;
          event_type?: "status_changed" | "location_ping" | "assigned" | "unassigned" | "eta_adjusted" | "handoff_note";
          delivery_status?: "requested" | "accepted" | "out_for_delivery" | "delivered" | "rejected" | null;
          latitude?: number | null;
          longitude?: number | null;
          location_geog?: never;
          accuracy_meters?: number | null;
          heading_degrees?: number | null;
          speed_mps?: number | null;
          source?: "admin_dashboard" | "driver_app" | "manual" | "system";
          note?: string | null;
          metadata?: Json;
          created_by?: string | null;
        };
        Relationships: [];
      };
      payment_logs: {
        Row: {
          id: string;
          restaurant_id: string;
          order_id: string;
          bill_id: string | null;
          method: "QR" | "CASH";
          status: "pending" | "waiting_confirm" | "confirmed" | "failed" | "cancelled" | "refunded";
          amount: number;
          transition_key: string | null;
          request_fingerprint: string | null;
          raw_data: Json | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          restaurant_id: string;
          order_id: string;
          bill_id?: string | null;
          method: "QR" | "CASH";
          status?: "pending" | "waiting_confirm" | "confirmed" | "failed" | "cancelled" | "refunded";
          amount: number;
          transition_key?: string | null;
          request_fingerprint?: string | null;
          raw_data?: Json | null;
          created_at?: string;
        };
        Update: {
          restaurant_id?: string;
          order_id?: string;
          method?: "QR" | "CASH";
          bill_id?: string | null;
          status?: "pending" | "waiting_confirm" | "confirmed" | "failed" | "cancelled" | "refunded";
          amount?: number;
          transition_key?: string | null;
          request_fingerprint?: string | null;
          raw_data?: Json | null;
        };
        Relationships: [];
      };
      financial_transaction_requests: {
        Row: {
          id: string;
          restaurant_id: string;
          operation: "create_online_order" | "checkout_bill" | "transition_payment";
          idempotency_key: string;
          request_fingerprint: string;
          response_payload: Json | null;
          created_at: string;
          completed_at: string | null;
        };
        Insert: {
          id?: string;
          restaurant_id: string;
          operation: "create_online_order" | "checkout_bill" | "transition_payment";
          idempotency_key: string;
          request_fingerprint: string;
          response_payload?: Json | null;
          created_at?: string;
          completed_at?: string | null;
        };
        Update: {
          restaurant_id?: string;
          operation?: "create_online_order" | "checkout_bill" | "transition_payment";
          idempotency_key?: string;
          request_fingerprint?: string;
          response_payload?: Json | null;
          created_at?: string;
          completed_at?: string | null;
        };
        Relationships: [];
      };
      promotions: {
        Row: {
          id: string;
          restaurant_id: string;
          name: string;
          code: string;
          discount_scope: "ORDER" | "DELIVERY_FEE";
          discount_type: "PERCENT" | "FIXED";
          discount_value: number;
          min_order_amount: number;
          reward_type: "DISCOUNT" | "FREE_ITEM";
          free_item_menu_item_id: string | null;
          free_item_quantity: number;
          starts_at: string | null;
          ends_at: string | null;
          channels: string[];
          show_on_customer_menu: boolean;
          total_usage_limit: number | null;
          per_customer_usage_limit: number | null;
          is_active: boolean;
          created_at: string;
        };
        Insert: {
          id?: string;
          restaurant_id: string;
          name: string;
          code: string;
          discount_scope?: "ORDER" | "DELIVERY_FEE";
          discount_type?: "PERCENT" | "FIXED";
          discount_value: number;
          min_order_amount?: number;
          reward_type?: "DISCOUNT" | "FREE_ITEM";
          free_item_menu_item_id?: string | null;
          free_item_quantity?: number;
          starts_at?: string | null;
          ends_at?: string | null;
          channels?: string[];
          show_on_customer_menu?: boolean;
          total_usage_limit?: number | null;
          per_customer_usage_limit?: number | null;
          is_active?: boolean;
          created_at?: string;
        };
        Update: {
          name?: string;
          code?: string;
          discount_scope?: "ORDER" | "DELIVERY_FEE";
          discount_type?: "PERCENT" | "FIXED";
          discount_value?: number;
          min_order_amount?: number;
          reward_type?: "DISCOUNT" | "FREE_ITEM";
          free_item_menu_item_id?: string | null;
          free_item_quantity?: number;
          starts_at?: string | null;
          ends_at?: string | null;
          channels?: string[];
          show_on_customer_menu?: boolean;
          total_usage_limit?: number | null;
          per_customer_usage_limit?: number | null;
          is_active?: boolean;
        };
        Relationships: [];
      };
      service_requests: {
        Row: {
          id: string;
          restaurant_id: string;
          table_id: string | null;
          customer_session_id: string | null;
          type: "CALL_STAFF";
          status: "open" | "acknowledged" | "resolved" | "cancelled";
          message: string | null;
          created_at: string;
          acknowledged_at: string | null;
          resolved_at: string | null;
        };
        Insert: {
          id?: string;
          restaurant_id: string;
          table_id?: string | null;
          customer_session_id?: string | null;
          type?: "CALL_STAFF";
          status?: "open" | "acknowledged" | "resolved" | "cancelled";
          message?: string | null;
          created_at?: string;
          acknowledged_at?: string | null;
          resolved_at?: string | null;
        };
        Update: {
          table_id?: string | null;
          customer_session_id?: string | null;
          type?: "CALL_STAFF";
          status?: "open" | "acknowledged" | "resolved" | "cancelled";
          message?: string | null;
          acknowledged_at?: string | null;
          resolved_at?: string | null;
        };
        Relationships: [];
      };
      reservations: {
        Row: {
          id: string;
          restaurant_id: string;
          status:
            | "draft"
            | "pending"
            | "holding"
            | "waiting_deposit_confirm"
            | "confirmed"
            | "checked_in"
            | "seated"
            | "completed"
            | "cancelled"
            | "rejected"
            | "expired"
            | "no_show";
          customer_name: string;
          customer_phone: string;
          customer_email: string | null;
          party_size: number;
          starts_at: string;
          ends_at: string;
          hold_expires_at: string | null;
          deposit_required_amount: number;
          deposit_paid_amount: number;
          deposit_status: "none" | "required" | "waiting_payment" | "waiting_confirm" | "paid" | "refundable" | "forfeited" | "refunded";
          payment_method: "QR" | "CASH" | null;
          customer_note: string | null;
          internal_note: string | null;
          preferred_table_area_id: string | null;
          preferred_seating_zone: "indoor" | "outdoor" | "mixed" | null;
          preferred_table_kind: "standard" | "vip" | "bar" | "community" | null;
          source: string;
          access_token_hash: string;
          idempotency_key: string | null;
          seated_table_bill_id: string | null;
          created_at: string;
          updated_at: string | null;
          confirmed_at: string | null;
          checked_in_at: string | null;
          seated_at: string | null;
          completed_at: string | null;
          cancelled_at: string | null;
          rejected_at: string | null;
          expired_at: string | null;
          no_show_at: string | null;
        };
        Insert: {
          id?: string;
          restaurant_id: string;
          status?:
            | "draft"
            | "pending"
            | "holding"
            | "waiting_deposit_confirm"
            | "confirmed"
            | "checked_in"
            | "seated"
            | "completed"
            | "cancelled"
            | "rejected"
            | "expired"
            | "no_show";
          customer_name: string;
          customer_phone: string;
          customer_email?: string | null;
          party_size: number;
          starts_at: string;
          ends_at: string;
          hold_expires_at?: string | null;
          deposit_required_amount?: number;
          deposit_paid_amount?: number;
          deposit_status?: "none" | "required" | "waiting_payment" | "waiting_confirm" | "paid" | "refundable" | "forfeited" | "refunded";
          payment_method?: "QR" | "CASH" | null;
          customer_note?: string | null;
          internal_note?: string | null;
          preferred_table_area_id?: string | null;
          preferred_seating_zone?: "indoor" | "outdoor" | "mixed" | null;
          preferred_table_kind?: "standard" | "vip" | "bar" | "community" | null;
          source?: string;
          access_token_hash: string;
          idempotency_key?: string | null;
          seated_table_bill_id?: string | null;
          created_at?: string;
          updated_at?: string | null;
          confirmed_at?: string | null;
          checked_in_at?: string | null;
          seated_at?: string | null;
          completed_at?: string | null;
          cancelled_at?: string | null;
          rejected_at?: string | null;
          expired_at?: string | null;
          no_show_at?: string | null;
        };
        Update: {
          status?:
            | "draft"
            | "pending"
            | "holding"
            | "waiting_deposit_confirm"
            | "confirmed"
            | "checked_in"
            | "seated"
            | "completed"
            | "cancelled"
            | "rejected"
            | "expired"
            | "no_show";
          customer_name?: string;
          customer_phone?: string;
          customer_email?: string | null;
          party_size?: number;
          starts_at?: string;
          ends_at?: string;
          hold_expires_at?: string | null;
          deposit_required_amount?: number;
          deposit_paid_amount?: number;
          deposit_status?: "none" | "required" | "waiting_payment" | "waiting_confirm" | "paid" | "refundable" | "forfeited" | "refunded";
          payment_method?: "QR" | "CASH" | null;
          customer_note?: string | null;
          internal_note?: string | null;
          preferred_table_area_id?: string | null;
          preferred_seating_zone?: "indoor" | "outdoor" | "mixed" | null;
          preferred_table_kind?: "standard" | "vip" | "bar" | "community" | null;
          source?: string;
          access_token_hash?: string;
          idempotency_key?: string | null;
          seated_table_bill_id?: string | null;
          updated_at?: string | null;
          confirmed_at?: string | null;
          checked_in_at?: string | null;
          seated_at?: string | null;
          completed_at?: string | null;
          cancelled_at?: string | null;
          rejected_at?: string | null;
          expired_at?: string | null;
          no_show_at?: string | null;
        };
        Relationships: [];
      };
      reservation_table_locks: {
        Row: {
          id: string;
          reservation_id: string;
          restaurant_id: string;
          table_id: string;
          starts_at: string;
          ends_at: string;
          status: "active" | "released";
          created_at: string;
        };
        Insert: {
          id?: string;
          reservation_id: string;
          restaurant_id: string;
          table_id: string;
          starts_at: string;
          ends_at: string;
          status?: "active" | "released";
          created_at?: string;
        };
        Update: {
          reservation_id?: string;
          restaurant_id?: string;
          table_id?: string;
          starts_at?: string;
          ends_at?: string;
          status?: "active" | "released";
        };
        Relationships: [];
      };
      reservation_status_logs: {
        Row: {
          id: string;
          restaurant_id: string;
          reservation_id: string;
          from_status: string | null;
          to_status: string;
          actor_type: "customer" | "merchant" | "staff" | "system";
          actor_user_id: string | null;
          note: string | null;
          metadata: Json;
          created_at: string;
        };
        Insert: {
          id?: string;
          restaurant_id: string;
          reservation_id: string;
          from_status?: string | null;
          to_status: string;
          actor_type?: "customer" | "merchant" | "staff" | "system";
          actor_user_id?: string | null;
          note?: string | null;
          metadata?: Json;
          created_at?: string;
        };
        Update: {
          restaurant_id?: string;
          reservation_id?: string;
          from_status?: string | null;
          to_status?: string;
          actor_type?: "customer" | "merchant" | "staff" | "system";
          actor_user_id?: string | null;
          note?: string | null;
          metadata?: Json;
        };
        Relationships: [];
      };
      occupancy_logs: {
        Row: {
          id: string;
          restaurant_id: string;
          table_id: string | null;
          table_bill_id: string | null;
          reservation_id: string | null;
          event_type:
            | "reservation_created"
            | "reservation_cancelled"
            | "reservation_no_show"
            | "reservation_checked_in"
            | "reservation_seated"
            | "reservation_completed"
            | "table_released";
          party_size: number | null;
          metadata: Json;
          occurred_at: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          restaurant_id: string;
          table_id?: string | null;
          table_bill_id?: string | null;
          reservation_id?: string | null;
          event_type:
            | "reservation_created"
            | "reservation_cancelled"
            | "reservation_no_show"
            | "reservation_checked_in"
            | "reservation_seated"
            | "reservation_completed"
            | "table_released";
          party_size?: number | null;
          metadata?: Json;
          occurred_at?: string;
          created_at?: string;
        };
        Update: {
          restaurant_id?: string;
          table_id?: string | null;
          table_bill_id?: string | null;
          reservation_id?: string | null;
          event_type?:
            | "reservation_created"
            | "reservation_cancelled"
            | "reservation_no_show"
            | "reservation_checked_in"
            | "reservation_seated"
            | "reservation_completed"
            | "table_released";
          party_size?: number | null;
          metadata?: Json;
          occurred_at?: string;
        };
        Relationships: [];
      };
      reservation_deposit_logs: {
        Row: {
          id: string;
          reservation_id: string;
          restaurant_id: string;
          method: "QR" | "CASH";
          status: "pending" | "waiting_confirm" | "confirmed" | "failed" | "cancelled" | "refunded";
          amount: number;
          transition_key: string | null;
          raw_data: Json | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          reservation_id: string;
          restaurant_id: string;
          method?: "QR" | "CASH";
          status?: "pending" | "waiting_confirm" | "confirmed" | "failed" | "cancelled" | "refunded";
          amount: number;
          transition_key?: string | null;
          raw_data?: Json | null;
          created_at?: string;
        };
        Update: {
          method?: "QR" | "CASH";
          status?: "pending" | "waiting_confirm" | "confirmed" | "failed" | "cancelled" | "refunded";
          amount?: number;
          transition_key?: string | null;
          raw_data?: Json | null;
        };
        Relationships: [];
      };
      platform_settings: {
        Row: {
          key: string;
          value: Json;
          updated_at: string;
          updated_by: string | null;
        };
        Insert: {
          key: string;
          value?: Json;
          updated_at?: string;
          updated_by?: string | null;
        };
        Update: {
          value?: Json;
          updated_at?: string;
          updated_by?: string | null;
        };
        Relationships: [];
      };
      saas_plans: {
        Row: {
          id: string;
          code: string;
          name: string;
          description: string | null;
          monthly_price: number;
          trial_days: number;
          features: Json;
          is_active: boolean;
          sort_order: number;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          code: string;
          name: string;
          description?: string | null;
          monthly_price: number;
          trial_days?: number;
          features?: Json;
          is_active?: boolean;
          sort_order?: number;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          code?: string;
          name?: string;
          description?: string | null;
          monthly_price?: number;
          trial_days?: number;
          features?: Json;
          is_active?: boolean;
          sort_order?: number;
          updated_at?: string;
        };
        Relationships: [];
      };
      restaurant_subscriptions: {
        Row: {
          id: string;
          restaurant_id: string;
          plan_id: string;
          status: "trialing" | "pending_payment" | "active" | "past_due" | "suspended" | "cancelled" | "expired";
          trial_started_at: string;
          trial_ends_at: string | null;
          current_period_start: string | null;
          current_period_end: string | null;
          cancel_at_period_end: boolean;
          suspended_at: string | null;
          cancelled_at: string | null;
          metadata: Json;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          restaurant_id: string;
          plan_id: string;
          status?: "trialing" | "pending_payment" | "active" | "past_due" | "suspended" | "cancelled" | "expired";
          trial_started_at?: string;
          trial_ends_at?: string | null;
          current_period_start?: string | null;
          current_period_end?: string | null;
          cancel_at_period_end?: boolean;
          suspended_at?: string | null;
          cancelled_at?: string | null;
          metadata?: Json;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          plan_id?: string;
          status?: "trialing" | "pending_payment" | "active" | "past_due" | "suspended" | "cancelled" | "expired";
          trial_ends_at?: string | null;
          current_period_start?: string | null;
          current_period_end?: string | null;
          cancel_at_period_end?: boolean;
          suspended_at?: string | null;
          cancelled_at?: string | null;
          metadata?: Json;
          updated_at?: string;
        };
        Relationships: [];
      };
      subscription_payment_logs: {
        Row: {
          id: string;
          restaurant_id: string;
          subscription_id: string | null;
          plan_id: string | null;
          amount: number;
          months: number;
          method: string;
          status: "waiting_confirm" | "confirmed" | "rejected" | "expired";
          transfer_content: string;
          raw_data: Json;
          created_at: string;
          confirmed_at: string | null;
          confirmed_by: string | null;
          rejected_at: string | null;
          rejected_reason: string | null;
        };
        Insert: {
          id?: string;
          restaurant_id: string;
          subscription_id?: string | null;
          plan_id?: string | null;
          amount: number;
          months?: number;
          method?: string;
          status?: "waiting_confirm" | "confirmed" | "rejected" | "expired";
          transfer_content: string;
          raw_data?: Json;
          created_at?: string;
          confirmed_at?: string | null;
          confirmed_by?: string | null;
          rejected_at?: string | null;
          rejected_reason?: string | null;
        };
        Update: {
          status?: "waiting_confirm" | "confirmed" | "rejected" | "expired";
          raw_data?: Json;
          confirmed_at?: string | null;
          confirmed_by?: string | null;
          rejected_at?: string | null;
          rejected_reason?: string | null;
        };
        Relationships: [];
      };
      trial_claims: {
        Row: {
          id: string;
          restaurant_id: string | null;
          owner_email: string;
          owner_user_id: string | null;
          ip_hash: string | null;
          user_agent_hash: string | null;
          claimed_at: string;
        };
        Insert: {
          id?: string;
          restaurant_id?: string | null;
          owner_email: string;
          owner_user_id?: string | null;
          ip_hash?: string | null;
          user_agent_hash?: string | null;
          claimed_at?: string;
        };
        Update: {
          restaurant_id?: string | null;
          owner_email?: string;
          owner_user_id?: string | null;
          ip_hash?: string | null;
          user_agent_hash?: string | null;
        };
        Relationships: [];
      };
      registration_intents: {
        Row: {
          id: string;
          email: string;
          user_id: string | null;
          payload: Json;
          created_at: string;
          expires_at: string;
          consumed_at: string | null;
        };
        Insert: {
          id?: string;
          email: string;
          user_id?: string | null;
          payload: Json;
          created_at?: string;
          expires_at?: string;
          consumed_at?: string | null;
        };
        Update: {
          email?: string;
          user_id?: string | null;
          payload?: Json;
          expires_at?: string;
          consumed_at?: string | null;
        };
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: {
      get_admin_dashboard_snapshot: {
        Args: {
          target_restaurant_id: string;
          today_start: string;
        };
        Returns: Json;
      };
      find_nearest_delivery_stores: {
        Args: {
          p_restaurant_slug: string;
          p_lat: number;
          p_lng: number;
          p_limit?: number;
          p_max_radius_km?: number;
        };
        Returns: Array<{
          id: string;
          restaurant_id: string;
          name: string;
          address: string | null;
          latitude: number;
          longitude: number;
          is_primary: boolean;
          source: "primary" | "branch";
          delivery_radius_km: number;
          free_delivery_radius_km: number;
          delivery_base_fee: number;
          delivery_fee_per_km: number;
          pickup_eta_minutes: number;
          delivery_eta_minutes: number;
          metadata: Json;
          approx_distance_km: number;
        }>;
      };
      replace_menu_modifier_setup: {
        Args: {
          p_restaurant_id: string;
          p_source_item_id: string;
          p_target_item_ids: string[];
        };
        Returns: number;
      };
      create_online_order_atomic: {
        Args: {
          p_restaurant_id: string;
          p_idempotency_key: string;
          p_request_fingerprint: string;
          p_order: Json;
          p_items: Json;
          p_actor_user_id?: string | null;
        };
        Returns: Json;
      };
      checkout_bill_atomic: {
        Args: {
          p_restaurant_id: string;
          p_bill_id: string;
          p_expected_state_version: number;
          p_idempotency_key: string;
          p_request_fingerprint: string;
          p_payment_method: "QR" | "CASH";
          p_actor_user_id?: string | null;
        };
        Returns: Json;
      };
      cancel_order_atomic: {
        Args: {
          p_restaurant_id: string;
          p_order_id: string;
          p_actor_user_id?: string | null;
        };
        Returns: Json;
      };
      transition_payment_atomic: {
        Args: {
          p_restaurant_id: string;
          p_order_id: string;
          p_bill_id: string | null;
          p_expected_order_state_version: number;
          p_expected_bill_state_version: number | null;
          p_to_status: "waiting_payment" | "waiting_confirm" | "paid" | "failed" | "refunded";
          p_next_order_status: "pending" | "ordering" | "waiting_payment" | "waiting_confirm" | "paid" | "completed" | "cancelled" | null;
          p_payment_method: "QR" | "CASH";
          p_amount: number;
          p_idempotency_key: string;
          p_request_fingerprint: string;
          p_actor_user_id?: string | null;
          p_raw_data?: Json | null;
        };
        Returns: Json;
      };
      create_reservation_with_table_lock: {
        Args: {
          p_reservation: Json;
          p_table_id: string;
          p_lock_ends_at: string;
        };
        Returns: string;
      };
      confirm_reservation_deposit_atomic: {
        Args: {
          p_restaurant_id: string;
          p_reservation_id: string;
          p_transition_key: string;
          p_source: string;
        };
        Returns: boolean;
      };
      replace_reservation_table_locks_atomic: {
        Args: {
          p_restaurant_id: string;
          p_reservation_id: string;
          p_table_ids: string[];
          p_starts_at: string;
          p_lock_ends_at: string;
          p_reservation_starts_at?: string | null;
          p_reservation_ends_at?: string | null;
        };
        Returns: Array<Database["public"]["Tables"]["reservation_table_locks"]["Row"]>;
      };
    };
    Enums: {
      user_role: "ADMIN" | "STAFF";
      order_status: "pending" | "ordering" | "waiting_payment" | "waiting_confirm" | "paid" | "completed" | "cancelled";
      payment_method: "QR" | "CASH";
      table_bill_status: "open" | "waiting_payment" | "waiting_confirm" | "paid" | "cancelled";
      payment_log_status: "pending" | "waiting_confirm" | "confirmed" | "failed" | "cancelled" | "refunded";
      restaurant_platform_status: "active" | "suspended" | "deleted";
      platform_user_status: "active" | "blocked";
      saas_subscription_status: "trialing" | "pending_payment" | "active" | "past_due" | "suspended" | "cancelled" | "expired";
      subscription_payment_status: "waiting_confirm" | "confirmed" | "rejected" | "expired";
    };
    CompositeTypes: Record<string, never>;
  };
};
