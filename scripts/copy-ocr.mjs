// Copies what tesseract.js needs in the browser into public/ocr/, so the screenshot reader loads it from this
// site only (the page's CSP allows nothing else): the worker, the WebAssembly core, Thai and English models.
// Runs before `vite` and `vite build` (package.json predev / prebuild); public/ocr/ isn't committed.
import { copyFileSync, mkdirSync, readdirSync } from 'node:fs'

export function copyOcr() {
  const out = 'public/ocr'
  mkdirSync(out, { recursive: true })
  copyFileSync('node_modules/tesseract.js/dist/worker.min.js', `${out}/worker.min.js`)
  for (const f of readdirSync('node_modules/tesseract.js-core'))
    if (f.endsWith('-lstm.wasm.js')) copyFileSync(`node_modules/tesseract.js-core/${f}`, `${out}/${f}`)
  for (const lang of ['tha', 'eng'])
    copyFileSync(
      `node_modules/@tesseract.js-data/${lang}/4.0.0_best_int/${lang}.traineddata.gz`,
      `${out}/${lang}.traineddata.gz`,
    )
}

// Run directly (npm predev / prebuild) as well as from vite.config.ts.
if (import.meta.url === `file://${process.argv[1]}`) {
  copyOcr()
  console.log('OCR files copied to public/ocr/')
}
