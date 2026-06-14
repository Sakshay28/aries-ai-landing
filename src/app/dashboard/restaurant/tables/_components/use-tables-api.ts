'use client';

import { useState, useEffect, useCallback, useRef } from 'react';

export type TableStatus = 'available' | 'reserved' | 'occupied';

export interface TableData {
  id: string;
  name: string;
  capacity: number;
  status: TableStatus;
  guest_name?: string | null;
  guest_phone?: string | null;
  guest_count?: number | null;
  reservation_time?: string | null;
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

export interface WalkInData {
  id: string;
  name: string;
  guest_name?: string | null;
  guest_count?: number | null;
  seated_at?: string | null;
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

interface UseTablesAPIReturn {
  tables: TableData[];
  bookings: BookingData[];
  walkIns: WalkInData[];
  guestMemory: Record<string, GuestMemory>;
  loading: boolean;
  error: string | null;
  searchQuery: string;
  setSearchQuery: (q: string) => void;
  cycleTable: (tableId: string) => Promise<void>;
  walkIn: (guestCount: number) => Promise<string | null>;
  reserve: (data: {
    guestName: string;
    guestPhone: string;
    guestCount: number;
    time: string;
    notes: string;
  }) => Promise<string | null>;
  refetch: () => Promise<void>;
}

const POLL_INTERVAL = 10_000;

export function useTablesAPI(): UseTablesAPIReturn {
  const [tables, setTables] = useState<TableData[]>([]);
  const [bookings, setBookings] = useState<BookingData[]>([]);
  const [walkIns, setWalkIns] = useState<WalkInData[]>([]);
  const [guestMemory, setGuestMemory] = useState<Record<string, GuestMemory>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
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
        setWalkIns(json.data.walkIns || []);
        setGuestMemory(json.data.guestMemory || {});
        setError(null);
      }
    } catch (err: any) {
      if (!mountedRef.current) return;
      setError(err.message);
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    fetchTables(true);
    const interval = setInterval(() => fetchTables(false), POLL_INTERVAL);
    return () => {
      mountedRef.current = false;
      clearInterval(interval);
    };
  }, [fetchTables]);

  const cycleTable = useCallback(async (tableId: string) => {
    // Optimistic update
    setTables((prev) =>
      prev.map((t) => {
        if (t.id !== tableId) return t;
        const cycle: Record<string, TableStatus> = { available: 'reserved', reserved: 'occupied', occupied: 'available' };
        const next = cycle[t.status] || 'available';
        if (next === 'available') {
          return { ...t, status: next, guest_name: null, guest_phone: null, guest_count: null, reservation_time: null, notes: null, seated_at: null, reserved_at: null, current_booking_id: null };
        }
        if (next === 'occupied') {
          return { ...t, status: next, seated_at: new Date().toISOString() };
        }
        return { ...t, status: next, reserved_at: new Date().toISOString() };
      })
    );

    try {
      const res = await fetch('/api/restaurant/tables/cycle', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tableId }),
      });
      if (!res.ok) throw new Error('Cycle failed');
      await fetchTables(false);
    } catch {
      await fetchTables(false);
    }
  }, [fetchTables]);

  const walkIn = useCallback(async (guestCount: number): Promise<string | null> => {
    try {
      const res = await fetch('/api/restaurant/tables/walk-in', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ guestCount }),
      });
      const json = await res.json();
      if (!json.success) return null;
      await fetchTables(false);
      return json.data.tableName;
    } catch {
      return null;
    }
  }, [fetchTables]);

  const reserve = useCallback(async (data: {
    guestName: string;
    guestPhone: string;
    guestCount: number;
    time: string;
    notes: string;
  }): Promise<string | null> => {
    try {
      const res = await fetch('/api/restaurant/tables/reserve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      const json = await res.json();
      if (!json.success) return null;
      await fetchTables(false);
      return json.data.tableName;
    } catch {
      return null;
    }
  }, [fetchTables]);

  return {
    tables,
    bookings,
    walkIns,
    guestMemory,
    loading,
    error,
    searchQuery,
    setSearchQuery,
    cycleTable,
    walkIn,
    reserve,
    refetch: () => fetchTables(false),
  };
}
