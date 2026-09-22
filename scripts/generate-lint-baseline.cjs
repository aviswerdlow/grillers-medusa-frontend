const fs = require("node:fs")
const path = require("node:path")
const { execFileSync } = require("node:child_process")
const { canBaseline, hash, lintSourceFiles, signature } = require("./lint-with-baseline.cjs")

function createBaseline(results, cwd, sourceBase) {
  const files = []
  for (const result of results) {
    const relative = path.relative(cwd, result.filePath).split(path.sep).join("/")
    const errors = new Map()
    for (const message of result.messages) {
      if (message.severity !== 2) continue
      if (!canBaseline(message)) {
        throw new Error(`Fix the lint configuration or parser error before generating a baseline: ${relative}:${message.line ?? 0}: ${message.message}`)
      }
      const key = signature(message)
      const existing = errors.get(key)
      if (existing) {
        existing.count += 1
      } else {
        errors.set(key, {
          ruleId: message.ruleId,
          line: message.line,
          column: message.column,
          endLine: message.endLine ?? null,
          endColumn: message.endColumn ?? null,
          message: message.message,
          count: 1,
        })
      }
    }
    if (errors.size) {
      files.push({
        path: relative,
        sha256: hash(fs.readFileSync(result.filePath)),
        errors: [...errors.entries()].sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0).map(([, error]) => error),
      })
    }
  }
  files.sort((a, b) => a.path < b.path ? -1 : a.path > b.path ? 1 : 0)
  return {
    version: 1,
    issue: "https://github.com/aviswerdlow/grillers-pride-strategy/issues/377",
    sourceBase,
    policy: "Only these diagnostic counts on exact unchanged source files are accepted. New or changed errors remain fatal. Remove entries when owners fix the source.",
    files,
  }
}

async function main() {
  if (process.argv.length > 2) throw new Error("lint:baseline does not accept arguments.")
  const cwd = process.cwd()
  // Fetch and rebase onto the approved main first; record the actual common base.
  const sourceBase = execFileSync("git", ["merge-base", "HEAD", "origin/main"], { cwd, encoding: "utf8" }).trim()
  const { results } = await lintSourceFiles(cwd)
  // Construct everything before writing: configuration failures preserve the old file.
  const baseline = createBaseline(results, cwd, sourceBase)
  fs.writeFileSync(path.join(__dirname, "eslint-baseline.json"), `${JSON.stringify(baseline, null, 2)}\n`)
  const count = baseline.files.reduce((sum, file) => sum + file.errors.reduce((total, error) => total + error.count, 0), 0)
  console.log(`Baseline: ${count} errors in ${baseline.files.length} files; source base ${sourceBase}. Review the diff before committing.`)
}

module.exports = { createBaseline }
if (require.main === module) {
  main().catch((error) => {
    console.error(error.message)
    process.exitCode = 2
  })
}
