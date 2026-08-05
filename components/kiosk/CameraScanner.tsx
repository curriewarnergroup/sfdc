'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import { BrowserMultiFormatReader } from '@zxing/browser'
import { DecodeHintType, BarcodeFormat } from '@zxing/library'
import { X, SwitchCamera } from 'lucide-react'

interface CameraScannerProps {
  /** Called with the decoded text when a barcode/QR is read successfully */
  onScan: (text: string) => void
  /** Called when the user closes the scanner without scanning */
  onClose: () => void
  /** Label shown at the top of the scanner (e.g. "Operator ID") */
  label?: string
}

/**
 * CameraScanner — full-screen camera overlay that reads 1D barcodes and QR codes
 * using the device camera via @zxing/browser. On a successful scan it fires
 * onScan() once and the parent closes the overlay (returns to the same screen).
 */
export function CameraScanner({ onScan, onClose, label }: CameraScannerProps) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const controlsRef = useRef<{ stop: () => void } | null>(null)
  const scannedRef = useRef(false)
  const [error, setError] = useState('')
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([])
  const [deviceIndex, setDeviceIndex] = useState(0)

  const stop = useCallback(() => {
    try {
      controlsRef.current?.stop()
    } catch {
      /* noop */
    }
    controlsRef.current = null
  }, [])

  // Enumerate cameras once on mount
  useEffect(() => {
    let cancelled = false
    BrowserMultiFormatReader.listVideoInputDevices()
      .then((list) => {
        if (cancelled) return
        setDevices(list)
        // Prefer the rear/environment camera if we can detect it by label
        const rearIdx = list.findIndex((d) => /back|rear|environment/i.test(d.label))
        if (rearIdx > 0) setDeviceIndex(rearIdx)
      })
      .catch(() => {
        if (!cancelled) setError('Unable to access cameras. Check permissions.')
      })
    return () => {
      cancelled = true
    }
  }, [])

  // Start decoding whenever the selected device changes.
  // Wait until the camera list has loaded so we start exactly once with the
  // correct device — starting early with a fallback stream and then restarting
  // leaves the <video> bound to a stopped stream (blank feed until you switch).
  useEffect(() => {
    if (devices.length === 0) return

    scannedRef.current = false
    setError('')

    const hints = new Map()
    hints.set(DecodeHintType.POSSIBLE_FORMATS, [
      BarcodeFormat.QR_CODE,
      BarcodeFormat.CODE_128,
      BarcodeFormat.CODE_39,
      BarcodeFormat.CODE_93,
      BarcodeFormat.EAN_13,
      BarcodeFormat.EAN_8,
      BarcodeFormat.UPC_A,
      BarcodeFormat.UPC_E,
      BarcodeFormat.ITF,
      BarcodeFormat.CODABAR,
      BarcodeFormat.DATA_MATRIX,
    ])
    const reader = new BrowserMultiFormatReader(hints)

    const deviceId = devices[deviceIndex]?.deviceId
    const constraints: MediaStreamConstraints = deviceId
      ? { video: { deviceId: { exact: deviceId } } }
      : { video: { facingMode: 'environment' } }

    let active = true
    reader
      .decodeFromConstraints(constraints, videoRef.current!, (result) => {
        if (!active || scannedRef.current) return
        if (result) {
          scannedRef.current = true
          const text = result.getText()
          stop()
          onScan(text)
        }
      })
      .then((controls) => {
        if (!active) {
          controls.stop()
          return
        }
        controlsRef.current = controls
      })
      .catch((err) => {
        if (!active) return
        console.log('[v0] CameraScanner decode error:', err?.message)
        setError('Camera failed to start. Grant camera permission and try again.')
      })

    return () => {
      active = false
      stop()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [devices, deviceIndex])

  const handleClose = useCallback(() => {
    stop()
    onClose()
  }, [stop, onClose])

  const handleSwitchCamera = useCallback(() => {
    if (devices.length < 2) return
    stop()
    setDeviceIndex((i) => (i + 1) % devices.length)
  }, [devices.length, stop])

  return (
    <div className="fixed inset-0 z-[100] flex flex-col bg-black">
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-4 bg-black/80 text-white">
        <div className="flex flex-col">
          <span className="text-xs uppercase tracking-widest text-white/60">Scanning</span>
          {label && <span className="text-base font-bold">{label}</span>}
        </div>
        <div className="flex items-center gap-2">
          {devices.length > 1 && (
            <button
              type="button"
              onClick={handleSwitchCamera}
              aria-label="Switch camera"
              className="w-11 h-11 flex items-center justify-center rounded-xl bg-white/10 hover:bg-white/20 transition-colors"
            >
              <SwitchCamera size={20} />
            </button>
          )}
          <button
            type="button"
            onClick={handleClose}
            aria-label="Close scanner"
            className="w-11 h-11 flex items-center justify-center rounded-xl bg-white/10 hover:bg-white/20 transition-colors"
          >
            <X size={20} />
          </button>
        </div>
      </div>

      {/* Camera viewport */}
      <div className="relative flex-1 overflow-hidden">
        <video
          ref={videoRef}
          className="absolute inset-0 w-full h-full object-cover"
          playsInline
          muted
        />

        {/* Reticle overlay */}
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div className="relative w-4/5 max-w-sm aspect-[3/2]">
            <span className="absolute top-0 left-0 w-10 h-10 border-t-4 border-l-4 border-primary rounded-tl-lg" />
            <span className="absolute top-0 right-0 w-10 h-10 border-t-4 border-r-4 border-primary rounded-tr-lg" />
            <span className="absolute bottom-0 left-0 w-10 h-10 border-b-4 border-l-4 border-primary rounded-bl-lg" />
            <span className="absolute bottom-0 right-0 w-10 h-10 border-b-4 border-r-4 border-primary rounded-br-lg" />
          </div>
        </div>

        {error && (
          <div className="absolute inset-x-0 bottom-0 p-5">
            <div className="rounded-xl bg-status-error/90 text-white px-4 py-3 text-sm font-semibold text-center">
              {error}
            </div>
          </div>
        )}
      </div>

      {/* Footer hint */}
      <div className="px-5 py-4 bg-black/80 text-center">
        <p className="text-sm text-white/70">
          Point the camera at the barcode or QR code. It will scan automatically.
        </p>
      </div>
    </div>
  )
}
