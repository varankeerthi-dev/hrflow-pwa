export const createDefaultChecklistItem = (initialTitle = '') => ({
  id: 'cl_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7),
  title: initialTitle,
  required: false,
  completed: false,
  textResponse: '',
  dropdownResponse: '',
  validations: {
    video: false,
    audio: false,
    image: false,
    file: false,
    text: false,
    dropdown: false,
    geoTag: false
  },
  dropdownConfig: {
    options: [
      { id: 'opt_1', label: 'Yes', points: '' },
      { id: 'opt_2', label: 'No', points: '' },
      { id: 'opt_3', label: 'Option 3', points: '' },
      { id: 'opt_4', label: 'Option 4', points: '' }
    ],
    allowMultiple: false
  }
})

export const createDefaultSubtask = (initialTitle = '') => ({
  id: 'st_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7),
  title: initialTitle,
  assignedTo: [],
  dueDate: null,
  reminder: { enabled: false, timing: 'at_due_date', customDate: null },
  completed: false,
  checklists: []
})

export const ensureItemIds = (items = [], prefix = 'cl') => {
  if (!Array.isArray(items)) return []
  return items.map((item, idx) => {
    if (typeof item === 'string') {
      return {
        id: `${prefix}_${Date.now()}_${idx}_${Math.random().toString(36).substring(2, 6)}`,
        title: item,
        completed: false
      }
    }
    return {
      ...item,
      id: item.id || `${prefix}_${Date.now()}_${idx}_${Math.random().toString(36).substring(2, 6)}`,
      completed: !!item.completed
    }
  })
}

export const cleanFirestoreData = (data) => {
  if (data === undefined) return null
  if (data === null || typeof data !== 'object') return data
  if (Array.isArray(data)) {
    return data.map(item => cleanFirestoreData(item)).filter(item => item !== undefined)
  }
  if (data instanceof Date || (data && typeof data.toMillis === 'function') || (data && typeof data._methodName === 'string')) {
    return data
  }
  const cleaned = {}
  for (const [key, val] of Object.entries(data)) {
    if (val !== undefined) {
      cleaned[key] = cleanFirestoreData(val)
    }
  }
  return cleaned
}

