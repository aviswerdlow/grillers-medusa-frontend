const manifest = require("../data/legacy-redirect-manifest.json")

function literalPath(path) {
  return path.replace(/[()*+?:{}]/g, "\\$&")
}

function literalQuery(value) {
  // Next anchors each has.value expression. Match mixed case without adding
  // captures that could be forwarded as accidental destination parameters.
  return [...value].map((char) => /[a-z]/i.test(char)
    ? `[${char.toLowerCase()}${char.toUpperCase()}]`
    : char.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("")
}

function buildLegacyRedirects(rows = manifest.rows) {
  const seen = new Set()
  return rows.filter((row) => row.disposition === "redirect").map((row) => {
    const destination = row.destination
    if (!destination || !/^\/us(?:\/|$)/.test(destination) || destination.includes("..") || destination.includes("?")) {
      throw new Error(`Unsafe legacy destination: ${row.source_path}`)
    }
    if (row.source_path === destination) throw new Error("Legacy redirect loop")
    const query = Object.entries(row.source_query).sort(([a], [b]) => a.localeCompare(b))
    const key = `${row.source_path.toLowerCase()}?${JSON.stringify(query).toLowerCase()}`
    if (seen.has(key)) throw new Error(`Duplicate legacy source: ${row.source_path}`)
    seen.add(key)
    return {
      source: literalPath(row.source_path), destination, permanent: true,
      ...(query.length ? { has: query.map(([key, value]) => ({type: "query", key, value: literalQuery(value)})) } : {}),
    }
  })
}

module.exports = { buildLegacyRedirects, literalQuery }
