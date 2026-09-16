import { DevTools } from '@effect/experimental'
import { NodeSocket } from '@effect/platform-node'
import { Config, Effect, Layer } from 'effect'

export const DevToolsLive = Layer.unwrapEffect(
	Effect.gen(function* () {
		const nodeEnv = yield* Config.string('NODE_ENV')
		if (nodeEnv === 'production') return Layer.empty

		return DevTools.layerSocket.pipe(Layer.provide(NodeSocket.layerNet({ port: 34437 })))
	}),
)
