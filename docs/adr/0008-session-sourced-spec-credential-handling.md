# Specs generated from sessions never carry captured credentials

A TestSpec generated from a recorded Session copies no request headers, and replaces credential-named
body, query, and form-encoded values with `{{env.BB_SECRET_<NAME>}}` references. `data/` is gitignored
as a whole.

## Why

ADR-0006 captures everything verbatim, including live usernames, passwords, tokens, and cookies.
A spec generated from a Session is built from those real calls, and `bb test compile` writes it to
`data/generated-tests/<specId>.spec.ts`, inlining the entire spec including `request.body` and query
parameters. Before this decision that directory was not ignored, and a real login password reached a
git-tracked path.

Headers can simply be dropped: auth is supplied at run time from the spec's `authProfile`. Bodies and
query strings cannot be dropped, because they are the request.

## Decision

- Headers are never copied; only a header provably fed by an earlier response body is kept, as a
  template.
- A JSON body leaf, query parameter, or form-encoded body value whose name matches
  `/(pass(word|wd)?|secret|token|otp|totp|api[-_]?key|credential|authorization|twofa)/i` becomes
  `{{env.BB_SECRET_<NAME>}}` (name upper-cased, non-alphanumerics to `_`). A producer edge or a
  client-generated `{{faker.uuid}}` still takes precedence.
- The runtime throws on an unset `{{env.X}}` (`packages/testkit/src/templates.ts`), so a missing
  secret fails loudly instead of replaying a stale credential.
- `data/` is gitignored in full.

## Consequences

- Analysts must set `BB_SECRET_*` environment variables to replay login flows.
- Name-based matching can false-positive (a harmless field named `tokenCount` becomes an env ref; this
  fails loudly and is fixed by editing the spec) and false-negative (a secret with an innocuous name
  still leaks into the spec). Generated specs must therefore still not be committed blindly.
