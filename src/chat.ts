import { TRANSCRIPT_LIMITS, type Transcript, type TurnResult } from "../shared/turn";

export type TurnOutcome =
  | { readonly status: "pending" }
  | { readonly status: "done"; readonly result: TurnResult }
  | { readonly status: "unreachable"; readonly detail: string };

export interface Turn {
  readonly id: string;
  readonly transcript: Transcript;
  readonly outcome: TurnOutcome;
}

/** The last six user messages, plus the text about to be sent. */
export function transcriptFrom(turns: readonly Turn[], latest: string): Transcript {
  const earlier = turns
    .map((turn) => turn.transcript.latest)
    .slice(-TRANSCRIPT_LIMITS.maxEarlier);
  return { earlier, latest };
}
