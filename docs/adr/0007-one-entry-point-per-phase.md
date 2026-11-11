# One entry point per phase, so the renderer is testable where the network is not

The logic is split into five units. Each runs on its own as an `action.yml` step:

| Unit | Reads | Writes | Network |
| --- | --- | --- | --- |
| `src/fetch-baseline.js` | token, base branch, artifact name, `GITHUB_WORKFLOW_REF` | the Baseline file, `path` | GitHub API, artifact storage |
| `src/convert-summary.js` | a Coverage Summary | a Breakdown File | none |
| `src/render-gridmap.js` | a Breakdown File | an SVG, coverage outputs | none |
| `scripts/publish-image.sh` | an SVG, a personal token | `url` | GitHub uploads |
| `src/post-comment.js` | two Breakdown Files, image URL | `comment-id` | GitHub API |

The upload needs the network and a personal token ([ADR-0008](./0008-github-user-attachments.md)). If
rendering also uploaded, the renderer could no longer be tested offline. So the renderer takes a file
path and writes a file, and the URL reaches the comment as an environment variable.

The comment builder follows the same rule. It neither renders nor uploads, so the body is a pure function
of Breakdown Files and a URL. That lets the full posting path run end to end against a local
mock GitHub API. The real script, the real `fetch`, and the real request bodies are exercised and
asserted from the other side of a socket.

## Consequences

Units pass data through `$GITHUB_OUTPUT` and environment variables, not by importing state. This needs
more `action.yml` wiring than one script would, and the wiring isn't type-checked. A renamed step ID or
a dropped `shell:` fails only on a real runner. `test/action-yml.test.js` scans for these by
indentation.

The converter is its own unit, so every later phase reads only the Breakdown File
([ADR-0001](./0001-coverage-summary-is-the-only-input.md)). A missing summary makes it warn and write
nothing, and later steps degrade instead of failing the job. The Breakdown File upload doesn't depend on
the test tool's outcome, because today's Breakdown File is tomorrow's Baseline and skipping it breaks the
next run's comparison.

## Untested paths

The converter and renderer have run on real Vitest output. The comment has run only against the mock
API, and the publish path and the baseline fetch haven't run on a real runner yet.

The split works because the baseline fetch and the publish path degrade instead of breaking. That also
means a failure produces no error, so don't trust either path on a green run alone.

The GHES variant ([ADR-0009](./0009-github-enterprise-server.md)) adds a failure that doesn't degrade:
an upload pin the instance can't resolve fails the job.
