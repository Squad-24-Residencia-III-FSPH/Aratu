import { appendFileSync, readFileSync } from 'node:fs'

const [reportPath, label = 'Tests'] = process.argv.slice(2)
if (!reportPath) throw new Error('Informe o relatório TAP.')
const report = readFileSync(reportPath, 'utf8')
const counts = Object.fromEntries(['tests', 'pass', 'fail', 'cancelled', 'skipped', 'todo'].map(key => {
  const matches = [...report.matchAll(new RegExp(`^# ${key} (\\d+)\\s*$`, 'gm'))]
  return [key, matches.length === 1 ? Number(matches[0][1]) : null]
}))
const summary = `### ${label}\n\n| Total | Aprovados | Falhos | Cancelados | Pulados | TODO |\n|---|---|---|---|---|---|\n| ${counts.tests ?? '?'} | ${counts.pass ?? '?'} | ${counts.fail ?? '?'} | ${counts.cancelled ?? '?'} | ${counts.skipped ?? '?'} | ${counts.todo ?? '?'} |\n`
process.stdout.write(summary)
if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, summary)
if (Object.values(counts).some(value => value === null) || counts.tests < 1 || counts.pass !== counts.tests
  || counts.fail !== 0 || counts.cancelled !== 0 || counts.skipped !== 0 || counts.todo !== 0) {
  process.stderr.write('A suíte precisa executar testes e terminar sem falhas, cancelamentos, skips ou TODO.\n')
  process.exitCode = 1
}
