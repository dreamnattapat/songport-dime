/**
 * Reads an order from screenshots of the Dime! app's "รายละเอียดคำสั่ง" (order
 * details) screen, from the text OCR finds in them (the screen usually takes
 * two screenshots: the amounts at the top, the date and order number further
 * down; pass their text joined in that order).
 *
 * OCR misreads some Thai (หุ้น comes out as "หน", ต.ค. as "๓.ค."), so this
 * leans on the English and the numbers, cross-checks units × price against
 * the stock value, and leaves anything it can't read as null for the person
 * to fill in on the review form.
 */

export type ScreenshotOrder = {
  side: 'Buy' | 'Sell' | null
  security: string | null
  exchange: string | null
  units: number | null
  unitPrice: number | null
  /** Stock value (มูลค่าหุ้น), USD. */
  grossAmount: number | null
  /** Commission less coupons, plus VAT, USD. */
  fees: number | null
  /** The New York trade date, YYYY-MM-DD. */
  tradeDate: string | null
  orderId: string | null
}

const NUM = String.raw`(-?[\d,]+(?:\.\d+)?)`
const toNum = (s: string) => Number(s.replace(/,/g, ''))
/** A dollar amount: the app always shows cents, so a number OCR read without its point ("-110") is in cents. */
const toUsd = (s: string) => (s.includes('.') ? toNum(s) : toNum(s) / 100)

const THAI_MONTHS: Record<string, number> = {
  'ม.ค.': 1,
  'ก.พ.': 2,
  'มี.ค.': 3,
  'เม.ย.': 4,
  'พ.ค.': 5,
  'มิ.ย.': 6,
  'ก.ค.': 7,
  'ส.ค.': 8,
  'ก.ย.': 9,
  'ต.ค.': 10,
  'พ.ย.': 11,
  'ธ.ค.': 12,
}

/** The first "<number> USD" on a line matching `label`. */
function usdAfter(text: string, label: RegExp): number | null {
  for (const line of text.split('\n')) {
    if (!label.test(line)) continue
    const m = line.match(new RegExp(`${NUM}\\s*USD`))
    if (m) return toUsd(m[1])
  }
  return null
}

/** Bangkok date and time (as the app shows them) to the New York trade date. */
export function newYorkDate(bangkok: Date): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York' }).format(bangkok)
}

/**
 * `text`: the screenshots read as Thai + English. `englishText` (optional): the same screenshots read as
 * English only, which gets Latin tickers right where the mixed read garbles them ("RKLB" as "๑8").
 */
export function parseScreenshotText(text: string, englishText = ''): ScreenshotOrder {
  // Two screenshots of one screen overlap: count each line once.
  const lines = [...new Set(text.split('\n').map((l) => l.trim().replace(/\s+/g, ' ')))]
  text = lines.join('\n')
  const EXCHANGES = /\b(NYSE|NASDAQ|AMEX|ARCA|BATS|OTC)\b/

  // "ซื้อ FPS" / "ขาย FPS", then the exchange on the same line.
  let side: ScreenshotOrder['side'] = null
  let security: string | null = null
  let exchange: string | null = null
  let sideLine = -1
  lines.some((line, i) => {
    const m = line.match(/(?:^|\s)(ซื้อ|ขาย)\s+(\S+)/)
    if (!m) return false
    side = m[1] === 'ซื้อ' ? 'Buy' : 'Sell'
    security = /^[A-Z][A-Z0-9.]{0,9}$/.test(m[2]) ? m[2] : null
    exchange = line.match(EXCHANGES)?.[1] ?? null
    sideLine = i
    return true
  })
  // The English read: the ticker is the last capitalised word before the exchange ("#o RKLB £ NASDAQ").
  for (const line of englishText.split('\n')) {
    const ex = line.match(EXCHANGES)
    if (!ex) continue
    const words = line.slice(0, ex.index).match(/\b[A-Z][A-Z0-9.]{0,9}\b/g)
    if (words?.length) {
      security = words.at(-1)!
      exchange = ex[1]
      break
    }
  }

  // Units: the line under it ("10 หุ้น", often read as "10 หน"); skip stray short noise.
  let units: number | null = null
  for (const line of sideLine >= 0 ? lines.slice(sideLine + 1, sideLine + 4) : []) {
    const m = line.match(/^([\d,]+(?:\.\d+)?)\s*ห/)
    if (m) {
      units = toNum(m[1])
      break
    }
  }

  // Prices: the line after "ราคาที่คุณตั้ง ราคาที่ได้จริง" has both; the filled price is the last one.
  let unitPrice: number | null = null
  const priceLabel = lines.findIndex((l) => /ราคาที่ได้จริง/.test(l))
  if (priceLabel >= 0) {
    for (const line of lines.slice(priceLabel, priceLabel + 3)) {
      const prices = [...line.matchAll(new RegExp(`${NUM}\\s*USD`, 'g'))].map((m) => toUsd(m[1]))
      if (prices.length) {
        unitPrice = prices.at(-1)!
        break
      }
    }
  }

  const grossAmount = usdAfter(text, /มูลค่าหุ้น/)
  // Buys show commission positive with coupons as negatives under it; sells show the fees as negatives.
  // The fee is commission + VAT + the market fees Dime! takes later (sells), less coupons.
  const abs = (v: number | null) => Math.abs(v ?? 0)
  const commission = abs(usdAfter(text, /^ค่าคอม/))
  const vat = abs(usdAfter(text, /VAT|ภาษีมูลค่าเพิ่ม/))
  const marketFees = abs(usdAfter(text, /ค่าธรรมเนียมตลาด/)) + abs(usdAfter(text, /TAF/))
  let coupons = 0
  const couponStart = lines.findIndex((l) => /คูปอง|ส่วนลด/.test(l))
  if (couponStart >= 0)
    for (const line of lines.slice(couponStart + 1)) {
      if (/VAT|ภาษี|รวม|ค่าธรรมเนียม/.test(line)) break
      const m = line.match(new RegExp(`${NUM}\\s*USD`))
      if (m) coupons += abs(toUsd(m[1]))
    }
  const fees =
    grossAmount != null ? Math.max(0, Math.round((commission + vat + marketFees - coupons) * 100) / 100) : null

  // Units × price should give the stock value; if the units were misread, trust the value.
  if (grossAmount != null && unitPrice) {
    const implied = grossAmount / unitPrice
    if (units == null || Math.abs(units * unitPrice - grossAmount) > Math.max(0.02, grossAmount * 0.005))
      units = Math.round(implied * 1e7) / 1e7
  }

  // Order number: "STKBLO2026102207530" with the rest wrapped onto the next line.
  let orderId: string | null = null
  const idLine = lines.findIndex((l) => /\bSTK[A-Z]*\d{6,}/.test(l))
  if (idLine >= 0) {
    orderId = lines[idLine].match(/STK[A-Z]*\d+/)![0]
    const rest = lines[idLine + 1]?.match(/^(\d{3,})$/)
    if (rest) orderId += rest[1]
  }

  // Trade date: the order number carries the New York date (…YYYYMMDD…); else the completion time.
  let tradeDate: string | null = null
  const fromId = orderId?.match(/^STK[A-Z]*(20\d{2})(\d{2})(\d{2})/)
  if (fromId) tradeDate = `${fromId[1]}-${fromId[2]}-${fromId[3]}`
  else {
    const done =
      lines.find((l) => /สำเร็|สําเร็/.test(l)) ??
      lines.find((l) => /\d{1,2}\s+\S+\s+\d{2}\s*-\s*\d{1,2}:\d{2}/.test(l))
    const m = done?.match(/(\d{1,2})\s+(\S+)\s+(\d{2,4})\s*-\s*(\d{1,2}):(\d{2})/)
    if (m) {
      const month =
        THAI_MONTHS[
          m[2]
            .replace(/^๓(?=ต)/, '')
            .replace('๓', 'ต')
            .replace('ด', 'ต')
        ]
      let year = Number(m[3])
      if (year < 100) year += 2500 // Buddhist era, two digits
      if (year > 2400) year -= 543
      if (month) {
        const iso = `${year}-${String(month).padStart(2, '0')}-${m[1].padStart(2, '0')}T${m[4].padStart(2, '0')}:${m[5]}:00+07:00`
        tradeDate = newYorkDate(new Date(iso))
      }
    }
  }

  return { side, security, exchange, units, unitPrice, grossAmount, fees, tradeDate, orderId }
}
