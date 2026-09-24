import { render, waitFor } from "@testing-library/react"
import { withAssignmentEvidence, verifiedStoredAssignment } from "@lib/experiments/assignment-evidence"
import { getExperimentAssignment } from "@lib/experiments/server"
import { getStatsigEvaluation } from "@lib/experiments/statsig-server"
import { experimentCartMetadata, getActiveExperimentContext, rememberExperimentAssignment } from "@lib/experiments/client-context"
import { EXPERIMENT_ASSIGNMENTS_COOKIE, parseStoredAssignments } from "@lib/experiments/cookies"
import ExperimentExposure from "@lib/experiments/exposure"
import { jitsuTrack } from "@lib/jitsu"
import type { ExperimentAssignment, ExperimentDefinition, StoredExperimentAssignment } from "@lib/experiments/types"
import fixture from "../fixtures/experiment-evidence.json"

jest.mock("server-only", () => ({}))
const mockCookies = new Map<string, string>()
jest.mock("next/headers", () => ({ cookies: async () => ({ get: (name: string) => mockCookies.has(name) ? { value: mockCookies.get(name) } : undefined }), headers: async () => ({ get: () => null }) }))
jest.mock("@lib/experiments/statsig-server", () => ({ getStatsigEvaluation: jest.fn() }))
jest.mock("@lib/jitsu", () => ({ getJitsuContextSnapshot: () => ({ anonymous_id: "visitor-fixture", session_id: "session-fixture" }), jitsuTrack: jest.fn(), setJitsuExperimentContext: jest.fn() }))

const initialEnv = process.env
beforeEach(() => {
  process.env = { ...initialEnv, GP_EXPERIMENT_RELEASE_SHA: fixture.releaseId, GP_EXPERIMENT_EVIDENCE_KEY_ID: "fixture-key", GP_EXPERIMENT_EVIDENCE_KEYS: JSON.stringify({ "fixture-key": fixture.secret }) }
  delete process.env.VERCEL_GIT_COMMIT_SHA
  mockCookies.clear()
  jest.clearAllMocks()
  for (const entry of document.cookie.split(";")) document.cookie = `${entry.split("=")[0].trim()}=;max-age=0;path=/`
  ;(getStatsigEvaluation as jest.Mock).mockResolvedValue({ variant: "products_earlier", evidence: fixture.evaluation })
})
afterEach(() => { process.env = initialEnv })
const issue = (extra: Partial<ExperimentAssignment> = {}, definition = fixture.definition as ExperimentDefinition, evaluation: unknown = fixture.evaluation) =>
  withAssignmentEvidence({ ...fixture.input, ...extra } as ExperimentAssignment, definition, evaluation)
const storedFixture = (): StoredExperimentAssignment => ({ ...fixture.issued, source: "statsig", surface: "homepage", impact: "revenue", assignedAt: "2026-09-20T00:00:00Z" })

test("matches the backend's frozen producer/consumer vector", () => {
  expect(issue()).toEqual(fixture.issued)
  expect(verifiedStoredAssignment(fixture.definition.key, storedFixture())).toBe(true)
})
test("both variants share an experiment revision, with separate evaluation evidence", () => {
  const control = issue({ variantKey: "control", assignmentId: "control-fixture" }, undefined, { ...fixture.evaluation, value: { variant: "control" } })
  expect(control.version).toBe(issue().version)
  expect(control.evaluationVersion).not.toBe(issue().evaluationVersion)
  expect(control.versionSignature).not.toBe(issue().versionSignature)
})
test("a changed definition or code release gets a different experiment revision", () => {
  expect(issue({}, { ...fixture.definition, description: "changed rendering contract" } as ExperimentDefinition).version).not.toBe(issue().version)
  process.env.GP_EXPERIMENT_RELEASE_SHA = "b".repeat(40)
  expect(issue().version).not.toBe(fixture.issued.version)
})
test.each(["GP_EXPERIMENT_RELEASE_SHA", "GP_EXPERIMENT_EVIDENCE_KEY_ID", "GP_EXPERIMENT_EVIDENCE_KEYS"])("missing %s stays unknown without blocking assignment", key => {
  delete process.env[key]
  expect(issue()).toMatchObject({ variantKey: "test", isEnabled: true, version: null })
})
test("malformed or weak keys cannot create known evidence", () => {
  for (const value of ["not-json", JSON.stringify({ "fixture-key": "short" })]) {
    process.env.GP_EXPERIMENT_EVIDENCE_KEYS = value
    expect(issue().version).toBeNull()
  }
})
test.each(["variantKey", "assignmentId", "version", "evaluationVersion", "releaseId", "versionSignature"])("tampering with %s invalidates the receipt", field => {
  expect(verifiedStoredAssignment(fixture.definition.key, { ...storedFixture(), [field]: "tampered" })).toBe(false)
})
test("disabled/blocked experiments never acquire a verified version", () => {
  expect(issue({ isEnabled: false }).version).toBeNull()
  expect(issue({ isBlocked: true }).version).toBeNull()
})
test("actual server assignment retains verified sticky evidence but reevaluates unsigned cookies", async () => {
  process.env.EXPERIMENT_STATUS_HOMEPAGE_SHOPPING_FLOW_V1 = "active"
  mockCookies.set("_gp_exp_id", "visitor-fixture")
  const first = (await getExperimentAssignment("homepage_shopping_flow_v1"))!
  expect(first.version).toMatch(/^[a-f0-9]{64}$/)
  mockCookies.set(EXPERIMENT_ASSIGNMENTS_COOKIE, JSON.stringify({ [first.experimentKey]: { ...first, assignedAt: "2026-09-20T00:00:00Z" } }))
  const second = (await getExperimentAssignment(first.experimentKey))!
  expect(second).toMatchObject({ version: first.version, evaluationVersion: first.evaluationVersion, versionSignature: first.versionSignature, source: "sticky-cookie" })
  expect(getStatsigEvaluation).toHaveBeenCalledTimes(1)
  mockCookies.set(EXPERIMENT_ASSIGNMENTS_COOKIE, JSON.stringify({ [first.experimentKey]: { variantKey: "control", assignmentId: "forged", assignedAt: "now" } }))
  expect((await getExperimentAssignment(first.experimentKey))?.variantKey).toBe("products_earlier")
  expect(getStatsigEvaluation).toHaveBeenCalledTimes(2)
})
test("browser/cart/exposure carry the issued version without sending signatures to analytics", async () => {
  const assignment = issue()
  rememberExperimentAssignment(assignment)
  const active = getActiveExperimentContext()[assignment.experimentKey]
  expect(active).toMatchObject({ version: assignment.version, evaluation_version: assignment.evaluationVersion })
  expect(active).not.toHaveProperty("version_signature")
  expect(experimentCartMetadata()).toMatchObject(fixture.metadata)
  const raw = document.cookie.split("; ").find(x => x.startsWith(EXPERIMENT_ASSIGNMENTS_COOKIE + "="))!.split("=")[1]
  expect(parseStoredAssignments(decodeURIComponent(raw))[assignment.experimentKey].versionSignature).toBe(assignment.versionSignature)
  render(<ExperimentExposure assignment={assignment} />)
  await waitFor(() => expect(jitsuTrack).toHaveBeenCalledWith("experiment_exposed", expect.objectContaining({ experiment_version: assignment.version, experiment_evaluation_version: assignment.evaluationVersion })))
})
test("explicitly empty, malformed and incomplete cookie histories stay distinct", () => {
  expect(experimentCartMetadata()).toEqual({ experiment_context_status: "complete", experiment_context: {} })
  for (const value of ["not-json", "[]", JSON.stringify({ broken: { variantKey: "b" } })]) {
    document.cookie = `${EXPERIMENT_ASSIGNMENTS_COOKIE}=${encodeURIComponent(value)};path=/`
    expect(experimentCartMetadata().experiment_context_status).toBe("unverified")
  }
})
test("cookie capacity loss is explicit rather than silently losing an exposure", () => {
  for (let i = 0; i < 20; i++) rememberExperimentAssignment({ ...issue(), experimentKey: `large_fixture_${i}` })
  expect(experimentCartMetadata().experiment_context_status).toBe("unverified")
})
