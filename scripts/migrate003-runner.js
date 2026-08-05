import { execSync } from 'child_process'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const scriptPath = path.join(__dirname, 'migrate003.py')

try {
  const result = execSync(`uv run ${scriptPath}`, {
    env: process.env,
    encoding: 'utf8',
    stdio: 'pipe',
  })
  console.log(result)
} catch (err) {
  console.error(err.stdout)
  console.error(err.stderr)
  process.exit(1)
}
