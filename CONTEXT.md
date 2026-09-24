# Backbencher

Backbencher turns recorded product usage into an API catalog an analyst annotates once, then composes
new API scenarios from that catalog in response to a plain-language goal. This file is the shared
vocabulary for that domain — it is a glossary, not a spec.

## Language

### Capture

**Session**:
One recorded run of the product by an analyst, carrying the analyst's own name and goal for it.
_Avoid_: Recording, trace, scenario

**Call**:
One observed request/response instance that occurred during a Session.
_Avoid_: Event, API call, hit

**Redundant Call**:
A Call that produces no value an earlier Call to the same Operation in the same Session has not
already produced.
_Avoid_: Duplicate call, repeat, noise

**Curated Session**:
A Session reduced to the Calls that carry its meaning — the recording minus Redundant Calls and
minus what the Analyst deleted by hand.
_Avoid_: Cleaned session, filtered session, lean session

**Analyst**:
The person who records Sessions, annotates the Catalog, and approves Compositions.
_Avoid_: Operator, user, tester

### Catalog

**Catalog**:
The set of unique Operations observed across every Session.
_Avoid_: API model, spec, inventory

**Operation**:
A unique endpoint in the Catalog, identified across Sessions by its method, host, and path template.
_Avoid_: Endpoint, route, API

**CatalogAnnotation**:
The human meta that makes an Operation intelligible to the composer: what it is called and what it
does.
_Avoid_: Annotation, metadata, documentation

**TestingAnnotation**:
Human meta consumed only when generating and running tests. It never affects whether an Operation
can be composed with.
_Avoid_: Guidance, test config

**Ready**:
The state of an Operation that has both a name and a description in its CatalogAnnotation. Only
Ready Operations may be selected by the composer.
_Avoid_: Reviewed, approved, annotated

**Suggested**:
A machine-proposed CatalogAnnotation awaiting human acceptance. Suggested meta never makes an
Operation Ready.
_Avoid_: Draft annotation, auto-annotation

### Dependencies

**Dependency**:
A derived fact that one Operation needs a value another Operation produces. Always inferred from
observed Calls, never entered by hand.
_Avoid_: Prerequisite, requirement, link

**Role**:
The semantic kind of a Dependency — an auth token, a resource identifier — as distinct from the
literal field it travels in.
_Avoid_: Type, category

**Client-generated value**:
A request value with no producer anywhere in the corpus, minted fresh on each use. It is not an
unmet Dependency.
_Avoid_: Generated field, random value

### Composition

**Goal**:
The analyst's plain-language statement of what a Session or Composition is for. Always written by a
human, never by a model.
_Avoid_: Intent, description, prompt

**Reference Session**:
A Curated Session the Analyst has marked as teaching material for the composer. It is never approved
and never tested — it only teaches.
_Avoid_: Exemplar, scenario, example, template

**Reference-ready**:
The state of a Reference Session whose Operations are all Ready, making it eligible to be shown to
the composer. Derived, never set by hand.
_Avoid_: Published, enabled

**Composition**:
An ordered list of Operations proposed to achieve a Goal, awaiting human judgement. Proposed either
by a model from a Goal, or deterministically from a curated Session's real calls (then it has no
model info). Only an approved Composition may become a test.
_Avoid_: Scenario, plan, draft, flow

**Unmet dependency**:
A Dependency of a composed step that no earlier step, client-generated value, or configured
credential satisfies. Surfaced to the analyst rather than guessed at.
_Avoid_: Missing step, error

**Gap**:
A capability the Goal appears to need that no Operation in the Catalog provides. Recorded rather
than invented.
_Avoid_: Missing endpoint, hole

### Downstream

**TestSpec**:
The declarative description of an executable test, derived from an approved Composition.
_Avoid_: Test case, script

**Environment**:
A named deployment a TestSpec may run against, carrying whether writes are permitted there.
_Avoid_: Target, stage, server
