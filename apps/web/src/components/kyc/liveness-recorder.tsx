'use client'

/**
 * <LivenessRecorder>
 *
 * Replaces the file-upload widget for the KYC liveness slot with a
 * browser-side camera recorder. Goals:
 *
 *   - The customer cannot upload a pre-recorded file. They have to
 *     point their phone/laptop's front camera at their face and hit
 *     record. This makes "took a screenshot of an old photo and called
 *     it a liveness video" impossible client-side. (Server-side defence
 *     is the video-only mime check in /api/kyc/t2.)
 *   - The captured clip is small. We cap recording at 5 seconds and use
 *     a 500 kbps video bitrate target — output is typically 200..400 KB.
 *     The VPS doesn't end up with multi-MB liveness videos eating disk.
 *   - Output is browser-native: WebM on Chromium/Firefox, MP4 on iOS
 *     Safari (which only supports MP4 for MediaRecorder). The server
 *     accepts both — see /api/kyc/t2's ALLOWED_VIDEO_MIME.
 *   - Customer can preview before accepting — shows a controls=true
 *     <video> with the just-recorded blob. "Re-record" wipes and goes
 *     back to live preview.
 *
 * The component is fully self-contained and only surfaces a single
 * `onChange(File | null)` to its parent, mirroring the FileUpload API
 * the KYC form already uses for ID/selfie/proof-of-address.
 */

import { useEffect, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { AlertCircle, Camera, RotateCcw, Square, Video as VideoIcon, Check } from 'lucide-react'

const RECORD_SECONDS_MAX = 5
const RECORD_SECONDS_MIN = 3
const VIDEO_BITS_PER_SECOND = 500_000  // ~500 kbps → ~200..400 KB / clip

interface Props {
  label: string
  hint: string
  file: File | null
  onChange: (f: File | null) => void
}

type Stage =
  | 'idle'        // waiting for user to grant camera + click "Start"
  | 'preview'    // camera live, "Record" button armed
  | 'recording'  // MediaRecorder active, countdown ticking
  | 'review'     // recording done, customer can replay + accept/redo

export function LivenessRecorder({ label, hint, file, onChange }: Props) {
  const liveVideoRef = useRef<HTMLVideoElement | null>(null)
  const replayVideoRef = useRef<HTMLVideoElement | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const recorderRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const tickerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const [stage, setStage] = useState<Stage>(file ? 'review' : 'idle')
  const [error, setError] = useState<string | null>(null)
  const [permissionState, setPermissionState] = useState<'unknown' | 'denied'>('unknown')
  const [recordedSeconds, setRecordedSeconds] = useState(0)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [supported, setSupported] = useState<boolean>(true)

  // ── Capability check on mount ────────────────────────────────────────────
  useEffect(() => {
    if (typeof navigator === 'undefined') return
    const ok =
      typeof navigator.mediaDevices !== 'undefined' &&
      typeof navigator.mediaDevices.getUserMedia === 'function' &&
      typeof window.MediaRecorder !== 'undefined'
    setSupported(ok)
  }, [])

  // ── Auto-prompt camera permission on first load ─────────────────────────
  // Customers were getting stuck on a "Start camera" button + then a
  // "permission denied" error if they tapped it after the prompt timed
  // out. Trigger the prompt as soon as the recorder mounts so it's
  // visually obvious what's happening — no extra step. We only do this
  // when the customer hasn't already recorded a clip (file === null) and
  // we haven't yet hit a permission failure.
  useEffect(() => {
    if (!supported) return
    if (file) return                            // already recorded → review stage
    if (stage !== 'idle') return                // already in flight
    if (permissionState === 'denied') return    // user said no, don't loop
    void startCamera()
    // We deliberately depend on `supported` only — we want this to fire
    // exactly once per mount, not every time `stage` ticks through.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [supported])

  // ── Build a preview URL whenever we have a file (for the review stage) ──
  useEffect(() => {
    if (!file) { setPreviewUrl(null); return }
    const url = URL.createObjectURL(file)
    setPreviewUrl(url)
    return () => URL.revokeObjectURL(url)
  }, [file])

  // ── Tear down camera + ticker on unmount or when leaving recording ──────
  useEffect(() => {
    return () => stopEverything()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function stopEverything() {
    if (tickerRef.current) {
      clearInterval(tickerRef.current)
      tickerRef.current = null
    }
    if (recorderRef.current && recorderRef.current.state !== 'inactive') {
      try { recorderRef.current.stop() } catch { /* swallow */ }
    }
    recorderRef.current = null
    if (streamRef.current) {
      for (const track of streamRef.current.getTracks()) track.stop()
      streamRef.current = null
    }
  }

  async function startCamera() {
    setError(null)
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: 'user',                // front camera
          width: { ideal: 480 },             // small frame keeps file size tiny
          height: { ideal: 480 },
        },
        audio: true,                         // capture voice — customer says name + date
      })
      streamRef.current = stream
      if (liveVideoRef.current) {
        liveVideoRef.current.srcObject = stream
        await liveVideoRef.current.play().catch(() => { /* ignore play interrupted */ })
      }
      setStage('preview')
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      const name = err instanceof Error ? err.name : ''
      // Translate the most common failures into something a customer can act on.
      if (name === 'NotAllowedError' || msg.includes('NotAllowed') || /denied|permission/i.test(msg)) {
        // Browser said no. Could be: user tapped Block in the prompt,
        // browser-level setting blocks camera for the site, or (Brave)
        // Shields blocking. Mark the state so the auto-prompt useEffect
        // doesn't spam the user, and surface a Retry button + browser-
        // specific tip in the UI.
        setPermissionState('denied')
        setError('camera_denied')
      } else if (name === 'NotFoundError' || msg.includes('NotFound') || /no.*camera/i.test(msg)) {
        setError('No camera detected on this device. Use a phone or a laptop with a webcam.')
      } else if (name === 'NotReadableError' || msg.includes('NotReadable') || /in use/i.test(msg)) {
        setError('Camera is already in use by another app. Close it and try again.')
      } else {
        setError(`Couldn’t start the camera: ${msg}`)
      }
      setStage('idle')
    }
  }

  /** Detect Brave so we can surface a Shields-specific tip when camera
   *  access is blocked — Brave often quietly blocks getUserMedia even
   *  when the prompt UI looks normal. */
  function isBrave(): boolean {
    if (typeof navigator === 'undefined') return false
    // navigator.brave.isBrave() is the official check, present on
    // recent Brave versions. We coerce to boolean for safety.
    const nav = navigator as unknown as { brave?: { isBrave?: () => Promise<boolean> } }
    return typeof nav.brave?.isBrave === 'function'
      || /Brave/i.test(navigator.userAgent ?? '')
  }

  /** Mobile-platform detection so we can show the right unblock-
   *  permission steps. Android + iOS each have their own settings UX
   *  and the desktop fallback is different again. */
  function isAndroid(): boolean {
    if (typeof navigator === 'undefined') return false
    return /android/i.test(navigator.userAgent ?? '')
  }
  function isIOS(): boolean {
    if (typeof navigator === 'undefined') return false
    const ua = navigator.userAgent ?? ''
    // iPadOS reports as "Macintosh" + touch — second clause catches that.
    return /iphone|ipad|ipod/i.test(ua)
      || (/macintosh/i.test(ua) && typeof document !== 'undefined' && 'ontouchend' in document)
  }

  function startRecording() {
    if (!streamRef.current) return
    setError(null)
    chunksRef.current = []
    setRecordedSeconds(0)

    // Pick the best mime type the browser actually supports. Chromium and
    // Firefox prefer WebM; iOS Safari only ships MP4. We try in this order.
    const candidates = [
      'video/webm;codecs=vp9,opus',
      'video/webm;codecs=vp8,opus',
      'video/webm',
      'video/mp4',
    ]
    const mimeType = candidates.find((m) => MediaRecorder.isTypeSupported(m)) || ''

    let recorder: MediaRecorder
    try {
      recorder = new MediaRecorder(streamRef.current, {
        mimeType: mimeType || undefined,
        videoBitsPerSecond: VIDEO_BITS_PER_SECOND,
      })
    } catch (err) {
      setError(`Recorder failed to start: ${err instanceof Error ? err.message : err}`)
      return
    }

    recorder.ondataavailable = (e) => {
      if (e.data && e.data.size > 0) chunksRef.current.push(e.data)
    }
    recorder.onstop = () => {
      const finalMime = recorder.mimeType || mimeType || 'video/webm'
      const blob = new Blob(chunksRef.current, { type: finalMime })
      chunksRef.current = []
      const ext = finalMime.includes('mp4') ? 'mp4' : 'webm'
      const filename = `liveness-${Date.now()}.${ext}`
      // Some browsers report the blob mime with the codec params attached
      // ("video/webm;codecs=vp9,opus"). Strip the codec so the server's
      // simple Set lookup against ALLOWED_VIDEO_MIME hits.
      const cleanMime = finalMime.split(';')[0]?.trim() || finalMime
      const f = new File([blob], filename, { type: cleanMime })
      // Hand the file up to the parent and tear down the live stream;
      // the review stage doesn't need the camera open.
      onChange(f)
      stopEverything()
      setStage('review')
    }

    recorder.start()
    recorderRef.current = recorder
    setStage('recording')

    // Drive the on-screen seconds counter + auto-stop at the cap.
    tickerRef.current = setInterval(() => {
      setRecordedSeconds((prev) => {
        const next = prev + 1
        if (next >= RECORD_SECONDS_MAX) {
          stopRecording()
        }
        return next
      })
    }, 1000)
  }

  function stopRecording() {
    if (recordedSeconds < RECORD_SECONDS_MIN) {
      // Allow it but warn — anything under 3s is rarely useful for review.
      // (We don't block: some customers have slow connections and even a
      // truncated recording is better than none for the admin.)
    }
    if (tickerRef.current) {
      clearInterval(tickerRef.current)
      tickerRef.current = null
    }
    if (recorderRef.current && recorderRef.current.state !== 'inactive') {
      try { recorderRef.current.stop() } catch { /* swallow */ }
    }
  }

  function rerecord() {
    onChange(null)
    setStage('idle')
    setRecordedSeconds(0)
  }

  // ── Render ──────────────────────────────────────────────────────────────

  if (!supported) {
    return (
      <div className="space-y-1.5">
        <Label>{label}</Label>
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            Your browser doesn’t support live video recording. Open this page on the latest
            Chrome, Safari, or Firefox — or on the FrenzPay mobile app — to complete this step.
          </AlertDescription>
        </Alert>
      </div>
    )
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <Label>{label}</Label>
        <span className="text-xs text-muted-foreground">
          live recording · max {RECORD_SECONDS_MAX} s
        </span>
      </div>
      <p className="text-xs text-muted-foreground">{hint}</p>

      {/* When camera was denied we show a richer panel with platform-
          specific unblock instructions + Retry button. Other errors
          fall through to the normal red Alert below. */}
      {error === 'camera_denied' ? (
        <div className="rounded-lg border border-red-300/70 bg-red-50/70 dark:border-red-900 dark:bg-red-950/20 px-4 py-3 space-y-3">
          <div className="flex items-start gap-2">
            <AlertCircle className="h-4 w-4 mt-0.5 text-red-600" />
            <div>
              <p className="text-sm font-medium text-red-900 dark:text-red-200">Camera access blocked</p>
              <p className="text-xs text-red-900/80 dark:text-red-300/90 mt-0.5 leading-relaxed">
                Your browser is blocking camera + microphone for this page. Follow the steps below for your device, then tap <span className="font-medium">Retry</span>.
              </p>
            </div>
          </div>

          {/* Always-visible step list — shown to every browser, with the
              right one for the user's platform highlighted at the top. */}
          <div className="rounded-md bg-white dark:bg-black/30 p-3 text-xs text-red-900 dark:text-red-200 space-y-2.5 leading-relaxed">
            {isAndroid() && (
              <div>
                <p className="font-semibold mb-1">📱 Android (Chrome / Brave / Edge)</p>
                <ol className="list-decimal list-inside space-y-0.5 ml-1">
                  <li>Tap the <span className="font-medium">lock icon</span> on the left of the address bar</li>
                  <li>Tap <span className="font-medium">Permissions</span> (or <span className="font-medium">Site settings</span>)</li>
                  <li>Set <span className="font-medium">Camera</span> and <span className="font-medium">Microphone</span> to <span className="font-medium">Allow</span></li>
                  <li>Come back to this tab and tap <span className="font-medium">Retry camera</span></li>
                </ol>
              </div>
            )}

            {isIOS() && (
              <div>
                <p className="font-semibold mb-1">📱 iPhone (Safari)</p>
                <ol className="list-decimal list-inside space-y-0.5 ml-1">
                  <li>Tap the <span className="font-medium">aA</span> icon on the left of the address bar</li>
                  <li>Tap <span className="font-medium">Website Settings</span></li>
                  <li>Set <span className="font-medium">Camera</span> + <span className="font-medium">Microphone</span> to <span className="font-medium">Allow</span></li>
                  <li>Reload the page</li>
                </ol>
              </div>
            )}

            {!isAndroid() && !isIOS() && (
              <div>
                <p className="font-semibold mb-1">💻 Desktop browser</p>
                <ol className="list-decimal list-inside space-y-0.5 ml-1">
                  <li>Click the <span className="font-medium">camera</span> or <span className="font-medium">lock</span> icon at the left of the address bar</li>
                  <li>Set <span className="font-medium">Camera</span> + <span className="font-medium">Microphone</span> to <span className="font-medium">Allow</span></li>
                  <li>Reload the page</li>
                </ol>
              </div>
            )}

            {isBrave() && (
              <div className="border-t border-red-200/60 dark:border-red-900/40 pt-2">
                <p className="font-semibold mb-1">🦁 Brave extra step</p>
                <p>Brave Shields can also block the camera. Tap the lion icon → toggle <span className="font-medium">Shields</span> off for this site → reload.</p>
              </div>
            )}

            <div className="border-t border-red-200/60 dark:border-red-900/40 pt-2 text-[11px] opacity-80">
              Still stuck? Open <span className="font-mono">frenzpay.co/dashboard/kyc</span> on a different device (phone with front camera works best).
            </div>
          </div>

          <div className="flex justify-end">
            <Button
              type="button"
              size="sm"
              onClick={() => { setError(null); setPermissionState('unknown'); void startCamera() }}
            >
              <RotateCcw className="h-3.5 w-3.5 mr-1.5" />
              Retry camera
            </Button>
          </div>
        </div>
      ) : error ? (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}

      <div className="rounded-lg border bg-black/90 overflow-hidden aspect-video relative">
        {/* Live preview — only shown while we're not in 'review' */}
        {stage !== 'review' && (
          <video
            ref={liveVideoRef}
            playsInline
            muted
            autoPlay
            className="h-full w-full object-cover"
          />
        )}
        {stage === 'review' && previewUrl && (
          <video
            ref={replayVideoRef}
            src={previewUrl}
            playsInline
            controls
            className="h-full w-full object-contain bg-black"
          />
        )}
        {stage === 'recording' && (
          <div className="absolute top-2 right-2 flex items-center gap-1.5 rounded-full bg-red-600 px-2.5 py-1 text-[11px] font-medium text-white shadow">
            <span className="inline-block size-2 animate-pulse rounded-full bg-white" />
            REC · {recordedSeconds}s
          </div>
        )}
        {stage === 'idle' && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-white/90">
            <Camera className="h-8 w-8" />
            <p className="text-sm">
              {permissionState === 'denied'
                ? 'Camera blocked'
                : 'Loading camera…'}
            </p>
          </div>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {/* "Start camera" button now only appears as a manual retry path
            when the auto-prompt has been blocked. Otherwise the camera
            comes up on its own and we go straight to 'preview'. */}
        {stage === 'idle' && permissionState === 'denied' && (
          <Button onClick={startCamera} type="button" className="gap-2">
            <Camera className="h-4 w-4" />
            Start camera
          </Button>
        )}
        {stage === 'preview' && (
          <Button onClick={startRecording} type="button" variant="destructive" className="gap-2">
            <VideoIcon className="h-4 w-4" />
            Record (3–5 s)
          </Button>
        )}
        {stage === 'recording' && (
          <Button onClick={stopRecording} type="button" variant="secondary" className="gap-2">
            <Square className="h-4 w-4" />
            Stop
          </Button>
        )}
        {stage === 'review' && (
          <>
            <span className="inline-flex items-center gap-1.5 rounded-md bg-emerald-100 px-2.5 py-1 text-xs font-medium text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-400">
              <Check className="h-3 w-3" />
              Recorded — preview above
            </span>
            <Button onClick={rerecord} type="button" variant="outline" className="gap-2">
              <RotateCcw className="h-4 w-4" />
              Re-record
            </Button>
          </>
        )}
      </div>

      {stage === 'preview' && (
        <p className="text-xs text-muted-foreground">
          When you hit Record, look at the camera and clearly say your full name and today’s date.
        </p>
      )}
    </div>
  )
}
