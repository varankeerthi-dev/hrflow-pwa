import { create } from 'zustand'
import { format } from 'date-fns'

const getCurrentMonth = () => format(new Date(), 'yyyy-MM')

export const useVehicleMileageStore = create((set) => ({
  showForm: false,
  editing: null,
  search: '',
  vehicleFilter: 'all',
  monthFilter: getCurrentMonth(),
  deleteTarget: null,

  setShowForm: (showForm) => set({ showForm }),
  setEditing: (editing) => set({ editing }),
  setSearch: (search) => set({ search }),
  setVehicleFilter: (vehicleFilter) => set({ vehicleFilter }),
  setMonthFilter: (monthFilter) => set({ monthFilter }),
  setDeleteTarget: (deleteTarget) => set({ deleteTarget }),
  clearFilters: () => set({ search: '', vehicleFilter: 'all', monthFilter: getCurrentMonth() }),

  openCreate: () => set({ editing: null, showForm: true }),
  openEdit: (entry) => set({ editing: entry, showForm: true }),
  closeForm: () => set({ showForm: false, editing: null })
}))
