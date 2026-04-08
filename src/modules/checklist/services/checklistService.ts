import { db } from '../../../lib/firebase'
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDocs,
  query,
  serverTimestamp,
  writeBatch,
  updateDoc,
  where,
} from 'firebase/firestore'
import { z } from 'zod'
import type {
  ChecklistFrequency,
  ChecklistLog,
  ChecklistLogStatus,
  ChecklistTemplate,
  ChecklistTemplateCreateInput,
  ChecklistTemplateUpdateInput,
} from '../types'

const COLLECTION_TEMPLATES = 'checklist_templates'
const COLLECTION_LOGS = 'checklist_logs'

const frequencySchema = z.enum(['daily', 'weekly'])
const statusSchema = z.enum(['done', 'skipped', 'not_required'])
const monthSchema = z.string().regex(/^\d{4}-\d{2}$/)

const templateCreateSchema = z.object({
  name: z.string().trim().min(1).max(120),
  frequency: frequencySchema,
  order: z.number().int().nonnegative().optional(),
  active: z.boolean().optional(),
})

const templateUpdateSchema = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  frequency: frequencySchema.optional(),
  order: z.number().int().nonnegative().optional(),
  active: z.boolean().optional(),
})

const logUpsertSchema = z.object({
  userId: z.string().min(1),
  templateId: z.string().min(1),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  status: statusSchema,
  note: z.string().max(500).nullable().optional(),
})

function toDateString(value: Date) {
  const year = value.getFullYear()
  const month = String(value.getMonth() + 1).padStart(2, '0')
  const day = String(value.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

export const checklistService = {
  async createTemplate(userId: string, data: ChecklistTemplateCreateInput) {
    const parsed = templateCreateSchema.parse(data)
    const docRef = await addDoc(collection(db, COLLECTION_TEMPLATES), {
      ...parsed,
      userId,
      order: parsed.order ?? 0,
      active: parsed.active ?? true,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    })
    return docRef.id
  },

  async getUserTemplates(userId: string, frequency: ChecklistFrequency | null = null): Promise<ChecklistTemplate[]> {
    if (!userId) return []
    const parsedFrequency = frequency ? frequencySchema.parse(frequency) : null
    const q = query(collection(db, COLLECTION_TEMPLATES), where('userId', '==', userId))
    const snap = await getDocs(q)
    const rows = snap.docs.map((d) => ({ id: d.id, ...d.data() })) as ChecklistTemplate[]
    return rows
      .filter((row) => row.active === true)
      .filter((row) => (parsedFrequency ? row.frequency === parsedFrequency : true))
      .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
  },

  async updateTemplate(templateId: string, data: ChecklistTemplateUpdateInput) {
    const parsed = templateUpdateSchema.parse(data)
    const docRef = doc(db, COLLECTION_TEMPLATES, templateId)
    await updateDoc(docRef, {
      ...parsed,
      updatedAt: serverTimestamp(),
    })
  },

  async deleteTemplate(templateId: string) {
    const docRef = doc(db, COLLECTION_TEMPLATES, templateId)
    await updateDoc(docRef, { active: false })
  },

  async reorderTemplates(_userId: string, orderedIds: string[]) {
    const batch = []
    for (let i = 0; i < orderedIds.length; i++) {
      const docRef = doc(db, COLLECTION_TEMPLATES, orderedIds[i])
      batch.push(updateDoc(docRef, { order: i }))
    }
    await Promise.all(batch)
  },

  async getLogsByMonth(userId: string, month: string): Promise<ChecklistLog[]> {
    if (!userId) return []
    const parsedMonth = monthSchema.parse(month)
    const [year, monthNum] = parsedMonth.split('-').map(Number)
    const startDateObj = new Date(year, monthNum - 1, 1)
    const endDateObj = new Date(year, monthNum, 0)
    const startDate = toDateString(startDateObj)
    const endDate = toDateString(endDateObj)

    const q = query(collection(db, COLLECTION_LOGS), where('userId', '==', userId))
    const snap = await getDocs(q)
    const rows = snap.docs.map((d) => ({ id: d.id, ...d.data() })) as ChecklistLog[]
    return rows.filter((row) => row.date >= startDate && row.date <= endDate)
  },

  async upsertLog(
    userId: string,
    templateId: string,
    date: string,
    status: ChecklistLogStatus,
    note: string | null = null
  ) {
    const parsed = logUpsertSchema.parse({ userId, templateId, date, status, note })
    const q = query(collection(db, COLLECTION_LOGS), where('userId', '==', parsed.userId))
    const snap = await getDocs(q)
    const existingDoc = snap.docs.find((docSnap) => {
      const data = docSnap.data()
      return data.templateId === parsed.templateId && data.date === parsed.date
    })

    if (!existingDoc) {
      const docRef = await addDoc(collection(db, COLLECTION_LOGS), {
        userId: parsed.userId,
        templateId: parsed.templateId,
        date: parsed.date,
        status: parsed.status,
        note: parsed.note ?? null,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      })
      return {
        id: docRef.id,
        userId: parsed.userId,
        templateId: parsed.templateId,
        date: parsed.date,
        status: parsed.status,
        note: parsed.note ?? null,
      }
    }

    const docId = existingDoc.id
    const docRef = doc(db, COLLECTION_LOGS, docId)
    await updateDoc(docRef, {
      status: parsed.status,
      note: parsed.note ?? null,
      updatedAt: serverTimestamp(),
    })
    return {
      id: docId,
      userId: parsed.userId,
      templateId: parsed.templateId,
      date: parsed.date,
      status: parsed.status,
      note: parsed.note ?? null,
    }
  },

  async upsertLogsBulk(
    userId: string,
    entries: Array<{
      templateId: string
      date: string
      status: ChecklistLogStatus
      note?: string | null
    }>
  ) {
    if (!userId || !entries.length) return []
    const parsedEntries = entries.map((entry) =>
      logUpsertSchema.parse({
        userId,
        templateId: entry.templateId,
        date: entry.date,
        status: entry.status,
        note: entry.note ?? null,
      })
    )

    const q = query(collection(db, COLLECTION_LOGS), where('userId', '==', userId))
    const snap = await getDocs(q)
    const existingByKey = new Map<string, string>()
    snap.docs.forEach((docSnap) => {
      const data = docSnap.data()
      existingByKey.set(`${data.templateId}_${data.date}`, docSnap.id)
    })

    const batch = writeBatch(db)
    const result = parsedEntries.map((entry) => {
      const key = `${entry.templateId}_${entry.date}`
      const existingId = existingByKey.get(key)
      if (existingId) {
        const docRef = doc(db, COLLECTION_LOGS, existingId)
        batch.update(docRef, {
          status: entry.status,
          note: entry.note ?? null,
          updatedAt: serverTimestamp(),
        })
        return {
          id: existingId,
          userId: entry.userId,
          templateId: entry.templateId,
          date: entry.date,
          status: entry.status,
          note: entry.note ?? null,
        }
      }

      const docRef = doc(collection(db, COLLECTION_LOGS))
      batch.set(docRef, {
        userId: entry.userId,
        templateId: entry.templateId,
        date: entry.date,
        status: entry.status,
        note: entry.note ?? null,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      })
      return {
        id: docRef.id,
        userId: entry.userId,
        templateId: entry.templateId,
        date: entry.date,
        status: entry.status,
        note: entry.note ?? null,
      }
    })

    await batch.commit()
    return result
  },

  async deleteLog(logId: string) {
    const docRef = doc(db, COLLECTION_LOGS, logId)
    await deleteDoc(docRef)
  },
}
