/**
 * Reads the text in screenshots, in this browser, with tesseract.js (Thai and English). Everything it needs is
 * served by this site from /ocr/ (scripts/copy-ocr.mjs); the first use downloads about 7 MB, which the browser
 * then keeps. The images never leave the device.
 */
import type { Worker } from 'tesseract.js'

const workers = new Map<string, Promise<Worker>>()

/** One reader per language set ('tha+eng' for the labels, 'eng' alone for tickers), loaded once. */
function getWorker(langs: string[], onLoading: (pct: number) => void): Promise<Worker> {
  const key = langs.join('+')
  let worker = workers.get(key)
  if (worker) return worker
  worker = import('tesseract.js').then(({ createWorker }) =>
    createWorker(langs, 1, {
      workerPath: '/ocr/worker.min.js',
      corePath: '/ocr',
      langPath: '/ocr',
      gzip: true,
      // A blob: worker would need a looser CSP; load the worker file from this site instead.
      workerBlobURL: false,
      logger: (m) => {
        if (m.status.startsWith('loading') && typeof m.progress === 'number') onLoading(m.progress)
      },
    }),
  )
  workers.set(key, worker)
  worker.catch(() => workers.delete(key))
  return worker
}

/**
 * The images' text, in order: read as Thai + English, and again as English only (for the ticker). `onProgress` gets 0–1.
 */
export async function readScreenshots(
  files: File[],
  onProgress: (done: number) => void,
): Promise<{ text: string; englishText: string }> {
  const mixed = await getWorker(['tha', 'eng'], (pct) => onProgress(pct * 0.25))
  const texts: string[] = []
  for (const [i, file] of files.entries()) {
    texts.push((await mixed.recognize(file)).data.text)
    onProgress(0.25 + (0.6 * (i + 1)) / files.length)
  }
  // English only, image by image until one shows the exchange (the ticker sits on that line).
  const english = await getWorker(['eng'], () => {})
  let englishText = ''
  for (const file of files) {
    englishText = (await english.recognize(file)).data.text
    if (/\b(NYSE|NASDAQ|AMEX|ARCA|BATS|OTC)\b/.test(englishText)) break
  }
  onProgress(1)
  return { text: texts.join('\n\n'), englishText }
}
