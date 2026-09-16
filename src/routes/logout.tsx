import { createFileRoute, useNavigate, useRouter } from '@tanstack/react-router'
import { createServerFn, useServerFn } from '@tanstack/react-start'
import { Effect } from 'effect'
import { useEffect } from 'react'

import { logoutAndClearSession } from '../../server/auth.js'
import { formResultFromError, Spinner, type FormResult } from '../components.js'
import { runServer } from '../lib/runtime.server.js'

type ActionResult = { ok: true; data: null } | { ok: false; error: FormResult }

const logoutFn = createServerFn({ method: 'POST' }).handler((): Promise<ActionResult> =>
	runServer(
		logoutAndClearSession.pipe(
			Effect.map((): ActionResult => ({ ok: true, data: null })),
			Effect.catchAll((err) =>
				Effect.succeed({
					ok: false as const,
					error: formResultFromError(err),
				}),
			),
		),
	),
)

export const Route = createFileRoute('/logout')({
	component: Logout,
})

function Logout() {
	const navigate = useNavigate()
	const router = useRouter()
	const logout = useServerFn(logoutFn)

	useEffect(() => {
		let cancelled = false
		void (async () => {
			await logout()
			if (!cancelled) {
				await router.invalidate()
				void navigate({ to: '/' })
			}
		})()
		return () => {
			cancelled = true
		}
	}, [logout, navigate, router])

	return <Spinner />
}
