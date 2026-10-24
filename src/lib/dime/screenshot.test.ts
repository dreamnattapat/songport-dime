import { describe, expect, it } from 'vitest'

import { newYorkDate, parseScreenshotText } from './screenshot'

// What tesseract.js (tha+eng) reads from the two screenshots of one buy in the Dime! app (Oct 2026),
// account numbers changed. Note the misreads: "10 หน" for 10 หุ้น, "๓.ค." for ต.ค., the total missing.
const TOP = `=                  รายละเอียดคําสัง
สถานะ (ณ 23 ต.ค. 69 - 02:54 น.)                         5
๑ จับคู่แล้ว
คําสั่งซื้อของคุณได้รับการจับคู่ทั้งหมด
แล้ว และคุณได้รับหุ้นครบถ้วนแล้ว
ซื้อ FPS                                     4 NYSE
ว2
10 หน
B
ราคาที่คุณตั้ง                ราคาที่ได้จริง
25.00 USD                 25.00 USD
ยอดที่ต้องชําระ
มูลค่าหุ้น                                   250.00 USD
ค่าคอมมิชชัน                                  0.37 USD
คูปองส่วนลด
£ แพ็กเกจ Dime! Fan                      -0.37 USD
ภาษีมูลค่าเพิ่ม 7% (VAT)                      0.00 USD
รวมค่าคอมมิชชันและ VAT           ชีต! ไม่มีค่าคอมมิชชัน
ประเภทคําสั่ง                     ๒. ตั้งราคาเอง (Limit)`

const BOTTOM = `19:01 %  ail GB
&                   รายละเอียดคําสัง
คูปองส่วนลด
ภาษีมูลค่าเพิ่ม 7% (VAT)                      0.00 USD
ประเภทคําสั่ง                     2. ตั้งราคาเอง (Limit)
วันที่ส่งคําสั่ง                        23 ๓.ค. 69 - 02:53 น.
วันที่คําสั่งสําเร็อ                     23 ต.ค. 69 - 02:54 u.
บปบัญชีชําระเงจิน                           © Dime! USD
00000000000
เลขที่คําสั่ง                     STKBLO2026102207530
0370256
หากยกเลิก คุณจะได้รับคูปองที่ใช้กับรายการนี้คืน`

// A market sell (Oct 2026): fees show as negatives, "-1.10" read as "-110", "30 หุ้น" as "30 Ku",
// and the two screenshots overlap.
const SELL_TOP = `&                  รายละเอียดคําสัง
สถานะ (ณ 23 ต.ค. 69 - 18:12 น.)                           2
@ สาเรจ                                       :
คุณได้รับเงินค่าขายคืนแล้ว
ขาย FPS                                    % NYSE
2
30 Ku
2
ราคา                        ราคาที่ได้จริง
ใช้ราคาตลาด (Market) ว24.48 USD
ยอดที่จะได้รับคืน
มูลค่าหุ้น                                   734.40 USD
ค่าคอมมิชชัน                                  -110 USD
ภาษีมูลค่าเพิ่ม 7% (VAT)                     -0.08 USD
ค่าธรรมเนียมรอจ่าย ()
ค่าธรรมเนียมตลาดหลักทรัพย์                  -0.02 USD
ค่าธรรมเนียมการขาย (TAF                    0.00 USD
Fee)
ประเภทคําสั่ง                == ราคาตลาด (Market)`

const SELL_BOTTOM = `<                   รายละเอียดคําสัง
มูลค่าหุ้น                                   734.40 USD
ค่าคอมมิชชัน                                  -110 USD
ภาษีมูลค่าเพิ่ม 7% (VAT)                     -0.08 USD
ค่าธรรมเนียมรอจ่าย ()
ค่าธรรมเนียมตลาดหลักทรัพย์                  -0.02 USD
ค่าธรรมเนียมการขาย (TAF                    0.00 USD
Fee)
ประเภทคําสั่ง                == ราคาตลาด (Market)
วันที่ส่งคําสั่ง                         23 ๓.ค. 69 - 02:47 u.
วันที่คําสั่งสําเร็อ                     23 ต๓.ค. 69 - 02:47 u.
ปัญชีรับเงิน                             © Dime! USD
00000000000
เลขที่คําสั่ง                     STKSMS2026102207470
3368517`

describe('parseScreenshotText', () => {
  it('reads a market sell: negative fees, a lost decimal point, overlapping screenshots', () => {
    expect(parseScreenshotText(`${SELL_TOP}\n\n${SELL_BOTTOM}`)).toEqual({
      side: 'Sell',
      security: 'FPS',
      exchange: 'NYSE',
      units: 30,
      unitPrice: 24.48,
      grossAmount: 734.4,
      // Commission 1.10 + VAT 0.08 + the exchange fee Dime! takes later 0.02.
      fees: 1.2,
      tradeDate: '2026-10-22',
      orderId: 'STKSMS20261022074703368517',
    })
  })

  it('reads a buy from the two screenshots of the order details screen', () => {
    expect(parseScreenshotText(`${TOP}\n${BOTTOM}`)).toEqual({
      side: 'Buy',
      security: 'FPS',
      exchange: 'NYSE',
      units: 10,
      unitPrice: 25,
      grossAmount: 250,
      fees: 0,
      tradeDate: '2026-10-22',
      orderId: 'STKBLO20261022075300370256',
    })
  })

  it('without the order number, takes the New York date from the Bangkok completion time', () => {
    const order = parseScreenshotText(TOP + '\nวันที่คําสั่งสําเร็จ 23 ต.ค. 69 - 02:54 น.')
    expect(order.tradeDate).toBe('2026-10-22')
    expect(order.orderId).toBeNull()
  })

  it('counts commission net of coupons, plus VAT, as the fee; and units from value ÷ price when misread', () => {
    const order = parseScreenshotText(
      TOP.replace('10 หน', '1O หน')
        .replace('0.37 USD\nคูปอง', '1.20 USD\nคูปอง')
        .replace('VAT)                      0.00', 'VAT)                      0.06'),
    )
    expect(order.units).toBe(10)
    expect(order.fees).toBeCloseTo(1.2 - 0.37 + 0.06)
  })

  it('reads a sell on NASDAQ, and a month OCR garbled as "๓ต.ค." when there is no order number', () => {
    const text = `ขาย PEP                                    % NASDAQ
5 หุ้น
ราคา                        ราคาที่ได้จริง
ใช้ราคาตลาด (Market) 136.52 USD
มูลค่าหุ้น                                   682.62 USD
ค่าคอมมิชชัน                                  -1.03 USD
ภาษีมูลค่าเพิ่ม 7% (VAT)                      -0.07 USD
ค่าธรรมเนียมตลาดหลักทรัพย์                  -0.02 USD
ค่าธรรมเนียมการขาย (TAF                   0.00 USD
วันที่คําสั่งสําเร็อ                     23 ๓ต.ค. 69 - 20:49 u.`
    expect(parseScreenshotText(text)).toMatchObject({
      side: 'Sell',
      security: 'PEP',
      exchange: 'NASDAQ',
      units: 5,
      unitPrice: 136.52,
      grossAmount: 682.62,
      fees: 1.12,
      tradeDate: '2026-10-23',
    })
  })

  it('leaves what it cannot read empty', () => {
    expect(parseScreenshotText('nothing here')).toMatchObject({ side: null, security: null, grossAmount: null })
  })

  it('converts Bangkok time to the New York date', () => {
    expect(newYorkDate(new Date('2026-10-23T02:54:00+07:00'))).toBe('2026-10-22')
    expect(newYorkDate(new Date('2026-10-23T21:30:00+07:00'))).toBe('2026-10-23')
  })
})
