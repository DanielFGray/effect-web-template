/// <reference types="Cypress" />

context('change password', () => {
	beforeEach(() => cy.serverCommand('clearTestUsers'))

	it('can navigate to settings page', () => {
		// Setup
		cy.login({ redirectTo: '/', password: null, verified: true })

		// Action
		cy.getCy('nav-settings').click()
		cy.url().should('equal', Cypress.env('VITE_ROOT_URL') + '/settings')
	})

	it('user can change password, log out, and log in with new password', () => {
		// Setup
		cy.login({ redirectTo: '/settings', password: 'oldpassword', verified: true })

		cy.url().should('equal', Cypress.env('VITE_ROOT_URL') + '/settings') // Should be on settings
		cy.getCy('settings-password-form').should('have.attr', 'novalidate')

		// Action
		cy.get('input[name=oldPassword]').type('oldpassword!') // use incorrect password
		cy.get('input[name=newPassword]').type('newpassword')
		cy.get('input[name=confirmPassword]').type('newpassword')
		cy.getCy('settings-change-password-submit').click()

		// Assertion
		cy.contains('Incorrect password').should('exist') // should fail

		// use correct password
		cy.get('input[name=oldPassword]').type('{backspace}')
		cy.getCy('settings-change-password-submit').click()

		// Assertion
		cy.contains('Password updated').should('exist')

		// Action — nav logout is a POST form; one click ends the session
		cy.getCy('nav-logout').click()

		// should be logged out
		cy.getCy('nav-login').should('exist')

		cy.getCy('nav-login').click()
		cy.get('form').should('have.attr', 'novalidate')
		cy.getCy('login-id-input').type('testuser')
		cy.getCy('login-password-input').type('newpassword')
		cy.getCy('login-submit-button').click()

		// Assertion
		cy.getCy('nav-login').should('not.exist') // should be logged in
		cy.getCy('nav-logout').should('exist')
	})
})
