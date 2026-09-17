// ***********************************************
// For more comprehensive examples of custom
// commands please read more here:
// https://on.cypress.io/custom-commands
// ***********************************************
//
//
// -- This is a parent command --
// Cypress.Commands.add("login", (email, password) => { ... })
//
//
// -- This is a child command --
// Cypress.Commands.add("drag", { prevSubject: 'element'}, (subject, options) => { ... })
//
//
// -- This is a dual command --
// Cypress.Commands.add("dismiss", { prevSubject: 'optional'}, (subject, options) => { ... })
//
//
// -- This is will overwrite an existing command --
// Cypress.Commands.overwrite("visit", (originalFn, url, options) => { ... })

/// <reference types="Cypress" />

type Chainable<Subject = any> = Cypress.Chainable<Subject>

type User = {
	id: string
	username: string
	name: string
	is_admin: boolean
	is_verified: boolean
}

function getCy(cyName: string): Chainable<JQuery<HTMLElement>> {
	return cy.get(`[data-cy=${cyName}]`)
}

/**
 * Deletes all users with username starting 'test'.
 */
function serverCommand(command: 'clearTestUsers'): Chainable<{
	success: true
}>

/**
 * Deletes all organizations with slug starting 'test'.
 */
function serverCommand(command: 'clearTestOrganizations'): Chainable<{
	success: true
}>

/**
 * Creates a verified or unverified user, bypassing all safety checks.
 * Redirects to `next`.
 *
 * Default values:
 *
 * - username: `testuser`
 * - email: `${username}@example.com`
 * - verified: false
 * - name: `${username}`
 * - password: `TestUserPassword`
 * - next: `/`
 */
function serverCommand(
	command: 'createUser',
	payload: {
		username?: string
		email?: string
		verified?: boolean
		name?: string
		password?: string
		next?: string
	},
): Chainable<{
	user: User
	userEmailId: string
	verificationToken: string | null
}>

/**
 * Gets the secrets for the specified User, allowing Cypress to perform User
 * validation. If unspecified, User defaults to `testuser@example.com`.
 */
function serverCommand(
	command: 'getUserSecrets',
	payload?: { username?: string },
): Chainable<{
	user_id: string
	password_hash: string | null
	last_login_at: string
	failed_password_attempts: number
	first_failed_password_attempt: string | null
	reset_password_token: string | null
	reset_password_token_generated: string | null
	failed_reset_password_attempts: number
	first_failed_reset_password_attempt: string | null
	delete_account_token: string | null
	delete_account_token_generated: string | null
}>

/**
 * Gets the secrets for the specified email, allowing Cypress to perform email
 * validation. If unspecified, email defaults to `testuser@example.com`.
 */
function serverCommand(
	command: 'getEmailSecrets',
	payload?: { email?: string },
): Chainable<{
	user_email_id: string
	verification_token: string | null
}>

/**
 * Marks the given user as verified. Used for testing live user subscription
 * updates.
 */
function serverCommand(
	command: 'verifyUser',
	payload?: { username?: string },
): Chainable<{ success: true }>

type TestingPayload = {
	username?: string
	email?: string
	verified?: boolean
	name?: string
	avatarUrl?: string | null
	password?: string
}

type TestingCommand =
	| 'clearTestUsers'
	| 'clearTestOrganizations'
	| 'createUser'
	| 'getUserSecrets'
	| 'getEmailSecrets'
	| 'verifyUser'

type TestingResult =
	| { success: boolean }
	| { user: User; userEmailId: string; verificationToken: string | null }
	| {
			user_id: string
			password_hash: string | null
			delete_account_token: string | null
			delete_account_token_generated: string | null
			reset_password_token: string | null
	  }
	| { user_email_id: string; verification_token: string | null }

// The testing API has one typed endpoint per Cypress helper operation.
function serverCommand(
	command: TestingCommand,
	payload?: TestingPayload,
): Chainable<TestingResult> {
	const root = Cypress.env('VITE_ROOT_URL')

	switch (command) {
		case 'clearTestUsers':
		case 'clearTestOrganizations':
			return cy.request(`${root}/api/${command}`).its('body')
		case 'createUser':
			return cy
				.request({ method: 'POST', url: `${root}/api/createUser`, body: payload })
				.its('body')
		case 'getUserSecrets':
			return cy
				.request(
					`${root}/api/getUserSecrets?username=${encodeURIComponent(payload?.username ?? 'testuser')}`,
				)
				.its('body')
		case 'getEmailSecrets':
			return cy
				.request(
					`${root}/api/getEmailSecrets?email=${encodeURIComponent(payload?.email ?? 'testuser@example.com')}`,
				)
				.its('body')
		case 'verifyUser':
			return cy
				.request(
					`${root}/api/verifyUser?username=${encodeURIComponent(payload?.username ?? 'testuser')}`,
				)
				.its('body')
		default:
			const _exhaustive: never = command
			return _exhaustive
	}
}

function login(payload?: {
	redirectTo?: string
	username?: string
	name?: string
	verified?: boolean
	password?: string | null
	orgs?: [[string, string] | [string, string, boolean]]
}): Chainable<Window> {
	const username = payload?.username ?? 'testuser'
	const password = payload?.password ?? 'TestUserPassword'
	const redirectTo = payload?.redirectTo ?? '/'

	return cy
		.serverCommand('createUser', {
			username,
			name: payload?.name,
			verified: payload?.verified,
			password,
		})
		.then(() =>
			cy
				.request({
					method: 'POST',
					url: `${Cypress.env('VITE_ROOT_URL')}/api/auth/login`,
					body: { id: username, password },
				})
				.then(() => cy.visit(Cypress.env('VITE_ROOT_URL') + redirectTo)),
		)
}

Cypress.Commands.add('getCy', getCy)
Cypress.Commands.add('serverCommand', serverCommand)
Cypress.Commands.add('login', login)

export {} // Make this a module so we can `declare global`

declare global {
	// eslint-disable-next-line @typescript-eslint/no-namespace
	namespace Cypress {
		interface Chainable {
			getCy: typeof getCy
			serverCommand: typeof serverCommand
			login: typeof login
		}
	}
}
