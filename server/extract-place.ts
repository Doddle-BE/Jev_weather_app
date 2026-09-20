import { choice, TypeSafeClient, type ChoiceCriteria, type ChoiceResponse } from "@typesafe-ai/sdk";
import {
  requestText,
  type Extraction,
  type SpanRef,
  type SpanSource,
  type Transcript,
} from "../shared/turn.ts";

const spanBrand = Symbol("candidate-span");

/** A span cut by `buildCandidates`. Other modules can accept it. They cannot construct it. */
export interface CandidateSpan extends SpanRef {
  readonly [spanBrand]: true;
}

export const PLACE_QUESTION =
  "For a weather request: which city or place does the user want the weather for? If they don't name one, pick the place from the earlier request.";

const NO_PLACE = "(no place named)";
const NO_PLACE_DESCRIPTION =
  "None of the other options is a city or place. The user has not named one in this request or in an earlier request.";

export const MISSING_KEY_MESSAGE =
  "Set TYPESAFE_API_KEY in .env at the project root, then restart npm run dev.";

const MAX_SPAN_WORDS = 3;
const MAX_SPANS = 254;

export type PlaceExtraction =
  | { readonly kind: "picked"; readonly place: CandidateSpan; readonly extraction: Extraction }
  | { readonly kind: "none"; readonly extraction: Extraction };

export type ExtractPlace = (transcript: Transcript) => Promise<PlaceExtraction>;

interface Token {
  readonly start: number;
  readonly end: number;
  breaksAfter: boolean;
}

interface OfferedPlaces {
  readonly criteria: ChoiceCriteria;
  readonly spans: readonly CandidateSpan[];
  readonly bySpanText: ReadonlyMap<string, CandidateSpan>;
}

function mintSpan(span: SpanRef): CandidateSpan {
  return {
    text: span.text,
    source: span.source,
    from: span.from,
    to: span.to,
    [spanBrand]: true,
  };
}

/**
 * Cuts 1–3 word windows. A window stops at `, ; : . ? !` so "New York? And Boston"
 * cannot become "York And".
 */
function tokensOf(text: string): Token[] {
  const tokens: Token[] = [];
  const pattern = /\S+/g;
  let match = pattern.exec(text);
  while (match !== null) {
    const raw = match[0];
    const rawStart = match.index;
    const lead = /^[^\p{L}\p{N}'’]+/u.exec(raw);
    const trail = /[^\p{L}\p{N}'’]+$/u.exec(raw);
    const leadLength = lead ? lead[0].length : 0;
    const trailLength = trail ? trail[0].length : 0;
    const start = rawStart + leadLength;
    const end = rawStart + raw.length - trailLength;
    const core = text.slice(start, end);
    const trailing = trailLength > 0 ? raw.slice(raw.length - trailLength) : "";
    const breaksAfter = /[,;:.?!]/.test(trailing) || /[,;:.?!]/.test(lead ? lead[0] : "");
    if (core.length > 0 && !/^\d+$/.test(core)) {
      tokens.push({ start, end, breaksAfter });
    } else if (breaksAfter && tokens.length > 0) {
      const previous = tokens[tokens.length - 1];
      if (previous) {
        previous.breaksAfter = true;
      }
    }
    match = pattern.exec(text);
  }
  return tokens;
}

function spansOf(text: string, source: SpanSource): CandidateSpan[] {
  const tokens = tokensOf(text);
  const spans: CandidateSpan[] = [];
  for (let index = 0; index < tokens.length; index += 1) {
    for (let width = 1; width <= MAX_SPAN_WORDS && index + width <= tokens.length; width += 1) {
      let crossesClause = false;
      for (let cursor = index; cursor < index + width - 1; cursor += 1) {
        const token = tokens[cursor];
        if (token?.breaksAfter) {
          crossesClause = true;
        }
      }
      if (crossesClause) {
        continue;
      }
      const first = tokens[index];
      const last = tokens[index + width - 1];
      if (!first || !last) {
        continue;
      }
      const from = first.start;
      const to = last.end;
      spans.push(
        mintSpan({
          text: text.slice(from, to),
          source,
          from,
          to,
        }),
      );
    }
  }
  return spans;
}

/** Latest request first, then earlier requests from newest to oldest. Caps at 254 spans. */
export function buildCandidates(transcript: Transcript): readonly CandidateSpan[] {
  const sources: SpanSource[] = [{ at: "latest" }];
  for (let index = transcript.earlier.length - 1; index >= 0; index -= 1) {
    sources.push({ at: "earlier", index });
  }
  const seen = new Set<string>();
  const spans: CandidateSpan[] = [];
  for (const source of sources) {
    for (const span of spansOf(requestText(transcript, source), source)) {
      const key = span.text.toLowerCase();
      if (seen.has(key)) {
        continue;
      }
      seen.add(key);
      spans.push(span);
      if (spans.length >= MAX_SPANS) {
        return spans;
      }
    }
  }
  return spans;
}

function describeSource(source: SpanSource): string {
  if (source.at === "latest") {
    return "named in `latest_request`";
  }
  return `named in \`earlier_requests[${source.index}]\``;
}

function offerPlaces(candidates: readonly CandidateSpan[]): OfferedPlaces {
  const criteria: Record<string, string> = {};
  const bySpanText = new Map<string, CandidateSpan>();
  for (const span of candidates) {
    criteria[span.text] = describeSource(span.source);
    bySpanText.set(span.text, span);
  }
  criteria[NO_PLACE] = NO_PLACE_DESCRIPTION;
  return { criteria, spans: candidates, bySpanText };
}

function classifyLabel(offered: OfferedPlaces, label: string): CandidateSpan | "none" {
  if (label === NO_PLACE) {
    return "none";
  }
  const span = offered.bySpanText.get(label);
  if (!span) {
    throw new Error(`Unknown place option: ${label}`);
  }
  return span;
}

/** Resolves a Choice label against the spans this transcript would offer. */
export function lookupPlace(transcript: Transcript, label: string): CandidateSpan | "none" {
  return classifyLabel(offerPlaces(buildCandidates(transcript)), label);
}

function readPick(
  place: ChoiceResponse,
  offered: OfferedPlaces,
  model: string,
): PlaceExtraction {
  const classified = classifyLabel(offered, place.choice);
  const noneProbability = place.probabilities[NO_PLACE] ?? 0;
  const extraction: Extraction = {
    model,
    placeQuestion: PLACE_QUESTION,
    candidates: offered.spans.map((span) => ({
      span: {
        text: span.text,
        source: span.source,
        from: span.from,
        to: span.to,
      },
      probability: place.probabilities[span.text] ?? 0,
    })),
    noneProbability,
    placeConfidence: place.confidence,
  };
  if (classified === "none") {
    return { kind: "none", extraction };
  }
  return { kind: "picked", place: classified, extraction };
}

export function createPlaceExtractor(client: TypeSafeClient): ExtractPlace {
  return async (transcript) => {
    const offered = offerPlaces(buildCandidates(transcript));
    const { answers, model } = await client.systemOne({
      state: {
        earlier_requests: [...transcript.earlier],
        latest_request: transcript.latest,
      },
      questions: {
        place: choice(PLACE_QUESTION, offered.criteria),
      },
    });
    return readPick(answers.place, offered, model);
  };
}

let cachedClient: TypeSafeClient | undefined;

export function typeSafeClient(): TypeSafeClient {
  const key = process.env.TYPESAFE_API_KEY;
  if (!key || key.trim() === "") {
    throw new Error(MISSING_KEY_MESSAGE);
  }
  if (!cachedClient) {
    cachedClient = new TypeSafeClient();
  }
  return cachedClient;
}
