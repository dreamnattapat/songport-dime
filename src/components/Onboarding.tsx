import {
  Camera,
  Check,
  Eye,
  FileLock2,
  FileUp,
  LaptopMinimal,
  LockKeyhole,
  Mail,
  Server,
  ShieldCheck,
  X,
} from 'lucide-react'
import { useRef, useState, type ReactNode } from 'react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Progress } from '@/components/ui/progress'
import { formatBirthdate, formatBirthdateInput, parseBirthdate } from '@/lib/birthdate'
import { EMAIL_SUBJECT } from '@/lib/google/gmail'
import type { SyncProgress } from '@/lib/sync'

export type Step = 1 | 2 | 3

const STEPS = ['หาไฟล์จาก Dime!', 'ใส่วันเกิด', 'ดูพอร์ต'] as const

/** Where the user is in connect → birthdate → dashboard. */
export function Stepper({ current }: { current: Step }) {
  return (
    <ol className="grid grid-cols-3 gap-2" aria-label="ขั้นตอน">
      {STEPS.map((label, i) => {
        const step = (i + 1) as Step
        const done = step < current
        const active = step === current
        return (
          <li key={label} className="space-y-2" aria-current={active ? 'step' : undefined}>
            <div className={`h-1 rounded-full ${done || active ? 'bg-brand' : 'bg-border'}`} />
            <div className="flex items-center gap-2">
              <span
                className={`flex size-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold ${
                  done
                    ? 'bg-brand text-white'
                    : active
                      ? 'border-brand text-brand border-2'
                      : 'bg-muted text-muted-foreground'
                }`}
              >
                {done ? <Check className="size-3.5" aria-label="เสร็จแล้ว" /> : step}
              </span>
              <span className={`text-sm leading-tight ${active ? 'font-semibold' : 'text-muted-foreground'}`}>
                {label}
              </span>
            </div>
          </li>
        )
      })}
    </ol>
  )
}

export function StepPanel({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="bg-card space-y-5 rounded-3xl p-6 shadow-[0_1px_2px_rgb(120_60_20/0.06),0_8px_24px_rgb(120_60_20/0.07)] sm:p-8">
      <h2 className="font-display text-xl font-medium">{title}</h2>
      {children}
    </section>
  )
}

export function ConnectStep({
  onConnect,
  onFiles,
  onScreenshots,
  connecting,
  disabled,
}: {
  onConnect: () => void
  onFiles: (files: File[]) => void
  onScreenshots: (files: File[]) => void
  connecting: boolean
  disabled: boolean
}) {
  const pdfInput = useRef<HTMLInputElement>(null)
  const shotInput = useRef<HTMLInputElement>(null)
  const [over, setOver] = useState(false)
  const takePdfs = (list: FileList | null) => {
    const files = [...(list ?? [])].filter((f) => f.type === 'application/pdf' || f.name.toLowerCase().endsWith('.pdf'))
    if (files.length) onFiles(files)
  }
  return (
    <StepPanel title="อ่านใบยืนยันการซื้อขาย">
      <p className="text-muted-foreground -mt-2 text-sm">เลือก 1 จาก 3 วิธี ได้ผลเหมือนกัน ทุกอย่างอ่านในเครื่องนี้</p>
      <div className="space-y-3">
        <OptionCard
          icon={<FileUp />}
          title="ไฟล์ PDF"
          badge="ไม่ต้องเชื่อมอีเมล"
          description="ไฟล์ที่แนบมาในอีเมลยืนยันการซื้อขายของ Dime! เลือกได้ทีละหลายไฟล์ ต้องใช้วันเกิดเปิดไฟล์"
          action="เลือกไฟล์ PDF"
          howto="pdf"
          onAction={() => pdfInput.current?.click()}
          highlight={over}
          dropProps={{
            onDragOver: (e) => {
              e.preventDefault()
              setOver(true)
            },
            onDragLeave: () => setOver(false),
            onDrop: (e) => {
              e.preventDefault()
              setOver(false)
              takePdfs(e.dataTransfer.files)
            },
          }}
        />
        <input
          ref={pdfInput}
          type="file"
          accept="application/pdf,.pdf"
          multiple
          className="hidden"
          onChange={(e) => {
            takePdfs(e.target.files)
            e.target.value = ''
          }}
        />
        <OptionCard
          icon={<Camera />}
          title="ภาพหน้าจอ"
          badge="ไม่ต้องใช้วันเกิด"
          description="แคปหน้า “รายละเอียดคำสั่ง” ในแอป Dime! เว็บอ่านตัวเลขให้ ตรวจแล้วบันทึกทีละคำสั่ง"
          action="อัปโหลดภาพหน้าจอ"
          howto="shot"
          onAction={() => shotInput.current?.click()}
        />
        <input
          ref={shotInput}
          type="file"
          accept="image/*"
          multiple
          className="hidden"
          onChange={(e) => {
            const files = [...(e.target.files ?? [])]
            e.target.value = ''
            if (files.length) onScreenshots(files)
          }}
        />
        <OptionCard
          icon={<Mail />}
          title="Gmail"
          badge="อัตโนมัติ"
          description={`ดึงทุกอีเมลหัวข้อ “${EMAIL_SUBJECT}” ให้เอง สิทธิ์อ่านอย่างเดียว ส่ง ลบ หรือแก้อีเมลไม่ได้ ต้องใช้วันเกิดเปิดไฟล์`}
          action={connecting ? 'กำลังรอ Google…' : 'เชื่อมต่อ Gmail'}
          onAction={onConnect}
          disabled={disabled || connecting}
        >
          <details className="text-muted-foreground text-xs">
            <summary className="cursor-pointer">Google แจ้งว่า “Google ยังไม่ได้ยืนยันแอปนี้” ใช่ไหม?</summary>
            <div className="mt-2 space-y-2">
              <p>
                เป็นเรื่องปกติ เพราะแอปนี้ยังอยู่ระหว่างการตรวจสอบของ Google ให้แตะ <strong>ขั้นสูง (Advanced)</strong>{' '}
                แล้วแตะ <strong>ไปที่ … (ไม่ปลอดภัย)</strong> และอนุญาตให้อ่าน Gmail
              </p>
              <p>
                ยกเลิกสิทธิ์ได้ทุกเมื่อที่{' '}
                <a
                  className="underline underline-offset-2"
                  href="https://myaccount.google.com/connections"
                  target="_blank"
                  rel="noreferrer"
                >
                  บัญชี Google ของคุณ
                </a>
              </p>
            </div>
          </details>
        </OptionCard>
      </div>
    </StepPanel>
  )
}

/** One of the three ways in: the same shape for each, so they read as equal choices. */
function OptionCard({
  icon,
  title,
  badge,
  description,
  action,
  onAction,
  disabled,
  highlight,
  dropProps,
  howto,
  children,
}: {
  /** A short screen recording of this way in, e.g. 'pdf' for /howto/pdf.mp4. */
  howto?: string
  icon: ReactNode
  title: string
  badge: string
  description: string
  action: string
  onAction: () => void
  disabled?: boolean
  highlight?: boolean
  dropProps?: React.HTMLAttributes<HTMLDivElement>
  children?: ReactNode
}) {
  return (
    <div
      className={`space-y-3 rounded-2xl border p-4 transition-colors ${highlight ? 'border-brand bg-brand-soft' : 'bg-background/40'}`}
      {...dropProps}
    >
      <div className="flex items-center gap-3">
        <span className="bg-brand-soft text-brand flex size-10 shrink-0 items-center justify-center rounded-xl [&_svg]:size-5">
          {icon}
        </span>
        <span className="font-semibold">{title}</span>
        <span className="bg-muted text-muted-foreground ml-auto rounded-full px-2 py-0.5 text-xs">{badge}</span>
      </div>
      <p className="text-muted-foreground text-sm leading-relaxed">{description}</p>
      <Button
        size="lg"
        className="bg-brand hover:bg-brand/90 h-12 w-full rounded-full text-base text-white"
        onClick={onAction}
        disabled={disabled}
      >
        {action}
      </Button>
      {howto && <HowTo name={howto} />}
      {children}
    </div>
  )
}

/** "ดูวิธี": a short, silent screen recording, loaded only when opened. */
function HowTo({ name }: { name: string }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="text-center">
      <button
        type="button"
        className="text-brand text-sm font-medium underline-offset-2 hover:underline"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
      >
        {open ? 'ซ่อนวิธี' : 'ดูวิธี ▶'}
      </button>
      {open && (
        <video
          className="mx-auto mt-2 max-h-[28rem] rounded-xl border"
          src={`/howto/${name}.mp4`}
          poster={`/howto/${name}.jpg`}
          autoPlay
          loop
          muted
          playsInline
          controls
        />
      )}
    </div>
  )
}

export function BirthdateStep({
  digits,
  onDigitsChange,
  onSubmit,
  syncing,
  progress,
  wrongBirthdate,
  files,
  onCancelFiles,
}: {
  files?: File[] | null
  onCancelFiles?: () => void
  digits: string
  onDigitsChange: (digits: string) => void
  onSubmit: () => void
  syncing: boolean
  progress: SyncProgress | null
  wrongBirthdate: boolean
}) {
  const parsed = parseBirthdate(digits)
  const invalid = digits.length === 8 && !parsed

  return (
    <StepPanel title="ใส่วันเกิดเพื่อเปิดไฟล์ PDF">
      {files && (
        <p className="bg-muted rounded-xl px-3 py-2 text-sm">
          เลือกไว้ {files.length} ไฟล์{' '}
          {onCancelFiles && (
            <button
              type="button"
              className="text-muted-foreground underline underline-offset-2"
              onClick={onCancelFiles}
            >
              เปลี่ยน
            </button>
          )}
        </p>
      )}
      <p className="text-muted-foreground">
        Dime! ล็อกไฟล์ใบยืนยันการซื้อขายด้วยวันเกิดของคุณ วันเกิดใช้แค่เปิดไฟล์ในเครื่องนี้ ไม่ถูกบันทึกหรือส่งไปที่ใด
        และจะถูกลืมเมื่อปิดหน้านี้
      </p>
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault()
          if (parsed) onSubmit()
        }}
      >
        <label className="block space-y-2">
          <span className="text-sm font-medium">วัน/เดือน/ปีเกิด</span>
          <Input
            className="h-12 text-lg tracking-wider tabular-nums md:text-lg"
            inputMode="numeric"
            autoComplete="off"
            placeholder="วว/ดด/ปปปป"
            value={formatBirthdateInput(digits)}
            aria-invalid={invalid || wrongBirthdate}
            aria-describedby="birthdate-hint"
            onChange={(e) => onDigitsChange(e.target.value.replace(/\D/g, '').slice(0, 8))}
            disabled={syncing}
          />
          <span id="birthdate-hint" className="block min-h-5 text-sm">
            {wrongBirthdate ? (
              <span className="text-destructive">วันเกิดนี้เปิดไฟล์ไม่ได้ ลองตรวจสอบอีกครั้ง</span>
            ) : invalid ? (
              <span className="text-destructive">วันที่ไม่ถูกต้อง</span>
            ) : parsed ? (
              <span className="text-muted-foreground">
                {formatBirthdate(parsed.date)}
                {parsed.convertedFromBuddhistEra && ' (แปลงจากปี พ.ศ. ให้แล้ว)'}
              </span>
            ) : (
              <span className="text-muted-foreground">ใส่ปี ค.ศ. หรือ พ.ศ. ก็ได้</span>
            )}
          </span>
        </label>
        <Button
          type="submit"
          size="lg"
          className="bg-brand hover:bg-brand/90 h-12 w-full rounded-full text-base text-white"
          disabled={!parsed || syncing}
        >
          <FileLock2 className="size-5" aria-hidden />
          {syncing ? (files ? 'กำลังอ่านไฟล์…' : 'กำลังอ่านอีเมล…') : 'เปิดไฟล์และดูพอร์ต'}
        </Button>
      </form>
      {progress && <SyncStatus progress={progress} unit={files ? 'files' : 'emails'} />}
    </StepPanel>
  )
}

export function SyncStatus({ progress, unit = 'emails' }: { progress: SyncProgress; unit?: 'emails' | 'files' }) {
  if (unit === 'files')
    return (
      <div className="space-y-1.5">
        <Progress value={progress.total ? (progress.done / progress.total) * 100 : 100} />
        <p className="text-muted-foreground text-sm">
          อ่านไฟล์แล้ว {progress.done} จาก {progress.total} ไฟล์
          {progress.failed ? ` อ่านไม่ได้ ${progress.failed} ไฟล์` : ''}
        </p>
        {progress.firstError && <p className="text-destructive text-sm">ข้อผิดพลาดแรก: {progress.firstError}</p>}
      </div>
    )
  return (
    <div className="space-y-1.5">
      <Progress value={progress.total ? (progress.done / progress.total) * 100 : 100} />
      <p className="text-muted-foreground text-sm">
        {progress.total === 0 ? 'ไม่มีอีเมล Dime! ใหม่' : `อ่านอีเมลแล้ว ${progress.done} จาก ${progress.total} ฉบับ`}
        {progress.failed ? ` ล้มเหลว ${progress.failed} ฉบับ (จะลองใหม่ครั้งหน้า)` : ''}
      </p>
      {progress.firstError && <p className="text-destructive text-sm">ข้อผิดพลาดแรก: {progress.firstError}</p>}
    </div>
  )
}

/** Where the data goes: Gmail to this device, never to the site's server. */
export function DataPath() {
  return (
    <section className="space-y-5" aria-labelledby="data-path-title">
      <h2 id="data-path-title" className="font-display text-lg font-medium">
        ข้อมูลของคุณอยู่ในเครื่องคุณเท่านั้น
      </h2>
      <figure className="space-y-3">
        <div className="flex items-center gap-1 pb-8" aria-hidden>
          {/* Three ways in, joined into one line to this device. */}
          <div className="flex shrink-0 flex-col gap-2">
            {[
              [<FileUp key="pdf" />, 'ไฟล์ PDF'],
              [<Camera key="shot" />, 'ภาพหน้าจอ'],
              [<Mail key="mail" />, 'Gmail'],
            ].map(([icon, label]) => (
              <div key={label as string} className="flex items-center gap-2">
                <span className="bg-brand-soft text-brand flex size-9 shrink-0 items-center justify-center rounded-xl [&_svg]:size-5">
                  {icon}
                </span>
                <span className="w-16 text-xs leading-tight font-medium">{label}</span>
              </div>
            ))}
          </div>
          <div className="border-brand/60 h-[7.5rem] w-3 shrink-0 rounded-r-lg border-y-2 border-r-2 border-dashed" />
          <Link />
          <Node icon={<LaptopMinimal />} label="เครื่องของคุณ" highlight />
          <Link blocked />
          <Node icon={<Server />} label="เซิร์ฟเวอร์ของเว็บ" muted />
        </div>
        <figcaption className="text-muted-foreground text-sm">
          ไฟล์ PDF ภาพหน้าจอ และอีเมลที่ดึงจาก Google ถูกอ่านในเบราว์เซอร์ของคุณ คำนวณและเก็บไว้ในเครื่องนี้
          ไม่ถูกอัปโหลด เซิร์ฟเวอร์ของเว็บเห็นเพียงชื่อหุ้นเพื่อดึงราคาตลาด
        </figcaption>
      </figure>
      <ul className="space-y-3 text-sm">
        <Fact icon={<FileUp />} title="ไฟล์และรูปไม่ถูกอัปโหลด">
          อ่านด้วยเบราว์เซอร์ในเครื่องนี้ ไม่ส่งไปที่ใด
        </Fact>
        <Fact icon={<LockKeyhole />} title="วันเกิดไม่ถูกบันทึก">
          ใช้เปิดไฟล์ PDF แล้วลืมทันทีเมื่อปิดหน้า
        </Fact>
        <Fact icon={<Eye />} title="Gmail อ่านอย่างเดียว">
          ส่ง ลบ หรือแก้ไขอีเมลไม่ได้ และยกเลิกสิทธิ์ได้ทุกเมื่อ
        </Fact>
        <Fact icon={<ShieldCheck />} title="ตรวจสอบได้">
          การตั้งค่าความปลอดภัยของเว็บบังคับให้เบราว์เซอร์ส่งข้อมูลไปได้แค่ Google และเว็บนี้ ดูได้เองที่แท็บ Network
          ของเบราว์เซอร์
        </Fact>
      </ul>
    </section>
  )
}

function Node({
  icon,
  label,
  highlight,
  muted,
}: {
  icon: ReactNode
  label: string
  highlight?: boolean
  muted?: boolean
}) {
  return (
    <div className="relative flex w-14 shrink-0 justify-center text-center">
      <span
        className={`flex size-12 items-center justify-center rounded-2xl [&_svg]:size-6 ${
          highlight ? 'bg-brand text-white' : muted ? 'bg-muted text-muted-foreground/60' : 'bg-brand-soft text-brand'
        }`}
      >
        {icon}
      </span>
      {/* Below the icon, outside the row's height, so the lines meet the icons' middles. */}
      <span
        className={`absolute top-full left-1/2 mt-2 -translate-x-1/2 text-xs leading-snug ${muted ? 'text-muted-foreground w-16' : 'w-max font-medium'}`}
      >
        {label}
      </span>
    </div>
  )
}

/** The connector between two nodes: a flowing line, or a broken one with an ✕. */
function Link({ blocked }: { blocked?: boolean }) {
  return (
    <div className="relative h-0.5 min-w-3 flex-1">
      {blocked ? (
        <>
          <div className="border-muted-foreground/40 absolute inset-x-0 top-0 border-t-2 border-dashed" />
          <span className="bg-background text-destructive absolute top-1/2 left-1/2 flex size-5 -translate-1/2 items-center justify-center rounded-full">
            <X className="size-4" strokeWidth={3} />
          </span>
        </>
      ) : (
        <div className="data-flow absolute inset-0 rounded-full" />
      )}
    </div>
  )
}

function Fact({ icon, title, children }: { icon: ReactNode; title: string; children: ReactNode }) {
  return (
    <li className="flex gap-3">
      <span className="text-brand mt-0.5 shrink-0 [&_svg]:size-5" aria-hidden>
        {icon}
      </span>
      <span>
        <span className="font-semibold">{title}</span>
        <span className="text-muted-foreground"> {children}</span>
      </span>
    </li>
  )
}
