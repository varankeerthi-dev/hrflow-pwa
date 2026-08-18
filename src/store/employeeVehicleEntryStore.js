import { create } from 'zustand'

export const useEmployeeVehicleEntryStore = create((set) => ({
  activeEntry: null,
  conflictEntry: null,
  conflictNotice: null,

  openEntry: (activeEntry) => set({ activeEntry, conflictEntry: null, conflictNotice: null }),
  closeEntry: () => set({ activeEntry: null, conflictEntry: null, conflictNotice: null }),
  setConflictEntry: (conflictEntry) => set({ conflictEntry }),
  setConflictNotice: (conflictNotice) => set({ conflictNotice }),
  clearConflict: () => set({ conflictEntry: null, conflictNotice: null }),
}))
