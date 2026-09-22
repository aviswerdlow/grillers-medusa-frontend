const fs = require("node:fs")
const path = require("node:path")
const { createHash } = require("node:crypto")
const { ESLint } = require("eslint")

const hash = (value) => createHash("sha256").update(value).digest("hex")
const signature = (message) =>
  JSON.stringify([
    message.ruleId,
    message.line,
    message.column,
    message.endLine ?? null,
    message.endColumn ?? null,
    message.message,
  ])

const canBaseline = (message) =>
  message.severity === 2 &&
  !message.fatal &&
  !!message.ruleId &&
  !/^Definition for rule .+ was not found\.$/.test(message.message)

// Accept only the recorded diagnostics, counts and exact source-file versions.
// Changed files, additional errors and fatal parser errors still fail lint.
function classifyLint(results, baseline, cwd) {
  const known = new Map(baseline.files.map((entry) => [entry.path, entry]))
  let acceptedCount = 0
  const acceptedFiles = new Set()
  const filtered = results.map((result) => {
    const relative = path.relative(cwd, result.filePath).split(path.sep).join("/")
    const entry = known.get(relative)
    const unchanged = entry && hash(fs.readFileSync(result.filePath)) === entry.sha256
    const allowances = new Map(
      unchanged ? entry.errors.map((error) => [signature(error), error.count]) : []
    )
    const messages = result.messages.filter((message) => {
      const key = signature(message)
      const remaining = allowances.get(key) || 0
      if (canBaseline(message) && remaining > 0) {
        allowances.set(key, remaining - 1)
        acceptedCount += 1
        acceptedFiles.add(relative)
        return false
      }
      return true
    })
    return {
      ...result,
      messages,
      errorCount: messages.filter((message) => message.severity === 2).length,
      warningCount: messages.filter((message) => message.severity === 1).length,
      fatalErrorCount: messages.filter((message) => message.fatal).length,
    }
  })
  return { results: filtered, acceptedCount, acceptedFiles: [...acceptedFiles] }
}

async function lintSourceFiles(cwd) {
  // Match next lint's default source directories/extensions without loading
  // application configuration or requiring commerce credentials just to lint.
  const directories = ["pages", "components", "app", "src"].filter((directory) =>
    fs.existsSync(path.join(cwd, directory))
  )
  if (!directories.length) throw new Error("No source directories found.")
  const eslint = new ESLint({
    cwd,
    extensions: [".js", ".mjs", ".cjs", ".jsx", ".ts", ".mts", ".cts", ".tsx"],
    errorOnUnmatchedPattern: false,
  })
  const results = await eslint.lintFiles(directories)
  return { eslint, results }
}

async function main() {
  const args = process.argv.slice(2)
  if (args.some((arg) => arg !== "--strict")) {
    throw new Error("Supported option: --strict (report every existing error).")
  }
  const cwd = process.cwd()
  const { eslint, results } = await lintSourceFiles(cwd)
  const baseline = JSON.parse(
    fs.readFileSync(path.join(__dirname, "eslint-baseline.json"), "utf8")
  )
  const classified = args.includes("--strict")
    ? { results, acceptedCount: 0, acceptedFiles: [] }
    : classifyLint(results, baseline, cwd)
  const formatter = await eslint.loadFormatter("stylish")
  const output = formatter.format(classified.results)
  if (output) console.log(output)
  const errors = classified.results.reduce((total, result) => total + result.errorCount, 0)
  const warnings = classified.results.reduce((total, result) => total + result.warningCount, 0)
  console.log(
    `Lint: ${errors} unbaselined errors, ${warnings} warnings; ` +
      `${classified.acceptedCount} existing errors accepted in ` +
      `${classified.acceptedFiles.length} unchanged files (strategy #377).`
  )
  process.exitCode = errors ? 1 : 0
}

module.exports = { canBaseline, classifyLint, hash, lintSourceFiles, signature }
if (require.main === module) {
  main().catch((error) => {
    console.error(error.message)
    process.exitCode = 2
  })
}
