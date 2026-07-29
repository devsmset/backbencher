import type { Db } from "../dbtypes.js";
import { dataflowRepo, dependencyFactsRepo, flowsRepo, operationsRepo } from "./derived.js";
import { annotationsRepo, guidesRepo, scenariosRepo } from "./knowledge.js";
import { auditRepo, packsRepo, runsRepo, sessionsRepo, specsRepo } from "./misc.js";

export interface Repos {
  sessions: ReturnType<typeof sessionsRepo>;
  operations: ReturnType<typeof operationsRepo>;
  dataflow: ReturnType<typeof dataflowRepo>;
  flows: ReturnType<typeof flowsRepo>;
  dependencyFacts: ReturnType<typeof dependencyFactsRepo>;
  annotations: ReturnType<typeof annotationsRepo>;
  scenarios: ReturnType<typeof scenariosRepo>;
  guides: ReturnType<typeof guidesRepo>;
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
    annotations: annotationsRepo(db),
    scenarios: scenariosRepo(db),
    guides: guidesRepo(db),
    packs: packsRepo(db),
    specs: specsRepo(db),
    runs: runsRepo(db),
    audit: auditRepo(db),
  };
}
