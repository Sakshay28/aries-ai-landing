// This store is intentionally minimal.
// All broadcast builder state now lives in BroadcastBuilder.tsx (local state).
// Removing the global Zustand store from the builder eliminates:
//   - Cross-session state pollution (old campaign data bleeding into new ones)
//   - Race conditions between store.saveCampaign() and component-level saves
//   - Hydration mismatches on page refresh
//
// This file is kept only for any components that still import from it.
// They should be migrated to use local state or API routes directly.

export const useBroadcastStore = () => ({
  saveStatus:       'idle' as const,
  setSaveStatus:    (_: any) => {},
  previewRecipient: 'Sakshay' as const,
  setPreviewRecipient: (_: any) => {},
});
