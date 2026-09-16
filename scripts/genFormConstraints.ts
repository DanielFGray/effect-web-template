/**
 * Derives HTML input constraint attributes from the HttpApi contract and
 * writes them to shared/formConstraints.gen.ts as plain data.
 *
 * Walks each endpoint's payload Schema AST (the same tree OpenAPI uses),
 * reading `jsonSchema` annotations that field schemas already carry. That keeps
 * the generator on typed Effect values instead of round-tripping through
 * JSONSchema.make and chasing $refs. Run via `bun run gen:constraints`.
 */
import { writeFileSync } from 'node:fs'

import { HttpApi } from '@effect/platform'
import { Array as Arr, Match, Option, Record as Rec, Schema, pipe } from 'effect'
import * as AST from 'effect/SchemaAST'

import { Contract } from '../shared/httpApi.js'

type Constraints = {
	readonly type?: string
	readonly required?: true
	readonly minLength?: number
	readonly maxLength?: number
	readonly pattern?: string
	readonly min?: number
	readonly max?: number
	readonly step?: number
}

/**
 * The subset of a `jsonSchema` annotation that can become an HTML attribute.
 * Decoded from each Refinement/Declaration annotation; unknown keys are ignored.
 */
const JsonSchemaBits = Schema.Struct({
	type: Schema.optional(Schema.String),
	format: Schema.optional(Schema.String),
	minLength: Schema.optional(Schema.Number),
	maxLength: Schema.optional(Schema.Number),
	pattern: Schema.optional(Schema.String),
	minimum: Schema.optional(Schema.Number),
	maximum: Schema.optional(Schema.Number),
})
type JsonSchemaBits = Schema.Schema.Type<typeof JsonSchemaBits>

function readBits(ast: AST.AST): JsonSchemaBits {
	return pipe(
		AST.getJSONSchemaAnnotation(ast),
		Option.flatMap((raw) =>
			Schema.decodeUnknownOption(JsonSchemaBits)(raw, { onExcessProperty: 'ignore' }),
		),
		Option.getOrElse((): JsonSchemaBits => ({})),
	)
}

function isNullLiteral(ast: AST.AST): boolean {
	return ast._tag === 'Literal' && ast.literal === null
}

/** Branches that mean "no value" rather than a value the input should describe. */
function isAbsentBranch(ast: AST.AST): boolean {
	return isNullLiteral(ast) || ast._tag === 'UndefinedKeyword'
}

/**
 * Peel refinements / transformations / null-unions down to the value the input
 * represents. Outer `jsonSchema` annotations win over inner ones — same rule as
 * a filter sitting beside an anyOf in JSON Schema output.
 */
function analyze(
	ast: AST.AST,
	outer: { readonly nullable: boolean; readonly bits: JsonSchemaBits } = {
		nullable: false,
		bits: {},
	},
): {
	base: AST.AST
	nullable: boolean
	bits: JsonSchemaBits
} {
	return Match.value(ast).pipe(
		Match.tag('Refinement', (cur) =>
			analyze(cur.from, {
				nullable: outer.nullable,
				// Outer annotations already in `outer.bits` win over this layer.
				bits: { ...readBits(cur), ...outer.bits },
			}),
		),
		Match.tag('Transformation', (cur) => {
			const inner = analyze(cur.from)
			return {
				base: inner.base,
				nullable: outer.nullable || inner.nullable,
				bits: { ...inner.bits, ...outer.bits },
			}
		}),
		Match.tag('Suspend', (cur) => analyze(cur.f(), outer)),
		Match.tag('Union', (cur) => {
			const present = cur.types.filter((t) => !isAbsentBranch(t))
			// Only `null` means the field can clear to null; `undefined` is optionality
			// (already on the property signature) and must not drop constraints.
			const nullable = outer.nullable || cur.types.some(isNullLiteral)
			// Only a single remaining branch is representable as one input.
			if (present.length !== 1) {
				return { base: cur, nullable, bits: outer.bits }
			}
			return pipe(
				Arr.head(present),
				Option.map((first) => {
					const inner = analyze(first)
					return {
						base: inner.base,
						nullable: nullable || inner.nullable,
						bits: { ...inner.bits, ...outer.bits },
					}
				}),
				Option.getOrElse(() => ({ base: cur, nullable, bits: outer.bits })),
			)
		}),
		Match.orElse((cur) => ({
			base: cur,
			nullable: outer.nullable,
			bits: outer.bits,
		})),
	)
}

function formatInputType(format: string | undefined): string | undefined {
	return Match.value(format).pipe(
		Match.when('email', () => 'email' as const),
		Match.when('uri', () => 'url' as const),
		Match.when('date', () => 'date' as const),
		Match.orElse(() => undefined),
	)
}

/**
 * Maps one analyzed field onto the input attributes that mean the same thing to
 * a browser. Anything with no HTML equivalent is dropped on purpose: the server
 * revalidates with the full schema.
 */
function attributesFor(
	base: AST.AST,
	bits: JsonSchemaBits,
	required: boolean,
): Constraints {
	// Only emit a type the format actually implies. A plain string says nothing
	// about presentation, and guessing "text" would stomp on type="password".
	const fromBase = Match.value(base._tag).pipe(
		Match.when('StringKeyword', (): Constraints => ({
			type: formatInputType(bits.format),
			minLength: bits.minLength,
			maxLength: bits.maxLength,
			// HTML anchors `pattern` implicitly and requires a full-value match,
			// which is what Effect's filters already mean, so the regex transfers.
			pattern: bits.pattern,
		})),
		Match.when('NumberKeyword', (): Constraints => ({
			type: 'number',
			min: bits.minimum,
			max: bits.maximum,
			step: bits.type === 'integer' ? 1 : undefined,
		})),
		Match.when('BooleanKeyword', (): Constraints => ({ type: 'checkbox' })),
		Match.orElse((): Constraints => {
			// Nested objects / enums / etc.: required is still meaningful; shape is not.
			if (bits.type === 'integer' || bits.type === 'number') {
				return {
					type: 'number',
					min: bits.minimum,
					max: bits.maximum,
					step: bits.type === 'integer' ? 1 : undefined,
				}
			}
			if (bits.type === 'boolean') {
				return { type: 'checkbox' }
			}
			if (
				bits.format !== undefined ||
				bits.minLength !== undefined ||
				bits.pattern !== undefined
			) {
				return {
					type: formatInputType(bits.format),
					minLength: bits.minLength,
					maxLength: bits.maxLength,
					pattern: bits.pattern,
				}
			}
			return {}
		}),
	)
	return required ? { required: true, ...fromBase } : fromBase
}

function asTypeLiteral(ast: AST.AST): Option.Option<AST.TypeLiteral> {
	return Match.value(ast).pipe(
		Match.tag('TypeLiteral', (cur) => Option.some(cur)),
		Match.tag('Transformation', (cur) => asTypeLiteral(cur.from)),
		Match.tag('Suspend', (cur) => asTypeLiteral(cur.f())),
		Match.tag('Refinement', (cur) => asTypeLiteral(cur.from)),
		Match.orElse(() => Option.none()),
	)
}

function constraintsForPayload<A, I, R>(
	schema: Schema.Schema<A, I, R>,
): Option.Option<Record<string, Constraints>> {
	return pipe(
		asTypeLiteral(schema.ast),
		Option.map((root) =>
			pipe(
				root.propertySignatures,
				Arr.filterMap((prop) => {
					if (typeof prop.name !== 'string') {
						return Option.none()
					}
					const { base, nullable, bits } = analyze(prop.type)
					return Option.some([
						prop.name,
						attributesFor(base, bits, !prop.isOptional && !nullable),
					] as const)
				}),
				Rec.fromEntries,
			),
		),
	)
}

const collected: Array<readonly [string, Record<string, Constraints>]> = []

HttpApi.reflect(Contract, {
	onGroup() {},
	onEndpoint({ group, endpoint }) {
		const constraints = pipe(
			endpoint.payloadSchema,
			Option.flatMap(constraintsForPayload),
			Option.filter((c) => !Rec.isEmptyRecord(c)),
		)
		if (Option.isSome(constraints)) {
			collected.push([`${group.identifier}.${endpoint.name}`, constraints.value] as const)
		}
	},
})

const result = Rec.fromEntries(collected)

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
console.log(`wrote constraints for ${Rec.size(result)} endpoints`)
