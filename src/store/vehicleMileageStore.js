import { create } from 'zustand'

export const useVehicleMileageStore = create((set) => ({
  showForm: false,
  editing: null,
  search: '',
  vehicleFilter: 'all',
  monthFilter: '',
  deleteTarget: null,

  setShowForm: (showForm) => set({ showForm }),
  setEditing: (editing) => set({ editing }),
  setSearch: (search) => set({ search }),
  setVehicleFilter: (vehicleFilter) => set({ vehicleFilter }),
  setMonthFilter: (monthFilter) => set({ monthFilter }),
  setDeleteTarget: (deleteTarget) => set({ deleteTarget }),
  clearFilters: () => set({ search: '', vehicleFilter: 'all', monthFilter: '' }),

  openCreate: () => set({ editing: null, showForm: true }),
  openEdit: (entry) => set({ editing: entry, showForm: true }),
  closeForm: () => set({ showForm: false, editing: null })
}))
