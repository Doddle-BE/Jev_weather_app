import type { Extraction, Location, SpanRef, TurnResult } from "../shared/turn";
import type { Turn } from "./chat";

export function TurnView(props: { readonly turn: Turn }) {
  const { turn } = props;
  const place = placeOf(turn.outcome.status === "done" ? turn.outcome.result : null);
  const highlight =
    place?.source.at === "latest"
      ? { from: place.from, to: place.to }
      : null;

  return (
    <article className="exchange">
      <p className="user">
        <HighlightedText text={turn.transcript.latest} from={highlight?.from} to={highlight?.to} />
      </p>
      <div className="assistant">{assistantBody(turn)}</div>
    </article>
  );
}

function placeOf(result: TurnResult | null): SpanRef | null {
  if (result === null) {
    return null;
  }
  if (result.kind === "answered" || result.kind === "place-not-found" || result.kind === "weather-unavailable") {
    return result.place;
  }
  return null;
}

function assistantBody(turn: Turn) {
  if (turn.outcome.status === "pending") {
    return <p>Checking the weather.</p>;
  }
  if (turn.outcome.status === "unreachable") {
    return <p>{turn.outcome.detail}</p>;
  }
  return <AssistantReply result={turn.outcome.result} />;
}

function AssistantReply(props: { readonly result: TurnResult }) {
  const { result } = props;
  if (result.kind === "answered") {
    return (
      <>
        <p>Selected: {result.place.text}.</p>
        <p>
          {formatPlace(result.location)}: {formatNumber(result.current.temperatureC)}°C,{" "}
          {result.current.condition.replaceAll("-", " ")}, wind {formatNumber(result.current.windKmh)} km/h.
        </p>
        <p>
          Feels like {formatNumber(result.current.feelsLikeC)}°C. Humidity {formatNumber(result.current.humidityPct)}%. Precipitation{" "}
          {formatNumber(result.current.precipitationMm)} mm.
        </p>
        <SpanList extraction={result.extraction} picked={result.place.text} />
      </>
    );
  }
  if (result.kind === "no-place-named") {
    return (
      <>
        <p>Which place do you want the weather for?</p>
        <SpanList extraction={result.extraction} picked={null} />
      </>
    );
  }
  if (result.kind === "place-not-found") {
    return (
      <>
        <p>I couldn&apos;t find a place called &quot;{result.place.text}&quot;.</p>
        <SpanList extraction={result.extraction} picked={result.place.text} />
      </>
    );
  }
  if (result.kind === "weather-unavailable") {
    return (
      <>
        <p>Weather service unavailable: {result.detail}</p>
        <SpanList extraction={result.extraction} picked={result.place.text} />
      </>
    );
  }
  return <p>{result.detail}</p>;
}

function formatPlace(location: Location): string {
  if (location.region === null) {
    return `${location.name}, ${location.country}`;
  }
  return `${location.name}, ${location.region}, ${location.country}`;
}

function formatNumber(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

function SpanList(props: { readonly extraction: Extraction; readonly picked: string | null }) {
  const { extraction, picked } = props;
  return (
    <details className="spans">
      <summary>Spans Jev considered</summary>
      <p>{extraction.placeQuestion}</p>
      <ul>
        {extraction.candidates.map((candidate) => {
          const marked = candidate.span.text === picked;
          return (
            <li key={`${candidate.span.from}-${candidate.span.to}-${candidate.span.text}`} className={marked ? "picked" : undefined}>
              {candidate.span.text} {candidate.probability.toFixed(2)}
              {marked ? " picked" : ""}
            </li>
          );
        })}
        <li className={picked === null ? "picked" : undefined}>
          (no place named) {extraction.noneProbability.toFixed(2)}
          {picked === null ? " picked" : ""}
        </li>
      </ul>
    </details>
  );
}

function HighlightedText(props: { readonly text: string; readonly from: number | undefined; readonly to: number | undefined }) {
  const { text, from, to } = props;
  if (from === undefined || to === undefined || from < 0 || to > text.length || from >= to) {
    return <>{text}</>;
  }
  return (
    <>
      {text.slice(0, from)}
      <mark>{text.slice(from, to)}</mark>
      {text.slice(to)}
    </>
  );
}
