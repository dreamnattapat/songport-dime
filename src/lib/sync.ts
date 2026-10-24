/**
 * Pulls new Dime! emails from Gmail into the local database.
 * The browser version of dime-auto-log-transactions/src/main.py.
 *
 * An email counts as processed only once its rows are saved, so a failure
 * (network, odd PDF) is retried on the next sync, as in the Python version.
 * Emails whose PDF couldn't be parsed are retried too, so a parser fix takes
 * effect on the next sync without clearing anything.
 */
import { db, type Transaction } from '@/lib/db'
import { parseFields } from '@/lib/dime/parser'
import { fetchPdfAttachment, findDimeMessageIds } from '@/lib/google/gmail'
import { extractText, SiteUpdatedError, WrongPasswordError } from '@/lib/pdf'
import { fetchPrices } from '@/lib/prices'

export type SyncProgress = {
  total: number
  done: number
  added: number
  failed: number
  /** Why the first failed email failed, so the user has something to report. */
  firstError?: string
}

/** Rows from an uploaded PDF use `file:<hash>` where Gmail rows use the email's id. */
export const FILE_PREFIX = 'file:'

/** A short content hash, so uploading the same PDF twice replaces it instead of adding it again. */
async function fileId(buffer: ArrayBuffer): Promise<string> {
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', buffer))
  return FILE_PREFIX + [...digest.slice(0, 12)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

/**
 * Reads Dime! confirmation PDFs the user picked from their device: the same parsing as the Gmail sync, no
 * Google account involved. Orders already imported (from Gmail or an earlier upload) aren't added twice.
 */
export async function importPdfFiles(
  files: File[],
  pdfPassword: string,
  onProgress: (progress: SyncProgress) => void,
): Promise<SyncProgress> {
  const progress: SyncProgress = { total: files.length, done: 0, added: 0, failed: 0 }
  onProgress({ ...progress })
  for (const file of files) {
    try {
      const buffer = await file.arrayBuffer()
      // Hash first: pdf.js may take over (detach) the bytes it reads.
      const id = await fileId(buffer)
      const bytes = new Uint8Array(buffer)
      const text = await extractText(bytes, pdfPassword)
      const receivedAt = new Date(file.lastModified || Date.now()).toISOString()
      const rows: Transaction[] = parseFields(text).map((parsed, index) => ({
        ...parsed,
        id: `${id}:${index}`,
        gmailMessageId: id,
        receivedAt,
      }))
      await db.transaction('rw', db.transactions, db.processedMessages, async () => {
        await db.transactions.where('gmailMessageId').equals(id).delete()
        const known = new Set(
          (await db.transactions.toArray()).flatMap((t) => (t.parseStatus === 'ok' ? [t.orderId] : [])),
        )
        const fresh = rows.filter((r) => r.parseStatus !== 'ok' || !known.has(r.orderId))
        await db.transactions.bulkPut(fresh)
        await db.processedMessages.put({ id, processedAt: new Date().toISOString() })
        if (fresh.length) progress.added++
      })
    } catch (error) {
      // A wrong birthdate or an out-of-date page fails every file the same way.
      if (error instanceof WrongPasswordError || error instanceof SiteUpdatedError) throw error
      console.error(`Failed to read ${file.name}`, error)
      progress.failed++
      progress.firstError ??= `${file.name}: ${error instanceof Error ? error.message : String(error)}`
    } finally {
      progress.done++
      onProgress({ ...progress })
    }
  }
  return progress
}

/** Rows read from app screenshots use `shot:<order number>`. */
export const SHOT_PREFIX = 'shot:'

/** One order typed in or read from Dime! app screenshots, checked by the person on the review form. */
export type ManualOrder = {
  side: 'Buy' | 'Sell'
  security: string
  exchange: string | null
  units: number
  unitPrice: number
  grossAmount: number
  fees: number
  tradeDate: string
  orderId: string | null
}

const EXCHANGE_MIC: Record<string, string> = { NYSE: 'XNYS', NASDAQ: 'XNAS', AMEX: 'XASE', ARCA: 'ARCX' }

/**
 * Saves an order from screenshots. The app shows dollars only; the baht figures the dashboard also uses come
 * from the USD/THB rate of the trade date. Returns 'duplicate' when an order like it (same stock, type, units,
 * within three days) is already there, from a PDF, Gmail or an earlier screenshot.
 */
export async function saveManualOrder(order: ManualOrder): Promise<'saved' | 'duplicate'> {
  const days = (a: string, b: string) => Math.abs(Date.parse(a) - Date.parse(b)) / 86_400_000
  const existing = (await db.transactions.toArray()).find(
    (t) =>
      t.parseStatus === 'ok' &&
      t.security === order.security &&
      t.transactionType === order.side &&
      Math.abs(t.units - order.units) < 1e-6 &&
      days(t.effectiveDate ?? t.settlementDate, order.tradeDate) <= 3,
  )
  if (existing) return 'duplicate'

  const fx = await fetchPrices('THB=X', order.tradeDate, order.tradeDate)
  const rate = fx.on(order.tradeDate)
  if (!rate) throw new Error('ดึงอัตราแลกเปลี่ยน USD/THB ของวันนั้นไม่ได้ ลองใหม่อีกครั้ง')
  const total = order.side === 'Buy' ? order.grossAmount + order.fees : order.grossAmount - order.fees
  const key = SHOT_PREFIX + (order.orderId ?? `${order.security}-${order.tradeDate}-${order.units}`)
  const thb = (usd: number) => Math.round(usd * rate * 100) / 100
  const row: Transaction = {
    id: `${key}:0`,
    gmailMessageId: key,
    receivedAt: new Date().toISOString(),
    parseStatus: 'ok',
    orderId: order.orderId ?? key,
    settlementDate: order.tradeDate,
    transactionType: order.side,
    security: order.security,
    units: order.units,
    unitPrice: order.unitPrice,
    currency: 'USD',
    grossAmount: order.grossAmount,
    vat: order.fees,
    withholdingTax: 0,
    totalAmount: Math.round(total * 100) / 100,
    exchange: order.exchange ? (EXCHANGE_MIC[order.exchange] ?? order.exchange) : null,
    grossAmountThb: thb(order.grossAmount),
    vatThb: thb(order.fees),
    withholdingTaxThb: 0,
    totalAmountThb: thb(total),
    accountNo: null,
    taxInvoiceNo: null,
    totalBuyThb: null,
    totalSellThb: null,
    totalFeeThb: null,
    totalVatThb: null,
    totalWithholdingTaxThb: null,
    fxRateThbUsd: rate,
    effectiveDate: order.tradeDate,
    issueDate: order.tradeDate,
  }
  await db.transaction('rw', db.transactions, db.processedMessages, async () => {
    await db.transactions.put(row)
    await db.processedMessages.put({ id: key, processedAt: new Date().toISOString() })
  })
  return 'saved'
}

// Parallel email downloads; small enough to stay well inside Gmail's rate limits.
const CONCURRENCY = 4

export async function syncFromGmail(
  accessToken: string,
  pdfPassword: string,
  onProgress: (progress: SyncProgress) => void,
): Promise<SyncProgress> {
  const allIds = await findDimeMessageIds(accessToken)
  const processed = new Set(await db.processedMessages.toCollection().primaryKeys())
  const unparsed = await db.transactions.filter((tx) => tx.parseStatus === 'unparsed').toArray()
  const retry = new Set(unparsed.map((tx) => tx.gmailMessageId))
  // Emails that were marked done without leaving a single row (an older version skipped ones with no readable
  // PDF without a trace): look at them again, so they show up as unreadable or get imported.
  // Plain reads only: the unique-key cursor failed on iPhone Safari ("Unable to open cursor").
  const withRows = new Set((await db.transactions.toArray()).map((tx) => tx.gmailMessageId))
  for (const id of processed) if (!withRows.has(id)) retry.add(id)
  const newIds = allIds.filter((id) => !processed.has(id) || retry.has(id))

  const progress: SyncProgress = { total: newIds.length, done: 0, added: 0, failed: 0 }
  onProgress({ ...progress })

  // Either fails every email the same way, so stop at the first one.
  let fatal: WrongPasswordError | SiteUpdatedError | null = null

  async function processOne(messageId: string) {
    try {
      const email = await fetchPdfAttachment(accessToken, messageId)
      const rows: Transaction[] = []
      const receivedAt = new Date(email.internalDateMs).toISOString()
      // An email with no readable PDF still leaves a placeholder row, so it's counted as unreadable and tried
      // again, not silently dropped.
      const text = email.pdfBytes ? await extractText(email.pdfBytes, pdfPassword) : 'ไม่พบไฟล์ PDF แนบในอีเมลนี้'
      parseFields(text).forEach((parsed, index) => {
        rows.push({ ...parsed, id: `${messageId}:${index}`, gmailMessageId: messageId, receivedAt })
      })
      await db.transaction('rw', db.transactions, db.processedMessages, async () => {
        // Replace rows from an earlier attempt (e.g. an unparsed placeholder).
        await db.transactions.where('gmailMessageId').equals(messageId).delete()
        // And the same orders if they came in earlier as an uploaded PDF, so nothing counts twice.
        const orderIds = new Set(rows.flatMap((r) => (r.parseStatus === 'ok' ? [r.orderId] : [])))
        if (orderIds.size)
          await db.transactions
            .filter(
              (t) => t.gmailMessageId.startsWith(FILE_PREFIX) && t.parseStatus === 'ok' && orderIds.has(t.orderId),
            )
            .delete()
        await db.transactions.bulkPut(rows)
        await db.processedMessages.put({ id: messageId, processedAt: new Date().toISOString() })
      })
      if (email.pdfBytes) progress.added++
    } catch (error) {
      if (error instanceof WrongPasswordError || error instanceof SiteUpdatedError) {
        fatal = error
        return
      }
      console.error(`Failed to process message ${messageId}`, error)
      progress.failed++
      progress.firstError ??= error instanceof Error ? error.message : String(error)
    } finally {
      progress.done++
      onProgress({ ...progress })
    }
  }

  const queue = [...newIds]
  await Promise.all(
    Array.from({ length: Math.min(CONCURRENCY, queue.length) }, async () => {
      // A wrong birthdate or an out-of-date page fails every email, so stop at the first one.
      while (queue.length && !fatal) await processOne(queue.shift()!)
    }),
  )

  if (fatal) throw fatal
  return progress
}
