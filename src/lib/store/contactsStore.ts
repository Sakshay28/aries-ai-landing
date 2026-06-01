import { create } from 'zustand';
import { normalizePhone } from '@/lib/utils/phone';

// Types for CSV Import Wizard
export type CSVImportStep = 'hidden' | 'source' | 'csv' | 'mapping' | 'duplicates' | 'progress' | 'done';

export interface CSVPreviewRow {
  name: string | null;
  phone: string;
  email: string | null;
  notes: string | null;
  status: 'Ready' | 'Duplicate' | 'Invalid';
  reason?: string;
}

export interface CSVImportResult {
  imported: number;
  merged: number;
  skipped: number;
  total: number;
  report: {
    index: number;
    status: 'imported' | 'skipped_duplicate' | 'skipped_invalid' | 'merged';
    reason?: string;
    phone?: string;
  }[];
}

export interface Contact {
  id: string;
  name?: string | null;
  phone: string;
  email?: string | null;
  notes?: string | null;
  channel?: string | null;
  lead_status?: string | null;
  lead_score?: number | null;
  created_at?: string;
  updated_at?: string;
}

interface ContactsStore {
  // Contacts Cache List and Map Lookup
  contacts: Contact[];
  contactByPhone: Record<string, Contact>;
  setContacts: (contacts: Contact[]) => void;
  addOrUpdateContact: (contact: Contact) => void;
  fetchContactsList: () => Promise<void>;
  getContactByPhone: (phone: string) => Contact | undefined;

  // Navigation & Filtering UI State
  activeFilter: string; // 'all' | 'recent' | 'whatsapp' | 'manual' | 'imported'
  searchQuery: string;
  selectedContactId: string | null;
  drawerOpen: boolean;

  // Modals UI State
  addContactModalOpen: boolean;
  
  // Save Contact Modal UI State
  saveContactModalOpen: boolean;
  saveContactPhone: string;
  setSaveContactModalOpen: (open: boolean) => void;
  setSaveContactPhone: (phone: string) => void;
  
  // CSV Import Wizard State
  csvImportStep: CSVImportStep;
  csvFile: File | null;
  csvPreviewRows: CSVPreviewRow[];
  csvImportResult: CSVImportResult | null;
  csvError: string | null;
  csvUploading: boolean;
  workspaceDefaultCountryCode: string; // Workspace setting: Default Country Code ('91', '971', etc.)

  // Query Invalidation Trigger
  // Incrementing this notifies components to refetch contacts data and filter counts
  queryTrigger: number;
  
  // Actions
  setActiveFilter: (filter: string) => void;
  setSearchQuery: (query: string) => void;
  setSelectedContactId: (id: string | null) => void;
  setDrawerOpen: (open: boolean) => void;
  setAddContactModalOpen: (open: boolean) => void;
  
  // CSV Import Actions
  setCsvImportStep: (step: CSVImportStep) => void;
  setCsvFile: (file: File | null) => void;
  setCsvPreviewRows: (rows: CSVPreviewRow[]) => void;
  setCsvImportResult: (result: CSVImportResult | null) => void;
  setCsvError: (err: string | null) => void;
  setCsvUploading: (uploading: boolean) => void;
  setWorkspaceDefaultCountryCode: (code: string) => void;
  
  // Reactive Query Invalidation Trigger
  invalidateQueries: () => void;
}

export const useContactsStore = create<ContactsStore>((set, get) => ({
  // Caches
  contacts: [],
  contactByPhone: {},
  setContacts: (contacts) => {
    const lookup: Record<string, Contact> = {};
    for (const c of contacts) {
      if (c.phone) {
        const norm = normalizePhone(c.phone, get().workspaceDefaultCountryCode);
        lookup[norm] = c;
      }
    }
    set({ contacts, contactByPhone: lookup });
  },
  addOrUpdateContact: (contact) => {
    if (!contact || !contact.phone) return;
    const norm = normalizePhone(contact.phone, get().workspaceDefaultCountryCode);
    const existing = get().contacts;
    
    // Check if the contact exists by id or normalized phone matching
    const contactExists = existing.some(
      c => c.id === contact.id || normalizePhone(c.phone, get().workspaceDefaultCountryCode) === norm
    );
    
    const updated = contactExists
      ? existing.map(c => 
          (c.id === contact.id || normalizePhone(c.phone, get().workspaceDefaultCountryCode) === norm)
            ? { ...c, ...contact }
            : c
        )
      : [...existing, contact];
    
    const newLookup = { ...get().contactByPhone, [norm]: { ...get().contactByPhone[norm], ...contact } };
    set({ contacts: updated, contactByPhone: newLookup });
  },
  fetchContactsList: async () => {
    try {
      const res = await fetch(`/api/dashboard/contacts?limit=2000&cc=${get().workspaceDefaultCountryCode}`);
      const json = await res.json();
      if (json.success && Array.isArray(json.data)) {
        get().setContacts(json.data);
      }
    } catch (err) {
      console.error('Failed to pre-fetch contacts in store:', err);
    }
  },
  getContactByPhone: (phone) => {
    if (!phone) return undefined;
    const norm = normalizePhone(phone, get().workspaceDefaultCountryCode);
    return get().contactByPhone[norm];
  },

  // Defaults
  activeFilter: 'all',
  searchQuery: '',
  selectedContactId: null,
  drawerOpen: false,
  addContactModalOpen: false,
  saveContactModalOpen: false,
  saveContactPhone: '',

  csvImportStep: 'hidden',
  csvFile: null,
  csvPreviewRows: [],
  csvImportResult: null,
  csvError: null,
  csvUploading: false,
  workspaceDefaultCountryCode: '91', // Defaults to India region (+91) but dynamic

  queryTrigger: 0,

  // Setters
  setActiveFilter: (filter) => set({ activeFilter: filter }),
  setSearchQuery: (query) => set({ searchQuery: query }),
  setSelectedContactId: (id) => set({ selectedContactId: id }),
  setDrawerOpen: (open) => set({ drawerOpen: open }),
  setAddContactModalOpen: (open) => set({ addContactModalOpen: open }),
  setSaveContactModalOpen: (open) => set({ saveContactModalOpen: open }),
  setSaveContactPhone: (phone) => set({ saveContactPhone: phone }),

  setCsvImportStep: (step) => set({ csvImportStep: step }),
  setCsvFile: (file) => set({ csvFile: file }),
  setCsvPreviewRows: (rows) => set({ csvPreviewRows: rows }),
  setCsvImportResult: (result) => set({ csvImportResult: result }),
  setCsvError: (err) => set({ csvError: err }),
  setCsvUploading: (uploading) => set({ csvUploading: uploading }),
  setWorkspaceDefaultCountryCode: (code) => set({ workspaceDefaultCountryCode: code }),

  invalidateQueries: () => set((state) => ({ queryTrigger: state.queryTrigger + 1 })),
}));
