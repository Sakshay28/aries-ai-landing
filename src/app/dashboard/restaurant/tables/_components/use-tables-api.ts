'use client';

import { useState, useEffect, useCallback, useRef } from 'react';

export type TableStatus = 'available' | 'reserved' | 'occupied' | 'cleaning' | 'blocked';
export type ReservationType = 'guest' | 'internal';

export interface TableData {
  id: string;
  name: string;
  capacity: number;
  status: TableStatus;
  reservation_type?: ReservationType | null;
  reservation_label?: string | null;
  guest_name?: string | null;
  guest_phone?: string | null;
  guest_count?: number | null;
  reservation_time?: string | null;
  reserved_for?: string | null;
  reserved_duration_min?: number | null;
  server_name?: string | null;
  section?: string | null;
  blocked_reason?: string | null;
  notes?: string | null;
  seated_at?: string | null;
  reserved_at?: string | null;
  current_booking_id?: string | null;
  sort_order: number;
}

export interface BookingData {
  id: string;
  reservation_id: string;
  customer_name: string;
  customer_phone: string;
  party_size: number;
  booking_date: string;
  booking_status: string;
  special_request?: string | null;
  table_id?: string | null;
  source?: string;
  restaurant_slots?: { slot_time: string } | null;
}

export interface GuestMemory {
  customer_phone: string;
  customer_name?: string | null;
  visit_count: number;
  last_visit_date?: string | null;
  first_visit_date?: string | null;
  preferences?: string | null;
  vip_status: boolean;
  tags?: string[];
  notes?: string | null;
  birthday?: string | null;
  avg_spend?: number;
}

export interface ActivityItem {
  id: string;
  table_id: string | null;
  table_name: string | null;
  action: string;
  actor: string | null;
  guest_name: string | null;
  guest_phone: string | null;
  guest_count: number | null;
  from_status: string | null;
  to_status: string | null;
  detail: string | null;
  created_at: string;
}

export interface TableSettings {
  open_time: string;
  close_time: string;
  slot_interval: number;
  table_count: number;
}

export interface ActionResult {
  ok: boolean;
  error?: string;
  reason?: string;
  tableName?: string | null;
}

export interface ReservePayload {
  reservationType: ReservationType;
  guestName?: string;
  guestPhone?: string;
  reservationLabel?: string;
  guestCount: number;
  time: string;
  notes?: string;
  tableId?: string;
  durationMin?: number;
  date?: string;
}

export interface SeatPayload {
  guestCount: number;
  guestName?: string;
  guestPhone?: string;
  notes?: string;
  tableId?: string;
}

export type StatusAction = 'free' | 'free_to_cleaning' | 'available' | 'cleaning' | 'block' | 'unblock' | 'cancel';

const POLL_INTERVAL = 10_000;

async function postJSON(url: string, body: unknown): Promise<ActionResult> {
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok || !json.success) {
      return { ok: false, error: json.error || `HTTP ${res.status}`, reason: json.reason };
    }
    return { ok: true, tableName: json.data?.tableName ?? null };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Network error' };
  }
}

export function useTablesAPI() {
  const [tables, setTables] = useState<TableData[]>([]);
  const [bookings, setBookings] = useState<BookingData[]>([]);
  const [activity, setActivity] = useState<ActivityItem[]>([]);
  const [guestMemory, setGuestMemory] = useState<Record<string, GuestMemory>>({});
  const [settings, setSettings] = useState<TableSettings>({
    open_time: '11:00:00', close_time: '23:00:00', slot_interval: 30, table_count: 0,
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const mountedRef = useRef(true);

  const fetchTables = useCallback(async (showLoading = false) => {
    if (showLoading) setLoading(true);
    try {
      const res = await fetch('/api/restaurant/tables');
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || `HTTP ${res.status}`);
      }
      const json = await res.json();
      if (!mountedRef.current) return;
      if (json.success) {
        setTables(json.data.tables || []);
        setBookings(json.data.bookings || []);
        setActivity(json.data.activity || []);
        setGuestMemory(json.data.guestMemory || {});
        if (json.data.settings) setSettings(json.data.settings);
        setError(null);
      }
    } catch (err) {
      if (!mountedRef.current) return;
      setError(err instanceof Error ? err.message : 'Failed to load tables');
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    // Fetch-on-mount: state updates happen after the awaited fetch resolves,
    // not synchronously, so this does not cause cascading renders.
    mountedRef.current = true;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchTables(false);
    const interval = setInterval(() => fetchTables(false), POLL_INTERVAL);
    return () => { mountedRef.current = false; clearInterval(interval); };
  }, [fetchTables]);

  const reserveTable = useCallback(async (payload: ReservePayload): Promise<ActionResult> => {
    const r = await postJSON('/api/restaurant/tables/reserve', payload);
    if (r.ok) await fetchTables(false);
    return r;
  }, [fetchTables]);

  const editReservation = useCallback(async (payload: ReservePayload & { bookingId?: string | null }): Promise<ActionResult> => {
    const r = await postJSON('/api/restaurant/tables/reserve', { ...payload, mode: 'edit' });
    if (r.ok) await fetchTables(false);
    return r;
  }, [fetchTables]);

  const seatTable = useCallback(async (payload: SeatPayload): Promise<ActionResult> => {
    const r = await postJSON('/api/restaurant/tables/seat', payload);
    if (r.ok) await fetchTables(false);
    return r;
  }, [fetchTables]);

  const setTableStatus = useCallback(async (tableId: string, action: StatusAction, reason?: string): Promise<ActionResult> => {
    // Optimistic: reflect terminal statuses immediately for snappy feedback
    const optimistic: Partial<Record<StatusAction, TableStatus>> = {
      free: 'available', free_to_cleaning: 'cleaning', available: 'available',
      cleaning: 'cleaning', block: 'blocked', unblock: 'available', cancel: 'available',
    };
    const next = optimistic[action];
    if (next) {
      setTables((prev) => prev.map((t) => t.id === tableId ? { ...t, status: next } : t));
    }
    const r = await postJSON('/api/restaurant/tables/status', { tableId, action, reason });
    await fetchTables(false); // reconcile regardless
    return r;
  }, [fetchTables]);

  const generateTables = useCallback(async (payload: { count: number; mix?: { capacity: number; count: number }[]; defaultCapacity?: number }): Promise<ActionResult> => {
    const r = await postJSON('/api/restaurant/tables', { action: 'generate', ...payload });
    if (r.ok) await fetchTables(true);
    return r;
  }, [fetchTables]);

  const createTable = useCallback(async (name: string, capacity: number): Promise<ActionResult> => {
    const r = await postJSON('/api/restaurant/tables', { action: 'create', name, capacity });
    if (r.ok) await fetchTables(false);
    return r;
  }, [fetchTables]);

  const updateTable = useCallback(async (id: string, fields: { name?: string; capacity?: number; section?: string; server_name?: string }): Promise<ActionResult> => {
    const r = await postJSON('/api/restaurant/tables', { action: 'update', id, ...fields });
    if (r.ok) await fetchTables(false);
    return r;
  }, [fetchTables]);

  const deactivateTable = useCallback(async (id: string): Promise<ActionResult> => {
    const r = await postJSON('/api/restaurant/tables', { action: 'deactivate', id });
    if (r.ok) await fetchTables(false);
    return r;
  }, [fetchTables]);

  const updateSettings = useCallback(async (fields: { open_time?: string; close_time?: string; slot_interval?: number }): Promise<ActionResult> => {
    const r = await postJSON('/api/restaurant/tables', { action: 'settings', ...fields });
    if (r.ok) await fetchTables(false);
    return r;
  }, [fetchTables]);

  return {
    tables, bookings, activity, guestMemory, settings, loading, error,
    refetch: () => fetchTables(false),
    reserveTable, editReservation, seatTable, setTableStatus,
    generateTables, createTable, updateTable, deactivateTable, updateSettings,
  };
}

export type TablesAPI = ReturnType<typeof useTablesAPI>;
