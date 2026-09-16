import { HttpApiBuilder } from '@effect/platform'

import { Contract } from '../../shared/httpApi.js'
import { withAuthContext } from '../db.js'
import { Posts } from '../services/posts.js'

export const PostsApiGroupLive = HttpApiBuilder.group(Contract, 'posts', (handlers) =>
	handlers
		.handle('list', ({ urlParams }) =>
			Posts.listBy({ username: urlParams.username, sort: urlParams.sort }).pipe(
				withAuthContext,
			),
		)
		.handle('getById', ({ path: { id } }) => Posts.byId(id).pipe(withAuthContext))
		.handle('create', ({ payload }) => Posts.insert(payload).pipe(withAuthContext)),
)
