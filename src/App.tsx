import type { FormEvent } from "react";
import { useState } from "react";
import { sendTurn } from "./api";
import { transcriptFrom, type Turn } from "./chat";
import { TurnView } from "./turn-view";

export function App() {
  const [turns, setTurns] = useState<readonly Turn[]>([]);
  const [draft, setDraft] = useState("");
  const [isPending, setIsPending] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const text = draft.trim();
    if (text === "" || isPending) {
      return;
    }
    if (text.length > 500) {
      return;
    }
    const transcript = transcriptFrom(turns, text);
    const id = crypto.randomUUID();
    setTurns((current) => [...current, { id, transcript, outcome: { status: "pending" } }]);
    setDraft("");
    setIsPending(true);
    try {
      const result = await sendTurn(transcript);
      setTurns((current) =>
        current.map((turn) =>
          turn.id === id ? { id, transcript, outcome: { status: "done", result } } : turn,
        ),
      );
    } catch (error) {
      const detail = error instanceof Error ? error.message : "Request failed";
      setTurns((current) =>
        current.map((turn) =>
          turn.id === id ? { id, transcript, outcome: { status: "unreachable", detail } } : turn,
        ),
      );
    } finally {
      setIsPending(false);
    }
  }

  return (
    <main className="shell">
      <h1>Weather</h1>
      <div className="thread">
        {turns.length === 0 ? <p className="hint">Ask for the weather in a city.</p> : null}
        {turns.map((turn) => (
          <TurnView key={turn.id} turn={turn} />
        ))}
      </div>
      <form className="composer" onSubmit={handleSubmit}>
        <label className="sr" htmlFor="message">
          Message
        </label>
        <input
          id="message"
          value={draft}
          disabled={isPending}
          placeholder="What's the weather in New York"
          onChange={(event) => {
            setDraft(event.target.value);
          }}
        />
        <button type="submit" disabled={isPending || draft.trim() === "" || draft.trim().length > 500}>
          Send
        </button>
      </form>
      {draft.trim().length > 500 ? <p className="hint">Keep the message under 500 characters.</p> : null}
    </main>
  );
}
