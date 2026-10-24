import { Camera, Check } from 'lucide-react'
import { useRef, useState } from 'react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Progress } from '@/components/ui/progress'
import { parseScreenshotText } from '@/lib/dime/screenshot'
import { readScreenshots } from '@/lib/ocr'
import { saveManualOrder, type ManualOrder } from '@/lib/sync'

type Draft = { [K in keyof ManualOrder]: string }

const EMPTY: Draft = {
  side: 'Buy',
  security: '',
  exchange: '',
  units: '',
  unitPrice: '',
  grossAmount: '',
  fees: '0',
  tradeDate: '',
  orderId: '',
}

/**
 * Add an order from screenshots of the Dime! app's order details screen: read in this browser, shown on a form
 * to check and correct, then saved. One order at a time (its screen often takes two screenshots).
 */
export function ScreenshotImport({ onSaved }: { onSaved: () => void }) {
  const input = useRef<HTMLInputElement>(null)
  const [reading, setReading] = useState<number | null>(null)
  const [draft, setDraft] = useState<Draft | null>(null)
  const [message, setMessage] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null)
  const [saving, setSaving] = useState(false)

  async function read(files: File[]) {
    setMessage(null)
    setReading(0)
    try {
      const { text, englishText } = await readScreenshots(files, setReading)
      const o = parseScreenshotText(text, englishText)
      const s = (v: number | string | null | undefined) => (v == null ? '' : String(v))
      setDraft({
        side: o.side ?? 'Buy',
        security: s(o.security),
        exchange: s(o.exchange),
        units: s(o.units),
        unitPrice: s(o.unitPrice),
        grossAmount: s(o.grossAmount),
        fees: s(o.fees ?? 0),
        tradeDate: s(o.tradeDate),
        orderId: s(o.orderId),
      })
      if (!o.security || !o.grossAmount)
        setMessage({
          tone: 'error',
          text: 'อ่านได้ไม่ครบ ลองใช้ภาพหน้าจอ "รายละเอียดคำสั่ง" ที่เห็นชื่อหุ้นและมูลค่าหุ้น หรือกรอกเองด้านล่าง',
        })
    } catch (e) {
      setMessage({ tone: 'error', text: `อ่านภาพไม่ได้: ${e instanceof Error ? e.message : String(e)}` })
    } finally {
      setReading(null)
    }
  }

  const num = (v: string) => (v.trim() === '' ? NaN : Number(v.replace(/,/g, '')))
  const order: ManualOrder | null = draft
    ? {
        side: draft.side === 'Sell' ? 'Sell' : 'Buy',
        security: draft.security.trim().toUpperCase(),
        exchange: draft.exchange.trim() || null,
        units: num(draft.units),
        unitPrice: num(draft.unitPrice),
        grossAmount: num(draft.grossAmount),
        fees: num(draft.fees || '0'),
        tradeDate: draft.tradeDate,
        orderId: draft.orderId.trim() || null,
      }
    : null
  const valid =
    !!order &&
    /^[A-Z][A-Z0-9.]*$/.test(order.security) &&
    order.units > 0 &&
    order.unitPrice > 0 &&
    order.grossAmount > 0 &&
    order.fees >= 0 &&
    /^\d{4}-\d{2}-\d{2}$/.test(order.tradeDate)

  async function save() {
    if (!order || !valid) return
    setSaving(true)
    setMessage(null)
    try {
      const result = await saveManualOrder(order)
      if (result === 'duplicate')
        setMessage({ tone: 'error', text: 'มีรายการนี้อยู่แล้ว (หุ้น จำนวน และวันที่ตรงกัน) จึงไม่เพิ่มซ้ำ' })
      else {
        setDraft(null)
        setMessage({ tone: 'ok', text: `เพิ่ม${order.side === 'Buy' ? 'ซื้อ' : 'ขาย'} ${order.security} แล้ว` })
        onSaved()
      }
    } catch (e) {
      setMessage({ tone: 'error', text: e instanceof Error ? e.message : String(e) })
    } finally {
      setSaving(false)
    }
  }

  const field = (key: keyof Draft, label: string, props: React.ComponentProps<typeof Input> = {}, wide = false) => (
    <label className={`block min-w-0 space-y-1 ${wide ? 'col-span-2' : ''}`}>
      <span className="text-muted-foreground text-xs">{label}</span>
      <Input
        value={draft?.[key] ?? ''}
        onChange={(e) => setDraft((d) => d && { ...d, [key]: e.target.value })}
        // iPhone Safari gives date inputs their own size and look: keep every box the same.
        className="h-9 w-full min-w-0 appearance-none tabular-nums"
        {...props}
      />
    </label>
  )

  return (
    <div className="space-y-3">
      <p className="text-muted-foreground text-sm">
        ในแอป Dime! เปิดคำสั่งซื้อหรือขายที่ต้องการ (หน้า “รายละเอียดคำสั่ง”) แคปหน้าจอให้เห็นตั้งแต่ชื่อหุ้นจนถึงเลขที่คำสั่ง
        (มักเป็น 2 ภาพ) แล้วเลือกภาพของคำสั่งเดียวกันพร้อมกัน ภาพถูกอ่านในเครื่องนี้ ไม่ถูกส่งไปที่ใด
      </p>
      <Button
        size="lg"
        className="bg-brand hover:bg-brand/90 h-12 w-full rounded-full text-base text-white"
        disabled={reading != null}
        onClick={() => input.current?.click()}
      >
        <Camera className="size-5" aria-hidden />
        {reading != null ? 'กำลังอ่านภาพ…' : 'เลือกภาพหน้าจอ'}
      </Button>
      {!draft && reading == null && (
        <button
          type="button"
          className="text-muted-foreground w-full text-center text-xs underline underline-offset-2"
          onClick={() => setDraft(EMPTY)}
        >
          หรือกรอกเอง
        </button>
      )}
      <input
        ref={input}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={(e) => {
          const files = [...(e.target.files ?? [])]
          e.target.value = ''
          if (files.length) void read(files)
        }}
      />
      {reading != null && (
        <div className="space-y-1">
          <Progress value={reading * 100} />
          <p className="text-muted-foreground text-xs">ครั้งแรกต้องโหลดตัวอ่านภาพราว 7 MB ครั้งต่อไปจะเร็วขึ้น</p>
        </div>
      )}
      {message && (
        <p className={`text-sm ${message.tone === 'ok' ? 'text-brand' : 'text-destructive'}`}>{message.text}</p>
      )}
      {draft && (
        <form
          className="bg-muted/50 space-y-3 rounded-2xl p-4"
          onSubmit={(e) => {
            e.preventDefault()
            void save()
          }}
        >
          <p className="text-sm font-semibold">ตรวจตัวเลขให้ตรงกับในแอป แล้วกดบันทึก</p>
          <div className="grid grid-cols-2 gap-3">
            <label className="block min-w-0 space-y-1">
              <span className="text-muted-foreground text-xs">ประเภท</span>
              <select
                className="border-input bg-background h-9 w-full rounded-md border px-2 text-sm"
                value={draft.side}
                onChange={(e) => setDraft({ ...draft, side: e.target.value })}
              >
                <option value="Buy">ซื้อ</option>
                <option value="Sell">ขาย</option>
              </select>
            </label>
            {field('security', 'หุ้น', { autoCapitalize: 'characters' })}
            {field('units', 'จำนวนหุ้น', { inputMode: 'decimal' })}
            {field('unitPrice', 'ราคาที่ได้จริง (USD)', { inputMode: 'decimal' })}
            {field('grossAmount', 'มูลค่าหุ้น (USD)', { inputMode: 'decimal' })}
            {field('fees', 'ค่าธรรมเนียม (USD)', { inputMode: 'decimal' })}
            {field('tradeDate', 'วันที่ซื้อขาย (เวลานิวยอร์ก)', { type: 'date' }, true)}
            {field('orderId', 'เลขที่คำสั่ง (ไม่ใส่ก็ได้)', {}, true)}
          </div>
          {order && valid && Math.abs(order.units * order.unitPrice - order.grossAmount) > order.grossAmount * 0.01 && (
            <p className="text-destructive text-xs">จำนวนหุ้น × ราคา ไม่ตรงกับมูลค่าหุ้น ลองตรวจอีกครั้ง</p>
          )}
          <Button
            type="submit"
            className="bg-brand hover:bg-brand/90 w-full rounded-full text-white"
            disabled={!valid || saving}
          >
            <Check aria-hidden />
            {saving ? 'กำลังบันทึก…' : 'บันทึกรายการนี้'}
          </Button>
        </form>
      )}
    </div>
  )
}
