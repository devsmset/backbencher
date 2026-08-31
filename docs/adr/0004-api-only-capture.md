# Sessions capture API traffic only

The recorder emits `api_request` and `api_response` events and nothing else. The injected
instrumentation script, the DOM listeners and locator generators, the `exposeBinding` bridge for UI
values, the popup/navigation/marker event types, and the three-second window that joined a call to the
nearest preceding UI event have all been removed.

## Why

Replay is API-only, so nothing downstream ever consumed a locator. The compiler emits Playwright
tests in API mode; there was no code path in which an xpath or a CSS selector could be used, and none
was planned. The capture existed because the prototype grew from a UI recorder, not because anything
needed it.

Carrying it was not free. It was the single largest source of complexity in the recorder — in v1, a
~200-line locator and listener block duplicated between the init-script path and the popup path, where
every change had to be made twice. It also forced a second redaction boundary inside the browser, so
that password fields and configured selectors never crossed the binding, guarding values that were
then discarded anyway.

The meaning that UI capture was supposed to supply is now supplied deliberately instead of
heuristically. A Session carries the analyst's own name and goal, and an Exemplar carries a written
intent per step. That is a human stating what a flow was for, rather than an inference drawn from
whichever DOM event happened to fire within three seconds of a call.

## Consequences

- No UI regression testing, and no path to it without reversing this decision.
- A Session cannot be saved without a name and a goal. `stop()` requires both and throws otherwise,
  because they are the only remaining record of intent and cannot be reconstructed later.
- Redaction happens at exactly one boundary, at capture time on the Node side.
- Cross-origin iframes and popups are covered for free by `context`-level listeners, with no
  per-frame script injection to maintain.
