/**
 * Reads the text in screenshots, in this browser, with tesseract.js (Thai and English). Everything it needs is
 * served by this site from /ocr/ (scripts/copy-ocr.mjs); the first use downloads about 7 MB, which the browser
 * then keeps. The images never leave the device.
 */
import type { Worker } from 'tesseract.js'

let worker: Promise<Worker> | null = null

function getWorker(onLoading: (pct: number) => void): Promise<Worker> {
  worker ??= import('tesseract.js').then(({ createWorker }) =>
    createWorker(['tha', 'eng'], 1, {
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
  worker.catch(() => (worker = null))
  return worker
}

/** The text of each image, in order, joined by blank lines. `onProgress` gets 0–1. */
export async function readScreenshots(files: File[], onProgress: (done: number) => void): Promise<string> {
  const w = await getWorker((pct) => onProgress(pct * 0.3))
  const texts: string[] = []
  for (const [i, file] of files.entries()) {
    texts.push((await w.recognize(file)).data.text)
    onProgress(0.3 + (0.7 * (i + 1)) / files.length)
  }
  return texts.join('\n\n')
}
