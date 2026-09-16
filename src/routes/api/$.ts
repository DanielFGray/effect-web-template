import { createFileRoute } from '@tanstack/react-router'

import { handler } from '../../lib/runtime.server.js'

const handle = ({ request }: { request: Request }) => handler(request)

export const Route = createFileRoute('/api/$')({
	server: {
		handlers: {
			GET: handle,
			POST: handle,
			PUT: handle,
			PATCH: handle,
			DELETE: handle,
			OPTIONS: handle,
		},
	},
})
