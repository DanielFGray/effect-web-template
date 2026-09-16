/**
 * Derives HTML input constraint attributes from the HttpApi contract and
 * writes them to shared/formConstraints.gen.ts as plain data.
 *
 * The endpoint payload schemas are the single source of truth for what a form
 * may submit. This script is the only thing that reads them for form purposes,
 * so the browser gets the constraints without the Effect Schema runtime.
 * Run via `bun run gen:constraints`.
 */
import { writeFileSync } from 'node:fs'

import { HttpApi } from '@effect/platform'
import { JSONSchema } from 'effect'

import { Contract } from '../shared/httpApi.js'

type Constraints = {
	type?: string
	required?: true
	minLength?: number
	maxLength?: number
	pattern?: string
	min?: number
	max?: number
	step?: number
}

type JsonNode = Record<string, unknown>

/**
 * Maps one JSON Schema node onto the input attributes that mean the same thing
 * to a browser. Anything with no HTML equivalent is dropped on purpose: the
 * server revalidates with the full schema, so a constraint the browser cannot
 * express is enforced there rather than approximated here.
 */
function attributesFor(node: JsonNode, required: boolean): Constraints {
	const out: Constraints = {}
	if (required) out.required = true

	if (node.type === 'string') {
		// Only emit a type the format actually implies. A plain string says
		// nothing about presentation, and guessing "text" would stomp on the
		// type="password" the call site needs.
		const implied =
			node.format === 'email'
				? 'email'
				: node.format === 'uri'
					? 'url'
					: node.format === 'date'
						? 'date'
						: undefined
		if (implied) out.type = implied
		if (typeof node.minLength === 'number') out.minLength = node.minLength
		if (typeof node.maxLength === 'number') out.maxLength = node.maxLength
		// HTML anchors `pattern` implicitly and requires a full-value match,
		// which is what Effect's filters already mean, so the regex transfers.
		if (typeof node.pattern === 'string') out.pattern = node.pattern
	} else if (node.type === 'number' || node.type === 'integer') {
		out.type = 'number'
		if (typeof node.minimum === 'number') out.min = node.minimum
		if (typeof node.maximum === 'number') out.max = node.maximum
		if (node.type === 'integer') out.step = 1
	} else if (node.type === 'boolean') {
		out.type = 'checkbox'
	}

	return out
}

/**
 * Follows $refs into $defs and unwraps nullable unions.
 *
 * JSONSchema.make hoists named schemas into $defs, and S.NullOr becomes an
 * anyOf with a null branch. A field the schema lets you null out is not one
 * the browser should mark required, so unwrapping reports that back.
 */
function resolve(
	node: JsonNode,
	defs: Record<string, JsonNode>,
): { node: JsonNode; nullable: boolean } {
	if (typeof node.$ref === 'string') {
		const name = node.$ref.replace('#/$defs/', '')
		const target = defs[name]
		if (!target) throw new Error(`unresolved $ref: ${node.$ref}`)
		return resolve(target, defs)
	}

	const branches = (node.anyOf ?? node.oneOf) as Array<JsonNode> | undefined
	if (branches) {
		const { anyOf: _anyOf, oneOf: _oneOf, ...siblings } = node
		const nonNull = branches.filter((b) => b.type !== 'null')
		const nullable = nonNull.length < branches.length
		// Only a single remaining branch is representable as one input.
		if (nonNull.length !== 1) return { node: siblings, nullable }
		const inner = resolve(nonNull[0]!, defs)
		// A filter over a union puts its keywords beside the anyOf rather than
		// inside a branch, and those are the narrower ones, so they win.
		return { node: { ...inner.node, ...siblings }, nullable: nullable || inner.nullable }
	}

	return { node, nullable: false }
}

function constraintsForPayload(schema: unknown): Record<string, Constraints> | null {
	let root: JsonNode
	try {
		root = JSONSchema.make(schema as never) as unknown as JsonNode
	} catch {
		// A payload with no JSON Schema representation is enforced server-side only.
		return null
	}
	if (root.type !== 'object') return null

	const defs = (root.$defs ?? {}) as Record<string, JsonNode>
	const properties = (root.properties ?? {}) as Record<string, JsonNode>
	const required = new Set((root.required ?? []) as Array<string>)

	const fields = Object.entries(properties).map(([field, node]) => {
		const { node: resolved, nullable } = resolve(node, defs)
		return [field, attributesFor(resolved, required.has(field) && !nullable)] as const
	})

	return Object.fromEntries(fields)
}

const result: Record<string, Record<string, Constraints>> = {}

HttpApi.reflect(Contract, {
	onGroup() {},
	onEndpoint({ group, endpoint }) {
		// payloadSchema is an Option on endpoints that declare one, and absent
		// on those that do not. reflect's types erase the schema itself.
		const { payloadSchema } = endpoint as unknown as {
			payloadSchema?: { _tag: 'Some' | 'None'; value?: unknown } | unknown
		}
		if (!payloadSchema) return
		const wrapped = payloadSchema as { _tag?: string; value?: unknown }
		const schema =
			wrapped._tag === 'Some' ? wrapped.value : wrapped._tag ? undefined : payloadSchema
		if (!schema) return

		const constraints = constraintsForPayload(schema)
		if (!constraints || Object.keys(constraints).length === 0) return
		result[`${group.identifier}.${endpoint.name}`] = constraints
	},
})

const banner = `// Generated by scripts/genFormConstraints.ts. Do not edit.
// Regenerate with \`bun run gen:constraints\` after changing an endpoint payload.
// These attributes are the pre-hydration layer: the browser enforces them before
// any script runs. After hydration the form decodes against the payload schema.
`

const body = `export const formConstraints = ${JSON.stringify(result, null, '\t')} as const
`

writeFileSync(
	new URL('../shared/formConstraints.gen.ts', import.meta.url),
	`${banner}\n${body}`,
)
console.log(`wrote constraints for ${Object.keys(result).length} endpoints`)
