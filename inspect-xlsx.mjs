import { read, utils } from 'xlsx'
import { readFileSync } from 'fs'
const buf = readFileSync('data/job-costing-import-template-d99b38.xlsx')
const wb = read(buf, { type: 'buffer', cellDates: true })
console.log('sheets', wb.SheetNames)
for (const name of wb.SheetNames) {
  const sheet = wb.Sheets[name]
  const rows = utils.sheet_to_json(sheet, { defval: null })
  console.log('---', name, 'rowcount', rows.length)
  console.log(JSON.stringify(rows.slice(0, 5), null, 2))
}
