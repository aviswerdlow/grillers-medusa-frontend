import fs from "node:fs"
import os from "node:os"
import path from "node:path"

const { classifyLint, hash } = require("../../../scripts/lint-with-baseline.cjs")

describe("the explicit legacy lint baseline", () => {
  let cwd: string
  let filePath: string
  const source = "const existing = true\n"
  const error = {
    ruleId: "example/existing",
    line: 1,
    column: 7,
    endLine: 1,
    endColumn: 15,
    severity: 2,
    message: "An existing diagnostic",
  }
  const baseline = () => ({
    files: [{ path: "example.ts", sha256: hash(source), errors: [{ ...error, count: 1 }] }],
  })
  const result = (messages = [error]) => [{ filePath, messages, errorCount: messages.length }]

  beforeEach(() => {
    cwd = fs.mkdtempSync(path.join(os.tmpdir(), "gp-lint-test-"))
    filePath = path.join(cwd, "example.ts")
    fs.writeFileSync(filePath, source)
  })
  afterEach(() => fs.rmSync(cwd, { recursive: true, force: true }))

  it("accepts only the recorded error on the exact unchanged file", () => {
    const checked = classifyLint(result(), baseline(), cwd)
    expect(checked.acceptedCount).toBe(1)
    expect(checked.results[0].errorCount).toBe(0)
  })

  it("rejects the same diagnostic after the source file changes", () => {
    fs.appendFileSync(filePath, "const changed = true\n")
    expect(classifyLint(result(), baseline(), cwd).results[0].errorCount).toBe(1)
  })

  it("rejects additional occurrences instead of broadly disabling a rule", () => {
    expect(classifyLint(result([error, error]), baseline(), cwd).results[0].errorCount).toBe(1)
  })

  it("rejects new rules and changed diagnostic locations", () => {
    const messages = [{ ...error, ruleId: "example/new" }, { ...error, line: 2 }]
    expect(classifyLint(result(messages), baseline(), cwd).results[0].errorCount).toBe(2)
  })

  it("never accepts a fatal parser error", () => {
    expect(classifyLint(result([{ ...error, fatal: true } as any]), baseline(), cwd).results[0].errorCount).toBe(1)
  })
})
