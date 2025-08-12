import { Option } from "effect";

export const Option_first = <T>(x: T[]) => Option.fromNullable(x[0]);
