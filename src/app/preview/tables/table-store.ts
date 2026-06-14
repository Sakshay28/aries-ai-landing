import { create } from "zustand";

export type TableStatus = "available" | "reserved" | "occupied";

export interface RestaurantTable {
  id: string;
  name: string;
  capacity: number;
  status: TableStatus;
  guestName?: string;
  guestPhone?: string;
  guestCount?: number;
  reservationTime?: string;
  notes?: string;
  seatedAt?: number;
  reservedAt?: number;
}

export interface TableReservation {
  id: string;
  guestName: string;
  guestPhone: string;
  guestCount: number;
  time: string;
  notes: string;
  tableId: string;
  tableName: string;
  createdAt: number;
  status: "upcoming" | "seated" | "completed" | "cancelled";
}

export interface TableWalkIn {
  id: string;
  guestCount: number;
  tableId: string;
  tableName: string;
  seatedAt: number;
}

export interface TableStats {
  available: number;
  reserved: number;
  occupied: number;
  totalReservations: number;
  totalWalkIns: number;
  occupancyRate: number;
}

const SEED_TABLES: RestaurantTable[] = [
  { id: "t1", name: "T1", capacity: 2, status: "available" },
  { id: "t2", name: "T2", capacity: 2, status: "available" },
  { id: "t3", name: "T3", capacity: 2, status: "available" },
  { id: "t4", name: "T4", capacity: 4, status: "reserved", guestName: "Rahul Mehta", guestPhone: "9876543210", guestCount: 3, reservationTime: "8:00 PM", reservedAt: Date.now() },
  { id: "t5", name: "T5", capacity: 4, status: "available" },
  { id: "t6", name: "T6", capacity: 4, status: "occupied", guestName: "Priya Shah", guestCount: 4, seatedAt: Date.now() - 45 * 60000 },
  { id: "t7", name: "T7", capacity: 4, status: "available" },
  { id: "t8", name: "T8", capacity: 6, status: "reserved", guestName: "Amit Kumar", guestPhone: "9123456789", guestCount: 5, reservationTime: "9:00 PM", reservedAt: Date.now() },
  { id: "t9", name: "T9", capacity: 6, status: "available" },
  { id: "t10", name: "T10", capacity: 6, status: "occupied", guestName: "Neha Gupta", guestCount: 6, seatedAt: Date.now() - 20 * 60000 },
  { id: "t11", name: "T11", capacity: 8, status: "available" },
  { id: "t12", name: "T12", capacity: 8, status: "available" },
];

function findBestTable(tables: RestaurantTable[], guestCount: number): RestaurantTable | null {
  return tables
    .filter((t) => t.status === "available" && t.capacity >= guestCount)
    .sort((a, b) => a.capacity - b.capacity)[0] ?? null;
}

const STATUS_CYCLE: Record<TableStatus, TableStatus> = {
  available: "reserved",
  reserved: "occupied",
  occupied: "available",
};

interface TableStore {
  tables: RestaurantTable[];
  reservations: TableReservation[];
  walkIns: TableWalkIn[];
  searchQuery: string;

  cycleTable: (id: string) => void;
  createReservation: (data: {
    guestName: string;
    guestPhone: string;
    guestCount: number;
    time: string;
    notes: string;
    tableId?: string;
  }) => string | null;
  walkIn: (guestCount: number) => string | null;
  setSearch: (q: string) => void;
}


export const useTableStore = create<TableStore>((set, get) => ({
  tables: SEED_TABLES,
  reservations: [
    {
      id: "r1",
      guestName: "Rahul Mehta",
      guestPhone: "9876543210",
      guestCount: 3,
      time: "8:00 PM",
      notes: "Birthday celebration",
      tableId: "t4",
      tableName: "T4",
      createdAt: Date.now() - 3600000,
      status: "upcoming",
    },
    {
      id: "r2",
      guestName: "Amit Kumar",
      guestPhone: "9123456789",
      guestCount: 5,
      time: "9:00 PM",
      notes: "Anniversary dinner",
      tableId: "t8",
      tableName: "T8",
      createdAt: Date.now() - 1800000,
      status: "upcoming",
    },
  ],
  walkIns: [
    { id: "w1", guestCount: 4, tableId: "t6", tableName: "T6", seatedAt: Date.now() - 45 * 60000 },
    { id: "w2", guestCount: 6, tableId: "t10", tableName: "T10", seatedAt: Date.now() - 20 * 60000 },
  ],
  searchQuery: "",

  cycleTable: (id) =>
    set((state) => ({
      tables: state.tables.map((t) => {
        if (t.id !== id) return t;
        const next = STATUS_CYCLE[t.status];
        if (next === "available") {
          return { ...t, status: next, guestName: undefined, guestPhone: undefined, guestCount: undefined, reservationTime: undefined, notes: undefined, seatedAt: undefined, reservedAt: undefined };
        }
        if (next === "occupied") {
          return { ...t, status: next, seatedAt: Date.now() };
        }
        return { ...t, status: next, reservedAt: Date.now() };
      }),
      reservations: state.reservations.map((r) => {
        if (r.tableId !== id) return r;
        const table = state.tables.find((tt) => tt.id === id);
        if (!table) return r;
        if (table.status === "reserved") return { ...r, status: "seated" as const };
        if (table.status === "occupied") return { ...r, status: "completed" as const };
        return r;
      }),
    })),

  createReservation: (data) => {
    const state = get();
    const table = data.tableId
      ? state.tables.find((t) => t.id === data.tableId && t.status === "available")
      : findBestTable(state.tables, data.guestCount);
    if (!table) return null;

    const reservation: TableReservation = {
      id: `r${Date.now()}`,
      guestName: data.guestName,
      guestPhone: data.guestPhone,
      guestCount: data.guestCount,
      time: data.time,
      notes: data.notes,
      tableId: table.id,
      tableName: table.name,
      createdAt: Date.now(),
      status: "upcoming",
    };

    set((state) => ({
      tables: state.tables.map((t) =>
        t.id === table.id
          ? { ...t, status: "reserved" as const, guestName: data.guestName, guestPhone: data.guestPhone, guestCount: data.guestCount, reservationTime: data.time, notes: data.notes, reservedAt: Date.now() }
          : t
      ),
      reservations: [...state.reservations, reservation],
    }));
    return table.name;
  },

  walkIn: (guestCount) => {
    const state = get();
    const table = findBestTable(state.tables, guestCount);
    if (!table) return null;

    const entry: TableWalkIn = {
      id: `w${Date.now()}`,
      guestCount,
      tableId: table.id,
      tableName: table.name,
      seatedAt: Date.now(),
    };

    set((state) => ({
      tables: state.tables.map((t) =>
        t.id === table.id
          ? { ...t, status: "occupied" as const, guestCount, seatedAt: Date.now() }
          : t
      ),
      walkIns: [...state.walkIns, entry],
    }));
    return table.name;
  },

  setSearch: (q) => set({ searchQuery: q }),
}));
