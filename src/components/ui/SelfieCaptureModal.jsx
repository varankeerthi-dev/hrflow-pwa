import React, { useEffect, useRef, useState } from 'react'
import Modal from './Modal'

export default function SelfieCaptureModal({
  isOpen,
  onClose,
  onConfirm,
  title = 'Capture Selfie',
  helperText = 'Position your face in the frame and capture clearly.',
  allowCapture = true,
  confirmLabel = 'Use Photo',
}) {
  const videoRef = useRef(null)
  const streamRef = useRef(null)
  const [capturedBlob, setCapturedBlob] = useState(null)
  const [capturedUrl, setCapturedUrl] = useState('')
  const [cameraError, setCameraError] = useState('')
  const [starting, setStarting] = useState(false)

  const stopCamera = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop())
      streamRef.current = null
    }
  }

  const startCamera = async () => {
    if (!isOpen) return
    setStarting(true)
    setCameraError('')
    try {
      const mediaStream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: false,
      })
      streamRef.current = mediaStream
      if (videoRef.current) {
        videoRef.current.srcObject = mediaStream
        await videoRef.current.play()
      }
    } catch (error) {
      setCameraError(error?.message || 'Unable to access camera.')
    } finally {
      setStarting(false)
    }
  }

  useEffect(() => {
    if (!isOpen) {
      stopCamera()
      setCapturedBlob(null)
      setCapturedUrl('')
      setCameraError('')
      return
    }
    startCamera()
    return () => stopCamera()
  }, [isOpen])

  const capture = async () => {
    if (!allowCapture || !videoRef.current) return
    const video = videoRef.current
    if (!video.videoWidth || !video.videoHeight) return

    const canvas = document.createElement('canvas')
    canvas.width = video.videoWidth
    canvas.height = video.videoHeight
    const context = canvas.getContext('2d')
    context.drawImage(video, 0, 0, canvas.width, canvas.height)
    const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', 0.9))
    if (!blob) {
      setCameraError('Failed to capture image. Please retry.')
      return
    }

    setCapturedBlob(blob)
    if (capturedUrl) URL.revokeObjectURL(capturedUrl)
    setCapturedUrl(URL.createObjectURL(blob))
  }

  const retake = () => {
    if (capturedUrl) URL.revokeObjectURL(capturedUrl)
    setCapturedUrl('')
    setCapturedBlob(null)
  }

  const handleConfirm = () => {
    if (!capturedBlob) return
    onConfirm(capturedBlob)
  }

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={title} size="lg">
      <div className="p-5 space-y-4">
        <p className="text-xs text-gray-500">{helperText}</p>
        <div className="rounded-xl border border-gray-200 bg-gray-50 overflow-hidden">
          {capturedUrl ? (
            <img src={capturedUrl} alt="Captured selfie preview" className="w-full h-[300px] object-cover" />
          ) : (
            <video ref={videoRef} className="w-full h-[300px] object-cover bg-black" muted playsInline />
          )}
        </div>

        {cameraError && (
          <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-[11px] text-rose-700">
            {cameraError}
          </div>
        )}

        <div className="flex items-center justify-between gap-2">
          {!capturedBlob ? (
            <button
              type="button"
              onClick={capture}
              disabled={starting || !allowCapture || !!cameraError}
              className={`h-10 px-4 rounded-lg text-xs font-black uppercase tracking-wider transition-all ${
                starting || !allowCapture || !!cameraError
                  ? 'bg-gray-200 text-gray-400 cursor-not-allowed'
                  : 'bg-indigo-600 text-white hover:bg-indigo-700'
              }`}
            >
              Capture
            </button>
          ) : (
            <button
              type="button"
              onClick={retake}
              className="h-10 px-4 rounded-lg bg-gray-100 text-gray-700 text-xs font-black uppercase tracking-wider hover:bg-gray-200"
            >
              Retake
            </button>
          )}

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="h-10 px-4 rounded-lg bg-white border border-gray-200 text-xs font-black uppercase tracking-wider text-gray-600 hover:bg-gray-50"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleConfirm}
              disabled={!capturedBlob}
              className={`h-10 px-4 rounded-lg text-xs font-black uppercase tracking-wider ${
                capturedBlob ? 'bg-emerald-600 text-white hover:bg-emerald-700' : 'bg-gray-200 text-gray-400 cursor-not-allowed'
              }`}
            >
              {confirmLabel}
            </button>
          </div>
        </div>
      </div>
    </Modal>
  )
}

