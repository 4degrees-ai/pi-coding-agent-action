# Plan: fallow-cleanup

Goal: make `bun run fallow` exit 0 (dupes ✓ and complexity ✓).
Strategy: incremental, one PR-sized step at a time, interleavable with other work.

## Current state (as of 2026-06-05)

- ✅ Dead code: clean (no issues)
- ⚠ Duplication: **974 LOC / 3.9%** across 25 files (44 clone groups)
  - Down from 3,333 LOC / 13.3% (110 groups) at baseline — **−71% LOC, −60% groups**
  - Down from 1,077 LOC / 4.4% (49 groups) pre-Step 1.7 — **−103 LOC, −5 groups**
  - **Both targets met**: ≤1,100 LOC ✅, ≤45 groups ✅
  - Remaining 44 groups are all spec-internal clones (no cross-package clones left)
- ❌ Complexity: **63 functions above threshold** (was 59; +4 from Step 2.5 new
  helpers all at exactly CRAP=30 — coverage-estimation artifact, see Step 2.5
  notes); MI 92.2 (good); **0 refactoring targets remaining** (was 1)
  - Top CRITICAL functions: `execute` get-pr-diff (462), `createFinalComment` (462),
    `getWorkflowRunLogs` (420→56, downgraded to HIGH), `validateCreateReviewParams` (306),
    `formatThreadAsText` (272), `execute` orchestrator (240),
    `validateBranchName` (240), `fetchPRReviewComments` (240),
    `getCIStatus` (210), `ready` (156), `gatherActionsConfig` (156 — was 600
    before Step 2.2), `<arrow>` in `pull-request-update.ts` (132),
    `updatePullRequest` (132), `transformComment` (110), `createPullRequest` (110)
- Test suite: **1014 pass / 2 skip / 0 fail** (1016 total; e2e skipped without env vars)
  - +98 tests since baseline (mostly Phase 2 unit tests for extracted helpers)
- Branch: **`develop`** — all Phase 1 (1.1–1.6) and Step 2.1 merged. Plan file
  is the only untracked change.
- Refactoring target delta: `pull-request-update.ts` dropped off the list
  after Step 2.1 (CRAP 1122 → 132)

## Phase 1 — Test helpers (kills ~80% of duplication) ✅

- [x] **Step 1.1** — `packages/pi-orchestrator/tests/helpers/tool-mocks.ts`
  - Exported `mockExtensionContext` and `createMockProvider(overrides?, options?)`
  - Replaced ~70-line boilerplate in 9 specs (`create-pr`, `create-review`,
    `get-ci-status`, `get-pr-diff`, `get-thread`, `get-workflow-run-logs`,
    `update-pr`, `tools.spec`, `execution-utils`)
  - Result: 3,333 LOC / 110 groups → 2,598 LOC / 102 groups (13.3% → 10.6%)

- [x] **Step 1.2** — `packages/pi-orchestrator/tests/orchestrator/helpers.ts`
  - Exported 5 helpers: `setAgentRunResult`, `setAgentRunError`,
    `setAddReactionReturn`, `getFinalCommentCall`, `expectFactoryCalledWith`
  - Refactored ~30 call sites in `orchestrator.spec.ts`
  - Orchestrator internal clones: 18 groups / 202 lines → 5 groups / 44 lines
  - Result: 2,598 LOC / 102 groups → 2,323 LOC / 89 groups (10.6% → 9.6%)

- [x] **Step 1.3** — `packages/pi-orchestrator/tests/pi/helpers/agent-session.ts`
  - Exported `buildMockSession`, `injectMockSession`, `userHelloMessage`
  - Inlined `createCoreWithInfoCapture`/`createCoreWithErrorCapture` and
    `defaultAgentConfig` in `agent-logic.spec.ts` (9 sites refactored)
  - Extracted `installMockResolveExtensionSources` in `resource-loader.spec.ts`
  - Result: 2,323 LOC / 89 groups → 2,144 LOC / 83 groups (9.6% → 8.9%)

- [x] **Step 1.4** — `packages/pi-platform-github/tests/helpers/github-test-env.ts`
  - Exported `setupGitHubTestEnv()`, `createTestDeps()`, `coreMock`,
    `lazyLoadModule()`, `defaultMockContext`, `setupGitHubContextMock()`
  - Refactored 10 spec files: `get-ci-status`, `get-workflow-run-logs`
    (35-line clone killed), `comments` (+ inline `runFinalComment`/
    `runFinalCommentBody` helpers), `context`, `provider`,
    `pull-request-logic`, `pull-request-update-integration`,
    `pull-request-update-logic`, `git/commit-creator`, `git/tree-builder`
  - Result: 2,144 LOC / 83 groups → 1,655 LOC / 68 groups (8.9% → 6.8%)

- [x] **Step 1.5** — `tests/e2e/helpers/e2e-setup.ts` (cross-package)
  - Exported `setupE2E()`, `createE2EPlatformProvider()` (delegates to
    shared `createMockProvider`), `createE2ECoreAdapter()`,
    `validateE2EEnvVars()`, `isE2EEnabled()`, `registerE2ESkip()`
  - Refactored: `tests/e2e/pi-agent.spec.ts` (399→221 LOC),
    `tests/e2e/pi-agent-custom-provider.spec.ts` (263→122 LOC),
    `resource-loader.spec.ts` (uses `createMockProvider`),
    `agent-logic.spec.ts` (uses `createMockProvider`),
    `git/commit-creator.spec.ts`, `git/tree-builder.spec.ts`
  - Result: 1,655 LOC / 68 groups → 1,270 LOC / 60 groups (6.8% → 5.3%)

### Phase 1.6 — Spec-internal clones (quick wins, ~135 LOC) ✅ MERGED

Fallow explicitly recommended two cross-file extractions. These landed
before Phase 2 (mechanical, no production code touched).

- [x] **Step 1.6a** — `packages/pi-orchestrator/tests/pi/tools/get-pr-diff-execution.helpers.ts`
  - Exported: `buildTool`, `runTool`, `expectByteTruncated`,
    `expectDefaultSuccessDetails`, `SAMPLE_DIFF`, `BIG_DIFF`, `BIG_DIFF_CONFIG`,
    `mockCtx`, plus `GetPRDiffMock` type
  - Killed **5 original clone groups (53 lines) + 2 secondary clones**
    surfaced after the first pass (constants extraction + assertion helper)
  - `get-pr-diff-execution.spec.ts` is now **0 clones** per fallow
- [x] **Step 1.6b** — inline helpers in `packages/pi-platform-github/tests/git.spec.ts`
  - Added `scanRef()`, `expectSingleChanged()` in `scanForChanges` describe;
    `scanDir()`, `expectSingleChangedPath()` in `scanDirectory` describe
  - Killed **7 internal clone groups (82 lines)** — the cross-file clones
    with `file-scanner.spec.ts` and `tools.spec.ts` remain (cross-package,
    handled by Step 1.7)
- [x] **Step 1.6c** — Re-ran `bun run fallow:dupes`
  - Result: **1,077 LOC / 4.4% / 49 groups** (was 1,270 / 5.1% / 60)
  - **−193 LOC, −11 groups, −0.7pp**
  - LOC target met (≤1,100 ✅). Group target missed by 4 (target ≤45, got 49)
    because the remaining 4 groups are all cross-package clones that need
    a different approach — addressed by Step 1.7

### Phase 1.7 — Cross-package clone cleanup ✅

Killed the 5 cross-package clones flagged by fallow (4 between
`file-scanner.spec.ts` ↔ `git.spec.ts`, 1 between `git.spec.ts` ↔
`tools.spec.ts`). Result: **−103 LOC, −5 groups → 974 LOC / 44 groups**
(crosses the ≤45-group target).

- [x] **Step 1.7a** — `packages/pi-orchestrator/tests/fixtures/scanner-fixtures.ts` (new)
  - Exported: `writeFiles`, `referenceMap`, `setupModifiedFileFixture`,
    `setupIgnorePatternsFixture`, `setupComparisonFixture`, `expectChangedPaths`.
  - Placed under `pi-orchestrator/tests/fixtures/` (not repo-root
    `tests/fixtures/`) to match the existing precedent set by
    `pi-orchestrator/tests/fixtures/extensions/` and the cross-package
    import pattern already used by `github-test-env.ts`.
  - Killed `dup:16a907bc` (10 LOC), `dup:7ea7d634` (17 LOC),
    `dup:38193936` (11 LOC), `dup:a854bd1c` (9 LOC) — 47 LOC across
    4 clone groups in `file-scanner.spec.ts` and `git.spec.ts`.
- [x] **Step 1.7b** — `packages/pi-orchestrator/tests/helpers/github-env.ts` (new)
  - Exported: `installGithubEnv({ inputTrigger?, envPathPrefix? })` —
    the 5-line env-var setup (`INPUT_TRIGGER`, `INPUT_GITHUB_TOKEN`,
    `GITHUB_REPOSITORY`, `GITHUB_EVENT_PATH` + empty JSON file).
  - `pi-platform-github/tests/helpers/github-test-env.ts`'s `installGitHubEnv`
    now delegates to this shared helper (passing `inputTrigger: false` to
    preserve its legacy behavior for existing callers).
  - `git.spec.ts` and `tools.spec.ts` both call `installGithubEnv()` directly,
    replacing their inline 5-line setup blocks. `tools.spec.ts` also dropped
    now-unused `fs` / `os` / `path` imports.
  - Killed `dup:cb6ead5a` (10 LOC, 1 clone group).
- [x] **Step 1.7c** — Re-ran `bun run fallow:dupes` + `bun run validate`
  - Result: **974 LOC / 3.9% / 44 groups** (was 1,077 / 4.4% / 49)
  - **−103 LOC, −5 groups, −0.5pp**
  - Tests: 950 pass / 2 skip / 0 fail (no regression, same count as before)
  - Validate: green (lint + tsc + prettier all pass)

## Phase 2 — Complexity hotspots (one file per PR)

Ordered by CRAP score (high → low). Each step extracts sub-functions and adds
targeted tests for the new units. Aim: each function ≤15 cyclomatic, ≤30 cognitive.

- [x] **Step 2.1** — `packages/pi-platform-github/src/tools/pull-request-update.ts` ✅ MERGED
  - Target: `updatePullRequest` (cyclomatic 33→11, cognitive 49→14, 196→97 LOC, CRAP 1122→132)
  - Extracted: branch-name validation (`validateUpdatePullRequestParams`, CRAP 56),
    dry-run report builder (`buildDryRunReport`, CRAP 56), tree-building helper,
    ref update; added targeted unit tests
  - Side effect: file dropped off refactoring-targets list (was pri 17.0)
- [x] **Step 2.2** — `packages/pi-action/src/adapters/config.ts` ✅
  - Target: `gatherActionsConfig` (cyclomatic 24→12, cognitive 21→9, 92→56 LOC, CRAP 600→156)
  - Extracted: `parseBooleanInput`, `parsePositiveIntInput`, `parseStringListInput`
    (pure parsing helpers, all exported), `validateRequiredInputs` (validator),
    `MISSING_PROVIDER_MESSAGE` / `MISSING_MODEL_MESSAGE` (error constants)
  - Added 29 unit tests in `packages/pi-action/tests/adapters/config-helpers.spec.ts`
    covering all helpers (booleans, ints, lists, loaded_tools, required-input
    validation, error-message content)
  - Side effect: dropped from #1 CRAP hotspot to tied for #10; cyclomatic +
    cognitive now well under thresholds (12 ≤ 20, 9 ≤ 15). CRAP still above
    30 only because fallow estimates coverage as "none" despite the 62 tests
    now covering the file (29 helper tests + 33 existing integration tests).
    Will resolve in Phase 3 via `--coverage` or suppression.
- [ ] **Step 2.3** — `packages/pi-orchestrator/src/pi/tools/get-pr-diff.ts`
  - Target: `execute` (cyclomatic 21, cognitive 19, 114 LOC, CRAP 462)
- [ ] **Step 2.4** — `packages/pi-platform-github/src/comments.ts`
  - Target: `createFinalComment` (cyclomatic 21, cognitive 22, 60 LOC, CRAP 462)
  - Extract: metadata rendering, body composition, dispatch (issue vs review reply)
- [x] **Step 2.5** — `packages/pi-platform-github/src/tools/get-workflow-run-logs.ts` ✅
  - Target: `getWorkflowRunLogs` (cyclomatic 20→7, cognitive 33→7, 134→65 LOC, CRAP 420→56)
  - Severity downgraded: CRITICAL → HIGH. File dropped off the refactoring-targets
    list entirely (fallow now reports **0 refactoring targets**).
  - Extracted: `mapJobsResponse` (cyc 3), `computeJobBudgets` (cyc 4),
    `truncateLogTail` (cyc 6, cog 5 — UTF-8 boundary + newline snap),
    `downloadJobLog` (cyc 5), `renderJobLogsOutput` (cyc 5). Plus 3 exported
    constants (`DEFAULT_MAX_LOG_BYTES`, `MAX_LOG_BYTES`, `TRUNCATION_PREFIX`)
    and a `RawJob` interface for testability.
  - Added 35 unit tests in
    `packages/pi-platform-github/tests/get-workflow-run-logs-helpers.spec.ts`
    covering all 5 helpers + edge cases (UTF-8 boundaries, byte-budget math,
    non-Error throwables, JSON stringification of object responses,
    null/undefined job fields).
  - **Caveat**: total functions above threshold went 59 → 63 because the 4
    new helpers all sit at exactly CRAP=30 (the threshold). Cyclomatic and
    cognitive are all well under thresholds (max 6 / 6 vs 20 / 15). The
    CRAP score is a static-estimation artifact ("0% untested") despite the
    35 direct unit tests now covering these helpers — it will resolve
    automatically once `fallow health --coverage <coverage.json>` is wired
    up, or via targeted `// fallow-ignore-next-line complexity` suppressions
    in Phase 3.1.
- [ ] **Step 2.6** — `packages/pi-platform-github/src/tools/review.ts`
  - Target: `validateCreateReviewParams` (cyclomatic 17, cognitive 23, 33 LOC, CRAP 306)
- [ ] **Step 2.7** — `packages/pi-orchestrator/src/pi/tools/common.ts`
  - Target: `formatThreadAsText` (cyclomatic 16, cognitive 14, 68 LOC, CRAP 272)
- [ ] **Step 2.8** — `packages/pi-orchestrator/src/orchestrator.ts`
  - Target: `execute` (cyclomatic 15, cognitive 23, 83 LOC, CRAP 240)
  - Coordinate with `finalize` extraction if applicable
- [ ] **Step 2.9** — `packages/pi-platform-github/src/tools/{pull-request,thread,get-ci-status}.ts`
  - Bundle: `validateBranchName` (CRAP 240), `fetchPRReviewComments` (CRAP 240),
    `getCIStatus` (CRAP 210) — similar shape, single PR
- [ ] **Step 2.10a** — `pull-request-update.ts` second pass
  - Knock down `updatePullRequest` (132), `<arrow>` (132),
    `validateUpdatePullRequestParams` (56), `buildDryRunReport` (56)
  - Quick: split the arrow into named `selectCommitStrategy()`;
    collapse the 4 remaining guards in `updatePullRequest` into a
    small validation pipeline
- [ ] **Step 2.10b** — Remaining HIGH-tier functions (CRAP 56–156)
  - Bundle 3–5 per PR; many are smaller `execute` functions in tool files
  - Includes `ready` (156), `transformComment` (110), `createPullRequest` (110),
    6× CRAP 90 (mostly small `execute` functions), 4× CRAP 72, 8× CRAP 56
- [ ] **Step 2.11** — Re-run fallow; confirm ≤5 functions above threshold
  (or document remaining as `// fallow-ignore-next-line complexity` with rationale)

## Phase 3 — Suppressions & final tuning

- [ ] **Step 3.1** Add `// fallow-ignore-next-line complexity` with justification
      where decomposition genuinely hurts readability (e.g. dispatch tables,
      exhaustive switch on discriminated unions)
- [ ] **Step 3.2** Confirm `bun run fallow` exits 0
- [ ] **Step 3.3** Confirm `bun run validate` passes
- [ ] **Step 3.4** Final test sweep: all 916+ tests still pass

## Helper modules created in Phase 1

| Path | Exports |
| --- | --- |
| `packages/pi-orchestrator/tests/helpers/core-mock.ts` | `coreMock`, `registerCoreMock()` (pre-existing) |
| `packages/pi-orchestrator/tests/helpers/tool-mocks.ts` | `mockExtensionContext`, `createMockProvider(overrides?, options?)` |
| `packages/pi-orchestrator/tests/helpers/github-env.ts` | `installGithubEnv({ inputTrigger?, envPathPrefix? })` |
| `packages/pi-orchestrator/tests/pi/tools/get-pr-diff-execution.helpers.ts` | `buildTool`, `runTool`, `expectByteTruncated`, `expectDefaultSuccessDetails`, `SAMPLE_DIFF`, `BIG_DIFF`, `BIG_DIFF_CONFIG`, `mockCtx`, `GetPRDiffMock` |
| `packages/pi-orchestrator/tests/orchestrator/helpers.ts` | `setAgentRunResult`, `setAgentRunError`, `setAddReactionReturn`, `getFinalCommentCall`, `expectFactoryCalledWith` |
| `packages/pi-orchestrator/tests/pi/helpers/agent-session.ts` | `buildMockSession`, `injectMockSession`, `userHelloMessage` |
| `packages/pi-orchestrator/tests/fixtures/scanner-fixtures.ts` | `writeFiles`, `referenceMap`, `setupModifiedFileFixture`, `setupIgnorePatternsFixture`, `setupComparisonFixture`, `expectChangedPaths`, `ReferenceFile` |
| `packages/pi-platform-github/tests/helpers/github-test-env.ts` | `setupGitHubTestEnv`, `setupGitHubContextMock`, `createTestDeps`, `coreMock`, `defaultMockContext`, `defaultGitHubContext`, `lazyLoadModule`, `installStdoutAnnotationFilter`, `registerGitHubContextMock`, `installGitHubEnv` (delegates to `github-env.ts`) |
| `tests/e2e/helpers/e2e-setup.ts` | `setupE2E`, `createE2EPlatformProvider`, `createE2ECoreAdapter`, `validateE2EEnvVars`, `isE2EEnabled`, `registerE2ESkip`, `E2E_TIMEOUT`, `mockGitHubContext` |

## Guardrails (from AGENTS.md)

- Run `bun run validate` after every step
- Do not edit `CHANGELOG.md`
- Test business logic via real specs, not mocks
- Pre-push lefthook runs dead-code check

## Proposed next steps (recommended order)

Concrete pick-up order, smallest-to-largest blast radius. Each item is one PR.

1. ~~Squash & open PR for Step 2.1~~ ✅ DONE (merged to develop)
2. ~~Open PR for Step 1.6~~ ✅ DONE (merged to develop)
3. ~~Step 1.7~~ ✅ DONE — 5 cross-package clones killed; 974 LOC / 44 groups; both targets met.
4. ~~Step 2.2 — `gatherActionsConfig`~~ ✅ DONE (CRAP 600→156; cyc/cog under thresholds).
5. ~~Step 2.5 — `getWorkflowRunLogs`~~ ✅ DONE (CRAP 420→56; cyc/cog under thresholds; file dropped from refactoring-targets list).
6. **Step 2.3 + 2.4** (bundle, both CRAP 462). Similar shape
   (orchestrator-side execute + comment rendering).
7. **Step 2.6 + 2.7** (bundle, CRAP 306 + 272). Small, contained validators.
8. **Step 2.8** — orchestrator `execute` (CRAP 240). Land last because it
   touches the central flow and benefits from the prior extractions.
9. **Step 2.9** — pull-request/thread/get-ci-status bundle (CRAP 240/240/210).
10. **Step 2.10a + 2.10b** — clean-up bundles.
11. **Phase 3** — suppressions + final `bun run fallow` → 0.

### Stop conditions

- If `bun run fallow` exits 0 before all steps complete → declare victory.
- If a step would degrade readability → suppress with
  `// fallow-ignore-next-line complexity` and a one-line rationale (Phase 3.1).
- Re-baseline numbers in this file after each merge so the next pick-up is
  unambiguous.

### Risks / open questions

- `gatherActionsConfig` (Step 2.2) reads many env vars; any extraction must
  preserve exact error messages and ordering for the action's
  `actions/config.yaml` contract. Snapshot-test the error output before
  refactoring.
- `createFinalComment` (Step 2.4) has subtle per-platform branching
  (issue vs PR vs review reply); existing `comments.spec.ts` covers it but
  add a couple of negative-path tests before extracting sub-functions.
- Orchestrator `execute` (Step 2.8) is the highest-blast-radius change; pair
  with the existing `orchestrator.spec.ts` and consider an A/B commit that
  keeps the old path behind a flag for one release if behavior diverges.
