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
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { AlertCircle, Camera, RotateCcw, Square, Upload, Video as VideoIcon, Check } from 'lucide-react'

const RECORD_SECONDS_MAX = 5
const RECORD_SECONDS_MIN = 3
const VIDEO_BITS_PER_SECOND = 500_000  // ~500 kbps → ~200..400 KB / clip

/** Mime types the server accepts for the liveness slot. Mirrors
 *  ALLOWED_VIDEO_MIME in apps/web/src/app/api/kyc/t2/route.ts. */
const ALLOWED_UPLOAD_MIME = [
  'video/mp4',
  'video/webm',
  'video/quicktime',
  'video/3gpp',         // common Android default
  'video/x-matroska',
]

const MAX_UPLOAD_BYTES = 25 * 1024 * 1024  // matches MAX_LIVENESS_BYTES on server

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
  const uploadInputRef = useRef<HTMLInputElement | null>(null)

  const [stage, setStage] = useState<Stage>(file ? 'review' : 'idle')
  const [error, setError] = useState<string | null>(null)
  const [permissionState, setPermissionState] = useState<'unknown' | 'denied'>('unknown')
  const [recordedSeconds, setRecordedSeconds] = useState(0)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [supported, setSupported] = useState<boolean>(true)
  // Tracks whether the current file in review came from a live recording
  // or a fallback upload. Used to (a) label the preview and (b) drive the
  // filename prefix that the admin viewer uses to distinguish the two.
  const [source, setSource] = useState<'recorded' | 'uploaded' | null>(
    file ? (file.name.startsWith('liveness-uploaded') ? 'uploaded' : 'recorded') : null,
  )

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
      setSource('recorded')
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
    setSource(null)
    setStage('idle')
    setRecordedSeconds(0)
    if (uploadInputRef.current) uploadInputRef.current.value = ''
  }

  /** Fallback path for customers whose browser flat-out won't let us open
   *  the camera (Brave on Android, locked-down corporate devices, etc.).
   *  Validates the chosen file against the same mime allow-list + size cap
   *  the server enforces, then short-circuits straight into the review
   *  stage. The filename is renamed with an `liveness-uploaded-` prefix so
   *  the admin reviewer can distinguish uploaded clips from live ones.
   *
   *  This MUST reject images. The accept="video/*" attribute on the input
   *  is just a hint — many platforms let users override it, and some
   *  Android galleries don't set the mime type at all on picked files. So
   *  we double-gate: require either a recognised video mime OR a video
   *  file extension; never both empty. The server enforces the same
   *  allow-list as defence in depth. */
  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const picked = e.target.files?.[0]
    if (!picked) return
    setError(null)

    const mime = (picked.type || '').split(';')[0]?.trim().toLowerCase() || ''
    const ext = (picked.name.split('.').pop() || '').toLowerCase()
    const VIDEO_EXTS = new Set(['mp4', 'webm', 'mov', 'qt', 'mkv', '3gp', '3gpp', 'm4v'])

    // Hard-reject anything whose mime says image/audio/anything-non-video.
    if (mime && !mime.startsWith('video/')) {
      toast.error(`That looks like a${mime.startsWith('image/') ? 'n image' : ''} ${mime || 'file'} — please pick a video clip (MP4, WebM, MOV, MKV, or 3GP).`)
      e.target.value = ''
      return
    }
    // Mime present and IS video/* — must be on the allow-list.
    if (mime && !ALLOWED_UPLOAD_MIME.includes(mime)) {
      toast.error(`Unsupported video format (${mime}). Use MP4, WebM, MOV, MKV, or 3GP.`)
      e.target.value = ''
      return
    }
    // Some Android browsers + corp-MDM file pickers strip the mime
    // entirely. Fall back to the extension; if neither is a video
    // signal, refuse — we don't want an image renamed to "selfie.jpg"
    // sliding into the liveness slot just because mime was missing.
    if (!mime && !VIDEO_EXTS.has(ext)) {
      toast.error('Please pick a video file (MP4, WebM, MOV, MKV, or 3GP). Images are not allowed for liveness.')
      e.target.value = ''
      return
    }
    if (picked.size > MAX_UPLOAD_BYTES) {
      const mb = (picked.size / (1024 * 1024)).toFixed(1)
      toast.error(`Video too large (${mb} MB). Keep it under 25 MB — trim to 5–10 seconds.`)
      e.target.value = ''
      return
    }

    // Tear down the live camera stream if one was running — we're skipping
    // straight to review.
    stopEverything()

    // Pick the safest mime tag for the renamed File: prefer the picker's
    // mime, otherwise infer from the extension. Never default to a guess
    // that contradicts what we just validated.
    const finalExt = VIDEO_EXTS.has(ext) ? ext : 'mp4'
    const inferredMime: Record<string, string> = {
      mp4: 'video/mp4', m4v: 'video/mp4',
      webm: 'video/webm',
      mov: 'video/quicktime', qt: 'video/quicktime',
      mkv: 'video/x-matroska',
      '3gp': 'video/3gpp', '3gpp': 'video/3gpp',
    }
    const finalMime = mime || inferredMime[finalExt] || 'video/mp4'
    const filename = `liveness-uploaded-${Date.now()}.${finalExt}`
    const renamed = new File([picked], filename, { type: finalMime })
    onChange(renamed)
    setSource('uploaded')
    setStage('review')
    e.target.value = ''
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
          record live · or upload a clip
        </span>
      </div>
      <p className="text-xs text-muted-foreground">{hint}</p>

      {/* Proactive heads-up — shown before any denial happens so the
          customer knows what's coming. Only renders in the camera-not-
          yet-active stages (idle / preview); review / recording stages
          have already cleared the permission so the hint isn't useful
          there. The denied panel below replaces this when permission
          is actually blocked. */}
      {(stage === 'idle' || stage === 'preview') && error !== 'camera_denied' && (
        <div className="rounded-lg border border-blue-200 bg-blue-50/60 dark:border-blue-900 dark:bg-blue-950/20 px-3 py-2.5 text-xs text-blue-900 dark:text-blue-200 leading-relaxed">
          <p className="font-medium mb-1">📷 Your browser will ask for camera + microphone</p>
          <p className="opacity-90">
            Tap <span className="font-medium">Allow</span> when the prompt appears. If you accidentally tap Block, see the steps below.
          </p>
          <details className="mt-1.5">
            <summary className="cursor-pointer text-blue-700 dark:text-blue-300 hover:underline select-none">
              How to unblock if you tapped Block
            </summary>
            <div className="mt-2 rounded-md bg-white dark:bg-black/30 p-2.5 space-y-2">
              {isAndroid() ? (
                <ol className="list-decimal list-inside space-y-0.5 ml-1">
                  <li>Tap the <span className="font-medium">lock icon</span> at the left of the address bar</li>
                  <li>Tap <span className="font-medium">Permissions</span> (or <span className="font-medium">Site settings</span>)</li>
                  <li>Set <span className="font-medium">Camera</span> + <span className="font-medium">Microphone</span> to <span className="font-medium">Allow</span></li>
                  <li>Come back to this tab and tap <span className="font-medium">Retry camera</span></li>
                </ol>
              ) : isIOS() ? (
                <ol className="list-decimal list-inside space-y-0.5 ml-1">
                  <li>Tap the <span className="font-medium">aA</span> icon at the left of the address bar</li>
                  <li>Tap <span className="font-medium">Website Settings</span></li>
                  <li>Set <span className="font-medium">Camera</span> + <span className="font-medium">Microphone</span> to <span className="font-medium">Allow</span></li>
                  <li>Reload the page</li>
                </ol>
              ) : (
                <ol className="list-decimal list-inside space-y-0.5 ml-1">
                  <li>Click the <span className="font-medium">camera</span> or <span className="font-medium">lock</span> icon in the address bar</li>
                  <li>Set <span className="font-medium">Camera</span> + <span className="font-medium">Microphone</span> to <span className="font-medium">Allow</span></li>
                  <li>Reload the page</li>
                </ol>
              )}
              {isBrave() && (
                <p className="border-t border-blue-200/60 dark:border-blue-900/40 pt-1.5 text-[11px]">
                  <span className="font-semibold">🦁 Brave:</span> the Shields icon (lion) might also block the camera — toggle Shields off for this site if the steps above don&rsquo;t work.
                </p>
              )}
            </div>
          </details>
        </div>
      )}

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
        {/* Upload-video fallback. Available across every pre-review stage
            so a customer whose browser blocks the camera entirely can
            still complete KYC by sending a clip from their gallery. */}
        {(stage === 'idle' || stage === 'preview' || stage === 'recording') && (
          <Button
            onClick={() => uploadInputRef.current?.click()}
            type="button"
            variant="outline"
            className="gap-2"
          >
            <Upload className="h-4 w-4" />
            Upload video instead
          </Button>
        )}
        {stage === 'review' && (
          <>
            <span className="inline-flex items-center gap-1.5 rounded-md bg-emerald-100 px-2.5 py-1 text-xs font-medium text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-400">
              <Check className="h-3 w-3" />
              {source === 'uploaded' ? 'Uploaded — preview above' : 'Recorded — preview above'}
            </span>
            <Button onClick={rerecord} type="button" variant="outline" className="gap-2">
              <RotateCcw className="h-4 w-4" />
              {source === 'uploaded' ? 'Replace' : 'Re-record'}
            </Button>
          </>
        )}
        <input
          ref={uploadInputRef}
          type="file"
          accept={ALLOWED_UPLOAD_MIME.join(',')}
          className="sr-only"
          onChange={handleUpload}
        />
      </div>

      {stage === 'preview' && (
        <p className="text-xs text-muted-foreground">
          When you hit Record, look at the camera and clearly say your full name and today’s date.
        </p>
      )}
    </div>
  )
}
