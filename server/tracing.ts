import { Effect, Layer, Config, Option } from "effect";
import { NodeSdk } from "@effect/opentelemetry";
import {
  ConsoleSpanExporter,
  SimpleSpanProcessor,
  BatchSpanProcessor,
} from "@opentelemetry/sdk-trace-base";
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-http";
import packageJson from "../package.json" with { type: "json" };

const serviceName = packageJson.name;
const serviceVersion = packageJson.version;
const resource = { serviceName, serviceVersion };

export const TracingLayer = Layer.unwrapEffect(
  Effect.gen(function* () {
    const url = yield* Config.option(
      Config.string("OTEL_EXPORTER_OTLP_TRACES_ENDPOINT"),
    );
    const spanProcessor = Option.match(url, {
      onSome: (url) => new BatchSpanProcessor(new OTLPTraceExporter({ url })),
      onNone: () => new SimpleSpanProcessor(new ConsoleSpanExporter()),
    });
    return NodeSdk.layer(() => ({ resource, spanProcessor }));
  }),
);
