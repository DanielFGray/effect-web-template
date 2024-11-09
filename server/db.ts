import * as PgKysely from "@effect/sql-kysely/Pg";
import { Context, Layer } from "effect";
import type { DB } from "kysely-codegen";

export class PgAuthDB extends Context.Tag("PgAuthDB")<
	PgAuthDB,
	PgKysely.EffectKysely<DB>
>() {}
export const PgAuthLive = Layer.effect(PgAuthDB, PgKysely.make<DB>());

export class PgRootDB extends Context.Tag("PgRootDB")<
	PgRootDB,
	PgKysely.EffectKysely<DB>
>() {}
export const PgRootLive = Layer.effect(PgRootDB, PgKysely.make<DB>());
