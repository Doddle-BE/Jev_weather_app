# Weather chat (DEMO)

**This is a demo project** for testing [TypeSafe Jev](https://typesafe.ai/blog/introducing-system-one-models-and-jev) (System One). It is not a production weather product.

Ask for the weather in a place. The app answers with the conditions there right now.

## Run the app

Install Node.js 20 or newer.

In this directory, run `pnpm install`.

Create a file named `.env` in this directory. Put the TypeSafe key in that file:

```
TYPESAFE_API_KEY=paste-your-key-here
```

The Vite process reads `.env`. The browser does not receive the key. Open-Meteo supplies the weather and needs no key.

Run `pnpm run dev`.

Open the URL that Vite prints.

Type `What's the weather in New York` and send it.

If you change `.env` while the server is already running, stop the server and start it again.

You can also run `pnpm run build` and then `pnpm run preview`. Both `dev` and `preview` serve `POST /api/turn` through the `weatherApi()` Vite plugin. Serving only the static files in `dist/` leaves that API unavailable.

## How Jev picks the place

Jev does not invent a city name as free text. It answers a TypeSafe System One `choice` question. The option list for that question is built on every request from the user's own words. There is no fixed list of cities in the app.

### How the choice options are built

Each turn sends a `Transcript`. That object holds user messages only. `latest` is the message being answered. `earlier` holds up to six previous user messages.

`buildCandidates` in `server/extract-place.ts` cuts every 1 to 3 word window from those messages. Clause punctuation such as `?` or `,` stops a window, so `"New York? And Boston"` never yields `"York And"`. Spans from `latest` come first. Then come spans from earlier messages, newest first. Duplicate text is dropped. The list stops at 254 spans.

`offerPlaces` turns those spans into the `choice` criteria. Each option's label is the exact substring the user typed. Each option's description says which request it came from (`latest_request` or `earlier_requests[i]`). The server also adds one fixed sentinel, `(no place named)`, for when none of the spans is a place.

`createPlaceExtractor` then calls `client.systemOne` with that question and the transcript as `state`. Jev returns one label plus probabilities for every option. The chosen label is always either a verbatim user span or the sentinel. That is why no curated place list is required. Any place the user can type becomes an option on that turn.

If the latest message names no place, the question text tells Jev to fall back to an earlier request. That is how a follow-up such as `"and the wind?"` can still resolve to the previous city.

### Example

Suppose you send this message:

```
What's the weather in New York
```

The transcript is `{ earlier: [], latest: "What's the weather in New York" }`.

`buildCandidates` cuts every 1 to 3 word window from that string. For this message the options are:

```
What's
What's the
What's the weather
the
the weather
the weather in
weather
weather in
weather in New
in
in New
in New York
New
New York
York
```

None of these came from a city database. They are slices of the message you typed. `"New York"` is in the list because those two words appear next to each other. `"Boston"` is not, because you did not type it.

`offerPlaces` turns that list into the `choice` criteria. Each label is the span text. Each description is `named in \`latest_request\``. The server then adds the sentinel. The question Jev answers is:

```
For a weather request: which city or place does the user want the weather for?
If they don't name one, pick the place from the earlier request.
```

So Jev is not asked to invent a place. It is asked to pick one label from that dynamic list (or `(no place named)`). A typical pick for this message is `New York`. The probabilities for the other spans, and for the sentinel, come back with the answer. The UI shows those under **Spans Jev considered**.

Only after that pick does the app call Open-Meteo with the text `New York`.

A second turn can reuse the same idea without naming the city again. If `earlier` is `["What's the weather in New York"]` and `latest` is `and the wind?`, `buildCandidates` still offers `"New York"` from the earlier message. The question text tells Jev to fall back when the latest message names no place. The pick can stay `New York` even though that phrase is not in the new message.

### After Jev answers

When Jev picks a span, `geocode` and `fetchCurrentWeather` call Open-Meteo with that text. The reply is a `TurnResult` with a `kind` such as `answered`, `place-not-found`, `no-place-named`, `extraction-unavailable`, or `weather-unavailable`. Domain outcomes return HTTP 200. A bad request shape returns HTTP 400.

There is no separate backend process. The `weatherApi()` Vite plugin serves `POST /api/turn` inside the same process that hosts the UI.

### What the reply shows

The reply names the words Jev picked. Then it shows the current temperature, the condition, and the wind. Open **Spans Jev considered** to see every option from that turn and its probability, including `(no place named)`.

### Where the Jev code lives

- `server/extract-place.ts` builds candidates, builds the `choice` criteria, and calls TypeSafe.
- `server/weather-turn.ts` runs extraction, then Open-Meteo.
- `shared/turn.ts` holds `Transcript`, span types, and `TurnResult`.
- `src/turn-view.tsx` renders the pick and the span probabilities.
