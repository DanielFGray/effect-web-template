import { useEffect } from 'react'
import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useAtomSet } from '@effect-atom/atom-react'
import { ApiClient } from '../lib/api.js'
import { Spinner } from '../components.js'

export const Route = createFileRoute('/logout')({
	component: Logout,
})

function Logout() {
	const navigate = useNavigate()
	const logout = useAtomSet(ApiClient.mutation('users', 'logout'), {
		mode: 'promiseExit',
	})

	useEffect(() => {
		let cancelled = false
		void (async () => {
			await logout({ reactivityKeys: ['currentUser'] })
			if (!cancelled) {
				void navigate({ to: '/' })
			}
		})()
		return () => {
			cancelled = true
		}
	}, [logout, navigate])

	return <Spinner />
}
