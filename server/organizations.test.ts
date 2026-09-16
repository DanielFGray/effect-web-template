import {
	HttpClient,
	Cookies,
	HttpClientResponse,
	HttpClientRequest,
	FetchHttpClient,
} from '@effect/platform'
import { suite, expect, it } from '@effect/vitest'
import { Effect, Ref, Config, Schema as S } from 'effect'

import {
	Organization,
	OrganizationMember,
	OrganizationInvitation,
} from '../shared/schemas.js'

const TestHttpClientLive = FetchHttpClient.layer

const baseUrl = Config.string('VITE_ROOT_URL').pipe(
	Effect.map((url) => `${new URL(url).origin}/api`),
)

const runId = Math.random().toString(36).slice(2, 8)

suite('organizations HTTP flow', () => {
	it.live('two-user org lifecycle: create, invite, accept, transfer, delete', () =>
		Effect.gen(function* () {
			const client = yield* HttpClient.HttpClient
			const cookiesA = yield* Ref.make(Cookies.empty)
			const cookiesB = yield* Ref.make(Cookies.empty)
			const clientA = client.pipe(HttpClient.withCookiesRef(cookiesA))
			const clientB = client.pipe(HttpClient.withCookiesRef(cookiesB))

			const usernameA = `orgflow_a_${runId}`
			const usernameB = `orgflow_b_${runId}`
			const slug = `test-org-${runId}`

			const registerA = yield* HttpClientRequest.post(
				`${yield* baseUrl}/auth/register`,
			).pipe(
				HttpClientRequest.bodyJson({
					username: usernameA,
					password: 'password123',
					email: `orgflow_a_${runId}@example.com`,
				}),
				Effect.flatMap(clientA.execute),
			)
			expect(registerA.status).toBe(201)
			const userA = yield* HttpClientResponse.schemaBodyJson(S.Struct({ id: S.UUID }))(
				registerA,
			)

			const createResponse = yield* HttpClientRequest.post(
				`${yield* baseUrl}/organizations`,
			).pipe(
				HttpClientRequest.bodyJson({ slug, name: 'Org Flow A' }),
				Effect.flatMap(clientA.execute),
			)
			expect(createResponse.status).toBe(201)
			const org = yield* HttpClientResponse.schemaBodyJson(Organization.select)(
				createResponse,
			)
			expect(org).toHaveProperty('id')
			expect(org.slug).toBe(slug)
			const orgId = org.id

			const getResponse = yield* clientA.get(`${yield* baseUrl}/organizations/${orgId}`)
			expect(getResponse.status).toBe(200)
			const got = yield* HttpClientResponse.schemaBodyJson(S.NullOr(Organization.select))(
				getResponse,
			)
			expect(got).toHaveProperty('id', orgId)
			expect(got).toHaveProperty('name', 'Org Flow A')

			const listResponse = yield* clientA.get(`${yield* baseUrl}/organizations`)
			expect(listResponse.status).toBe(200)
			const listed = yield* HttpClientResponse.schemaBodyJson(
				S.Array(Organization.select),
			)(listResponse)
			expect(listed.find((o) => o.id === orgId)).toBeDefined()

			const patchResponse = yield* HttpClientRequest.patch(
				`${yield* baseUrl}/organizations/${orgId}`,
			).pipe(
				HttpClientRequest.bodyJson({ name: 'Org Flow A Updated' }),
				Effect.flatMap(clientA.execute),
			)
			expect(patchResponse.status).toBe(200)
			const patched = yield* HttpClientResponse.schemaBodyJson(Organization.select)(
				patchResponse,
			)
			expect(patched.name).toBe('Org Flow A Updated')

			const registerB = yield* HttpClientRequest.post(
				`${yield* baseUrl}/auth/register`,
			).pipe(
				HttpClientRequest.bodyJson({
					username: usernameB,
					password: 'password123',
					email: `orgflow_b_${runId}@example.com`,
				}),
				Effect.flatMap(clientB.execute),
			)
			expect(registerB.status).toBe(201)
			const userB = yield* HttpClientResponse.schemaBodyJson(S.Struct({ id: S.UUID }))(
				registerB,
			)

			// invite_to_organization raises VRFY2 unless the invitee is verified
			const verifyB = yield* client.get(
				`${yield* baseUrl}/verifyUser?username=${encodeURIComponent(usernameB)}`,
			)
			expect(verifyB.status).toBe(200)

			const inviteResponse = yield* HttpClientRequest.post(
				`${yield* baseUrl}/organizations/${orgId}/invite`,
			).pipe(
				HttpClientRequest.bodyJson({
					username: usernameB,
					email: null,
				}),
				Effect.flatMap(clientA.execute),
			)
			expect(inviteResponse.status).toBe(204)

			const invitationsAsB = yield* clientB.get(
				`${yield* baseUrl}/organizations/${orgId}/invitations`,
			)
			expect(invitationsAsB.status).toBe(200)
			const invitations = yield* HttpClientResponse.schemaBodyJson(
				S.Array(OrganizationInvitation.select),
			)(invitationsAsB)
			expect(invitations.length).toBeGreaterThanOrEqual(1)
			const invitation = invitations.find((i) => i.user_id === userB.id)
			expect(invitation).toBeDefined()
			const invitationId = invitation!.id

			const acceptResponse = yield* HttpClientRequest.post(
				`${yield* baseUrl}/organizations/invitations/${invitationId}/accept`,
			).pipe(HttpClientRequest.bodyJson({ code: null }), Effect.flatMap(clientB.execute))
			expect(acceptResponse.status).toBe(204)

			const membersResponse = yield* clientA.get(
				`${yield* baseUrl}/organizations/${orgId}/members`,
			)
			expect(membersResponse.status).toBe(200)
			const members = yield* HttpClientResponse.schemaBodyJson(
				S.Array(OrganizationMember),
			)(membersResponse)
			expect(members.map((m) => m.user_id).sort()).toEqual([userA.id, userB.id].sort())

			const transferBilling = yield* HttpClientRequest.post(
				`${yield* baseUrl}/organizations/${orgId}/transfer-billing-contact`,
			).pipe(
				HttpClientRequest.bodyJson({ userId: userB.id }),
				Effect.flatMap(clientA.execute),
			)
			expect(transferBilling.status).toBe(200)
			const billingOrg = yield* HttpClientResponse.schemaBodyJson(
				S.NullOr(Organization.select),
			)(transferBilling)
			expect(billingOrg).not.toBeNull()

			const transferOwner = yield* HttpClientRequest.post(
				`${yield* baseUrl}/organizations/${orgId}/transfer-ownership`,
			).pipe(
				HttpClientRequest.bodyJson({ userId: userB.id }),
				Effect.flatMap(clientA.execute),
			)
			expect(transferOwner.status).toBe(200)
			const ownedOrg = yield* HttpClientResponse.schemaBodyJson(
				S.NullOr(Organization.select),
			)(transferOwner)
			expect(ownedOrg).not.toBeNull()

			const removeA = yield* clientB.execute(
				HttpClientRequest.del(
					`${yield* baseUrl}/organizations/${orgId}/members/${userA.id}`,
				),
			)
			expect(removeA.status).toBe(204)

			const deleteOrg = yield* clientB.execute(
				HttpClientRequest.del(`${yield* baseUrl}/organizations/${orgId}`),
			)
			expect(deleteOrg.status).toBe(204)

			const afterDelete = yield* clientB.get(`${yield* baseUrl}/organizations/${orgId}`)
			expect(afterDelete.status).toBe(200)
			const gone = yield* HttpClientResponse.schemaBodyJson(
				S.NullOr(Organization.select),
			)(afterDelete)
			expect(gone).toBeNull()
		}).pipe(Effect.provide(TestHttpClientLive)),
		// Cold full-suite import ~6s + alone wall ~3s; default 5s flakes on cold start.
		{ timeout: 15_000 },
	)

	it.live('invite to org you do not own returns AccessDenied', () =>
		Effect.gen(function* () {
			const client = yield* HttpClient.HttpClient
			const cookiesOwner = yield* Ref.make(Cookies.empty)
			const cookiesOther = yield* Ref.make(Cookies.empty)
			const clientOwner = client.pipe(HttpClient.withCookiesRef(cookiesOwner))
			const clientOther = client.pipe(HttpClient.withCookiesRef(cookiesOther))

			const ownerName = `orgdeny_owner_${runId}`
			const otherName = `orgdeny_other_${runId}`
			const slug = `test-deny-${runId}`

			yield* HttpClientRequest.post(`${yield* baseUrl}/auth/register`).pipe(
				HttpClientRequest.bodyJson({
					username: ownerName,
					password: 'password123',
					email: `orgdeny_owner_${runId}@example.com`,
				}),
				Effect.flatMap(clientOwner.execute),
			)

			const createResponse = yield* HttpClientRequest.post(
				`${yield* baseUrl}/organizations`,
			).pipe(
				HttpClientRequest.bodyJson({ slug, name: 'Deny Org' }),
				Effect.flatMap(clientOwner.execute),
			)
			expect(createResponse.status).toBe(201)
			const org = yield* HttpClientResponse.schemaBodyJson(Organization.select)(
				createResponse,
			)

			yield* HttpClientRequest.post(`${yield* baseUrl}/auth/register`).pipe(
				HttpClientRequest.bodyJson({
					username: otherName,
					password: 'password123',
					email: `orgdeny_other_${runId}@example.com`,
				}),
				Effect.flatMap(clientOther.execute),
			)

			const inviteDenied = yield* HttpClientRequest.post(
				`${yield* baseUrl}/organizations/${org.id}/invite`,
			).pipe(
				HttpClientRequest.bodyJson({
					username: 'nobody',
					email: null,
				}),
				Effect.flatMap(clientOther.execute),
			)
			expect(inviteDenied.status).toBe(403)
		}).pipe(Effect.provide(TestHttpClientLive)),
		{ timeout: 15_000 },
	)
})
