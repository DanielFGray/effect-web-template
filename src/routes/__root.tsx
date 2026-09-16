import type { ReactNode } from 'react'
import {
	Outlet,
	createRootRoute,
	HeadContent,
	Scripts,
	Link,
} from '@tanstack/react-router'
import { RegistryProvider, Result, useAtomValue } from '@effect-atom/atom-react'
import { currentUserAtom } from '../lib/api.js'
import '../styles.css'

export const Route = createRootRoute({
	head: () => ({
		meta: [
			{
				charSet: 'utf-8',
			},
			{
				name: 'viewport',
				content: 'width=device-width, initial-scale=1',
			},
			{
				title: 'effect-web-template',
			},
		],
	}),
	component: RootComponent,
})

function RootComponent() {
	return (
		<RootDocument>
			<Outlet />
		</RootDocument>
	)
}

function Nav() {
	const userResult = useAtomValue(currentUserAtom)
	const user = Result.isSuccess(userResult) ? userResult.value : null

	return (
		<nav data-cy="nav">
			<ul className="flex-row gap-2">
				<li>
					<Link to="/" data-cy="nav-home" activeProps={{ 'aria-current': 'page' }}>
						home
					</Link>
				</li>
				{user ? (
					<>
						<li>hi {user.username}!</li>
						<li>
							<Link
								to="/settings"
								data-cy="nav-settings"
								activeProps={{ 'aria-current': 'page' }}
							>
								settings
							</Link>
						</li>
						<li>
							<Link
								to="/logout"
								data-cy="nav-logout"
								activeProps={{ 'aria-current': 'page' }}
							>
								log out
							</Link>
						</li>
					</>
				) : (
					<>
						<li>
							<Link
								to="/login"
								data-cy="nav-login"
								activeProps={{ 'aria-current': 'page' }}
							>
								login
							</Link>
						</li>
						<li>
							<Link
								to="/register"
								data-cy="nav-register"
								activeProps={{ 'aria-current': 'page' }}
							>
								register
							</Link>
						</li>
					</>
				)}
			</ul>
		</nav>
	)
}

function RootDocument({ children }: Readonly<{ children: ReactNode }>) {
	return (
		<html>
			<head>
				<HeadContent />
			</head>
			<body>
				<RegistryProvider>
					<Nav />
					{children}
				</RegistryProvider>
				<Scripts />
			</body>
		</html>
	)
}
