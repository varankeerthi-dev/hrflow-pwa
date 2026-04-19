import imageCompression from 'browser-image-compression'
import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  writeBatch,
} from 'firebase/firestore'
import { deleteObject, getDownloadURL, ref, uploadBytes } from 'firebase/storage'
import { db, storage } from './firebase'
import { calcOT } from '../hooks/useAttendance'
import {
  ATTENDANCE_EVENT_IN,
  ATTENDANCE_EVENT_OUT,
  ATTENDANCE_RADIUS_DEFAULT_METERS,
  ATTENDANCE_STATUS_APPROVED_WAITING_FINALIZE,
  ATTENDANCE_STATUS_FINALIZED,
  ATTENDANCE_STATUS_PENDING_EXCEPTION,
  ATTENDANCE_STATUS_PENDING_HR,
  ATTENDANCE_STATUS_REJECTED,
  buildAttendanceEventId,
  buildAttendanceSessionId,
  getDateKey,
} from './attendanceWorkflow'
import {
  attendanceDoc,
  attendanceFinalDoc,
  employeePortalAttendanceLogDoc,
  employeePortalDoc,
  pendingAttendanceDoc,
  sitesCol,
} from './firestore'
import { haversineDistanceMeters, normalizeSiteCoordinates, normalizeSiteName } from './geofence'

export async function getCurrentPositionOnce(options = {}) {
  return new Promise((resolve, reject) => {
    if (!navigator?.geolocation) {
      reject(new Error('Geolocation is not supported by this browser.'))
      return
    }
    navigator.geolocation.getCurrentPosition(
      position => {
        resolve({
          lat: position.coords.latitude,
          lng: position.coords.longitude,
          accuracy: position.coords.accuracy,
        })
      },
      error => {
        if (error.code === 1) {
          reject(new Error('Location permission denied. Please allow location access.'))
          return
        }
        reject(new Error(error.message || 'Failed to fetch location.'))
      },
      {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 0,
        ...options,
      }
    )
  })
}

export async function getOrgSites(orgId) {
  if (!orgId) return []
  const snapshot = await getDocs(query(sitesCol(orgId)))
  return snapshot.docs.map(docSnap => ({ id: docSnap.id, ...docSnap.data() }))
}

export function resolveTargetSite(employee, sites = []) {
  if (!employee || !sites.length) return null
  if (employee.siteId) {
    const matched = sites.find(site => site.id === employee.siteId)
    if (matched) return matched
  }
  const employeeSiteName = String(employee.site || '').trim().toLowerCase()
  if (!employeeSiteName) return null
  return (
    sites.find(site => String(site.siteName || site.name || '').trim().toLowerCase() === employeeSiteName) ||
    null
  )
}

export function evaluateSiteProximity({ currentCoordinates, targetSite }) {
  const targetCoordinates = normalizeSiteCoordinates(targetSite)
  const radiusMeters = Number(targetSite?.radiusMeters) || ATTENDANCE_RADIUS_DEFAULT_METERS
  const accuracy = currentCoordinates?.accuracy || 0

  if (!currentCoordinates || !targetCoordinates) {
    return {
      distanceMeters: null,
      radiusMeters,
      withinRange: false,
      targetCoordinates,
      accuracy,
    }
  }
  const distanceMeters = haversineDistanceMeters(currentCoordinates, targetCoordinates)
  return {
    distanceMeters,
    radiusMeters,
    withinRange: distanceMeters <= radiusMeters,
    targetCoordinates,
    accuracy,
  }
}

export async function compressSelfieBlob(imageBlob, maxSizeKB = 100) {
  if (!imageBlob) throw new Error('No image captured.')
  return imageCompression(imageBlob, {
    maxSizeMB: maxSizeKB / 1024,
    maxWidthOrHeight: 1280,
    initialQuality: 0.7,
    useWebWorker: true,
    fileType: 'image/jpeg',
  })
}

export async function uploadTempSelfie({ orgId, userId, timestamp, fileBlob }) {
  if (!orgId || !userId || !fileBlob) {
    throw new Error('Missing required upload fields.')
  }
  const objectPath = `organisations/${orgId}/temp_selfies/${userId}/${timestamp}.jpg`
  const storageRef = ref(storage, objectPath)
  await uploadBytes(storageRef, fileBlob, { contentType: 'image/jpeg' })
  const photoUrl = await getDownloadURL(storageRef)
  return { photoUrl, photoPath: objectPath }
}

export async function submitPendingAttendanceEvent({
  orgId,
  user,
  employee,
  type,
  eventTimestamp = new Date(),
  site,
  targetCoordinates,
  currentCoordinates,
  distanceMeters,
  radiusMeters = ATTENDANCE_RADIUS_DEFAULT_METERS,
  photoUrl,
  photoPath,
  isException = false,
  exceptionReason = '',
}) {
  if (!orgId || !user?.uid || !employee?.id || !type) {
    throw new Error('Missing required attendance fields.')
  }

  const dateKey = getDateKey(eventTimestamp)
  const sessionId = buildAttendanceSessionId(employee.id, dateKey)
  const pendingId = buildAttendanceEventId(sessionId, type)
  const portalLogId = pendingId
  const time = `${String(eventTimestamp.getHours()).padStart(2, '0')}:${String(eventTimestamp.getMinutes()).padStart(2, '0')}`
  const status = isException ? ATTENDANCE_STATUS_PENDING_EXCEPTION : ATTENDANCE_STATUS_PENDING_HR

  const payload = {
    pendingId,
    portalLogId,
    sessionId,
    type,
    status,
    userId: employee.id,
    userName: employee.name || user.name || 'Unknown',
    employeeId: employee.id,
    employeeName: employee.name || user.name || 'Unknown',
    orgId,
    timestamp: serverTimestamp(),
    eventDate: dateKey,
    eventTime: time,
    clientTimestamp: eventTimestamp.toISOString(),
    siteId: site?.id || '',
    siteName: normalizeSiteName(site),
    coordinates: currentCoordinates || null,
    targetCoordinates: targetCoordinates || null,
    distanceMeters: typeof distanceMeters === 'number' ? distanceMeters : null,
    radiusMeters,
    photoUrl: photoUrl || '',
    photoPath: photoPath || '',
    isException,
    exceptionReason: exceptionReason || '',
    approvedBy: null,
    approvedAt: null,
    finalizedBy: null,
    finalizedAt: null,
    rejectedReason: '',
    createdAt: serverTimestamp(),
    createdBy: user.uid,
    minDailyHours: Number(employee.minDailyHours) || 8,
  }

  const batch = writeBatch(db)
  batch.set(pendingAttendanceDoc(orgId, pendingId), payload, { merge: true })
  batch.set(
    employeePortalDoc(orgId, employee.id),
    {
      employeeId: employee.id,
      employeeName: employee.name || user.name || 'Unknown',
      updatedAt: serverTimestamp(),
      updatedBy: user.uid,
    },
    { merge: true }
  )
  batch.set(employeePortalAttendanceLogDoc(orgId, employee.id, portalLogId), payload, { merge: true })
  await batch.commit()
  return { pendingId, portalLogId, sessionId, status }
}

export async function approvePendingAttendance({ orgId, pendingId, approver }) {
  const pendingRef = pendingAttendanceDoc(orgId, pendingId)
  const snapshot = await getDoc(pendingRef)
  if (!snapshot.exists()) throw new Error('Pending attendance record not found.')
  const row = snapshot.data()
  if (row.status === ATTENDANCE_STATUS_REJECTED) {
    throw new Error('Rejected records cannot be approved directly.')
  }
  await Promise.all([
    updateDoc(pendingRef, {
      status: ATTENDANCE_STATUS_APPROVED_WAITING_FINALIZE,
      approvedBy: approver?.uid || '',
      approvedByName: approver?.name || approver?.email || 'HR',
      approvedAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      updatedBy: approver?.uid || '',
    }),
    updateDoc(employeePortalAttendanceLogDoc(orgId, row.employeeId, row.portalLogId), {
      status: ATTENDANCE_STATUS_APPROVED_WAITING_FINALIZE,
      approvedBy: approver?.uid || '',
      approvedByName: approver?.name || approver?.email || 'HR',
      approvedAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      updatedBy: approver?.uid || '',
    }),
  ])
}

export async function rejectPendingAttendance({ orgId, pendingId, approver, reason }) {
  const pendingRef = pendingAttendanceDoc(orgId, pendingId)
  const snapshot = await getDoc(pendingRef)
  if (!snapshot.exists()) throw new Error('Pending attendance record not found.')
  const row = snapshot.data()
  const rejectedReason = String(reason || '').trim()
  if (!rejectedReason) throw new Error('Rejection reason is required.')
  await Promise.all([
    updateDoc(pendingRef, {
      status: ATTENDANCE_STATUS_REJECTED,
      rejectedReason,
      rejectedBy: approver?.uid || '',
      rejectedByName: approver?.name || approver?.email || 'HR',
      rejectedAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      updatedBy: approver?.uid || '',
    }),
    updateDoc(employeePortalAttendanceLogDoc(orgId, row.employeeId, row.portalLogId), {
      status: ATTENDANCE_STATUS_REJECTED,
      rejectedReason,
      rejectedBy: approver?.uid || '',
      rejectedByName: approver?.name || approver?.email || 'HR',
      rejectedAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      updatedBy: approver?.uid || '',
    }),
  ])
}

function applyPendingEventToAttendanceRow(baseRow, pendingRow) {
  const nextRow = { ...(baseRow || {}) }
  nextRow.employeeId = pendingRow.employeeId
  nextRow.name = pendingRow.employeeName
  nextRow.date = pendingRow.eventDate
  nextRow.status = 'Present'
  nextRow.isAbsent = false
  nextRow.sundayWorked = false
  nextRow.sundayHoliday = false
  nextRow.minDailyHours = pendingRow.minDailyHours || nextRow.minDailyHours || 8

  if (pendingRow.type === ATTENDANCE_EVENT_IN) {
    nextRow.inDate = pendingRow.eventDate
    nextRow.inTime = pendingRow.eventTime
  }
  if (pendingRow.type === ATTENDANCE_EVENT_OUT) {
    nextRow.outDate = pendingRow.eventDate
    nextRow.outTime = pendingRow.eventTime
  }

  if (nextRow.inTime && nextRow.outTime) {
    nextRow.otHours = calcOT(
      nextRow.inTime,
      nextRow.outTime,
      nextRow.inDate || nextRow.date,
      nextRow.outDate || nextRow.date,
      nextRow.minDailyHours || 8
    )
  } else {
    nextRow.otHours = nextRow.otHours || '00:00'
  }

  return nextRow
}

export async function finalizePendingAttendance({ orgId, pendingId, approver }) {
  const pendingRef = pendingAttendanceDoc(orgId, pendingId)
  const snapshot = await getDoc(pendingRef)
  if (!snapshot.exists()) throw new Error('Pending attendance record not found.')

  const row = snapshot.data()
  if (row.status !== ATTENDANCE_STATUS_APPROVED_WAITING_FINALIZE) {
    throw new Error('Only approved records can be finalized.')
  }

  const attRef = attendanceDoc(orgId, row.eventDate, row.employeeId)
  const attFinalRef = attendanceFinalDoc(orgId, row.eventDate, row.employeeId)
  const existingAttendanceSnap = await getDoc(attRef)
  const existingAttendance = existingAttendanceSnap.exists() ? existingAttendanceSnap.data() : {}
  const mergedAttendance = applyPendingEventToAttendanceRow(existingAttendance, row)
  const finalAudit = {
    ...row,
    status: ATTENDANCE_STATUS_FINALIZED,
    finalizedBy: approver?.uid || '',
    finalizedByName: approver?.name || approver?.email || 'HR',
    finalizedAt: serverTimestamp(),
    finalizedClientAt: new Date().toISOString(),
  }

  const batch = writeBatch(db)
  batch.set(attRef, {
    ...mergedAttendance,
    updatedAt: serverTimestamp(),
    updatedBy: approver?.uid || '',
    updatedByName: approver?.name || approver?.email || 'HR',
  }, { merge: true })
  batch.set(attFinalRef, {
    ...mergedAttendance,
    finalizedFromPendingId: pendingId,
    finalizedAt: serverTimestamp(),
    finalizedBy: approver?.uid || '',
    finalizedByName: approver?.name || approver?.email || 'HR',
  }, { merge: true })
  batch.update(employeePortalAttendanceLogDoc(orgId, row.employeeId, row.portalLogId), {
    status: ATTENDANCE_STATUS_FINALIZED,
    finalizedBy: approver?.uid || '',
    finalizedByName: approver?.name || approver?.email || 'HR',
    finalizedAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    updatedBy: approver?.uid || '',
  })
  batch.delete(pendingRef)
  await batch.commit()

  if (row.photoPath) {
    try {
      await deleteObject(ref(storage, row.photoPath))
    } catch (error) {
      console.warn('Failed to delete temporary selfie after finalization:', error)
    }
  }

  return finalAudit
}

