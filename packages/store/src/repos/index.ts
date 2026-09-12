import type { Db } from "../dbtypes.js";
import { sessionCurationRepo, sessionGraphsRepo } from "./curation.js";
import { dataflowRepo, dependencyFactsRepo, flowsRepo, operationsRepo } from "./derived.js";
import { embeddingsRepo } from "./embeddings.js";
import {
  catalogAnnotationsRepo,
  compositionsRepo,
  exemplarsRepo,
  guidesRepo,
  rehearsalRepo,
  testingAnnotationsRepo,
} from "./knowledge.js";
import { auditRepo, packsRepo, runsRepo, sessionsRepo, specsRepo } from "./misc.js";

export interface Repos {
  sessions: ReturnType<typeof sessionsRepo>;
  operations: ReturnType<typeof operationsRepo>;
  dataflow: ReturnType<typeof dataflowRepo>;
  flows: ReturnType<typeof flowsRepo>;
  dependencyFacts: ReturnType<typeof dependencyFactsRepo>;
  sessionCuration: ReturnType<typeof sessionCurationRepo>;
  sessionGraphs: ReturnType<typeof sessionGraphsRepo>;
  annotations: ReturnType<typeof catalogAnnotationsRepo>;
  testingAnnotations: ReturnType<typeof testingAnnotationsRepo>;
  exemplars: ReturnType<typeof exemplarsRepo>;
  compositions: ReturnType<typeof compositionsRepo>;
  rehearsal: ReturnType<typeof rehearsalRepo>;
  guides: ReturnType<typeof guidesRepo>;
  embeddings: ReturnType<typeof embeddingsRepo>;
  packs: ReturnType<typeof packsRepo>;
  specs: ReturnType<typeof specsRepo>;
  runs: ReturnType<typeof runsRepo>;
  audit: ReturnType<typeof auditRepo>;
}

export function createRepos(db: Db): Repos {
  return {
    sessions: sessionsRepo(db),
    operations: operationsRepo(db),
    dataflow: dataflowRepo(db),
    flows: flowsRepo(db),
    dependencyFacts: dependencyFactsRepo(db),
    sessionCuration: sessionCurationRepo(db),
    sessionGraphs: sessionGraphsRepo(db),
    annotations: catalogAnnotationsRepo(db),
    testingAnnotations: testingAnnotationsRepo(db),
    exemplars: exemplarsRepo(db),
    compositions: compositionsRepo(db),
    rehearsal: rehearsalRepo(db),
    guides: guidesRepo(db),
    embeddings: embeddingsRepo(db),
    packs: packsRepo(db),
    specs: specsRepo(db),
    runs: runsRepo(db),
    audit: auditRepo(db),
  };
}
