# Cognify -- Roadmap Source Migration & Code Playground Fix

## Implementation / Engineering Handoff Document

**Project:** Cognify\
**Purpose:** Replace unverified AI-first roadmap generation with a
verified roadmap.sh-first workflow, while keeping AI generation as a
controlled fallback. Also diagnose and fix the Code Playground execution
pipeline backed by a self-hosted Piston instance on a VPS sandbox.

**Status:** Implementation plan / handoff\
**Important:** The exact Cognify filenames, route names,
environment-variable names, database schema, and current Piston request
implementation must be confirmed from the repository before editing. The
workflow below describes the intended behavior and the current behavior
based on the existing product setup.

------------------------------------------------------------------------

# 1. Executive Summary

Cognify currently generates learning roadmaps through Gemini and other
API-based generation. The generated roadmap is therefore model-produced
rather than being based on a maintained, community-reviewed roadmap
source.

The new architecture should make **roadmap.sh the primary source**:

``` text
User requests a roadmap
        ↓
Normalize requested topic / role
        ↓
Check roadmap.sh-supported roadmap catalog
        ↓
┌───────────────────────┐
│ Matching roadmap?     │
└──────────┬────────────┘
           │
       YES │                    NO
           ↓                     ↓
Retrieve roadmap          AI/API generation
from roadmap.sh           using existing keys
           ↓                     ↓
Normalize to Cognify      Validate generated
roadmap schema            response/schema
           └──────────┬──────────┘
                      ↓
             Cognify roadmap UI
```

The AI provider should no longer be the default source when a roadmap.sh
roadmap exists. AI should be treated as a **fallback / extension
mechanism** for unsupported topics.

The second workstream is the Code Playground. It uses **Piston hosted on
a VPS sandbox**, but code execution is currently failing. The fix should
not simply replace Piston. The complete execution chain should be traced
and tested:

``` text
Code Editor
   ↓
Frontend execute action
   ↓
Cognify backend endpoint
   ↓
Piston API on VPS
   ↓
Piston runtime/container
   ↓
Compile / execute
   ↓
Piston response
   ↓
Backend response handling
   ↓
Frontend output / error panel
```

The objective is to identify the exact failure layer and make execution
reliable, observable, and safe.

------------------------------------------------------------------------

# 2. Workstream A -- Roadmap Source Migration

## 2.1 Current Workflow

The current roadmap system is understood to work approximately as
follows:

``` text
User selects / enters a learning goal
        ↓
Cognify backend receives roadmap request
        ↓
Prompt is constructed for Gemini / configured AI provider
        ↓
AI API key is used
        ↓
Model generates roadmap structure
        ↓
Backend parses model response
        ↓
Roadmap is returned to frontend
        ↓
Cognify displays roadmap
```

### Current problems

1.  **Content is model-generated**
    -   The model can produce a roadmap that looks reasonable but is not
        necessarily aligned with a maintained curriculum.
2.  **No authoritative source check**
    -   A roadmap that already exists on roadmap.sh may be regenerated
        independently by the model.
3.  **Potential inconsistency**
    -   Repeated requests can produce different roadmap structures.
4.  **API dependency**
    -   Roadmap generation depends on external AI API availability,
        quotas, keys, latency, and model behavior.
5.  **Validation burden**
    -   The application has to trust and validate generated roadmap
        structure and content.
6.  **Potentially unnecessary API usage**
    -   There is no reason to spend an AI request when an appropriate
        roadmap already exists in the roadmap.sh dataset.

------------------------------------------------------------------------

# 3. Target Roadmap Workflow

The new priority order must be:

### Priority 1 -- roadmap.sh

If the requested topic corresponds to an existing roadmap.sh roadmap,
use the roadmap.sh content.

### Priority 2 -- AI fallback

If no appropriate roadmap exists, use the existing Gemini / AI
generation mechanism.

### Priority 3 -- graceful failure

If both the roadmap source and AI generation fail, return a meaningful
error rather than an empty or malformed roadmap.

Target flow:

``` text
                   ┌──────────────────────┐
                   │ User requests        │
                   │ "Frontend Developer" │
                   └──────────┬───────────┘
                              ↓
                    Normalize user input
                              ↓
                     Resolve roadmap slug
                              ↓
                  Search roadmap.sh catalog
                              ↓
                    ┌─────────┴─────────┐
                    │                   │
                  FOUND              NOT FOUND
                    │                   │
                    ↓                   ↓
             Retrieve source      Existing AI
                roadmap            generation
                    │                   │
                    ↓                   ↓
             Normalize data       Validate JSON
                    │                   │
                    └─────────┬─────────┘
                              ↓
                    Cognify roadmap schema
                              ↓
                         Store/cache
                              ↓
                        Render UI
```

------------------------------------------------------------------------

# 4. roadmap.sh Integration

roadmap.sh is a community-driven developer roadmap platform. Its public
repository contains the underlying roadmap content.

The repository historically used the `developer-roadmap` repository and
stores roadmap topic content under structures such as:

``` text
roadmaps/<roadmap-slug>/content/<topic-slug>@<node-id>.md
```

The repository is publicly available and the roadmap content is
synchronized to the website.

Reference: - https://roadmap.sh/ -
https://github.com/kamranahmedse/developer-roadmap

**Do not hard-code assumptions about repository paths without checking
the current upstream repository. The upstream structure should be
inspected before implementation.**

------------------------------------------------------------------------

# 5. Recommended Integration Strategy

There are two possible ways to consume roadmap.sh data.

## Option A -- Pull from the public GitHub repository

Recommended when Cognify wants predictable, versioned source data.

Flow:

``` text
Cognify backend
      ↓
Roadmap.sh GitHub repository
      ↓
Roadmap files
      ↓
Parser / transformer
      ↓
Cognify roadmap schema
      ↓
Cache / DB
```

Advantages:

-   Version-controlled source.
-   No dependency on undocumented website endpoints.
-   Easy to pin to a commit/tag/branch.
-   Easier to cache.
-   Easier to audit where roadmap content originated.

## Option B -- Use a supported roadmap.sh web/API mechanism

Only use this if the current roadmap.sh project exposes a stable public
interface appropriate for application consumption.

Do **not** scrape HTML pages if structured repository data is available.

------------------------------------------------------------------------

# 6. Roadmap Catalog

Create a normalized catalog in Cognify.

Example:

``` json
[
  {
    "slug": "frontend",
    "name": "Frontend Developer",
    "source": "roadmap.sh"
  },
  {
    "slug": "backend",
    "name": "Backend Developer",
    "source": "roadmap.sh"
  },
  {
    "slug": "devops",
    "name": "DevOps",
    "source": "roadmap.sh"
  }
]
```

The actual catalog must be generated from the current upstream
repository rather than manually guessed.

------------------------------------------------------------------------

# 7. Topic / Slug Resolution

Users may enter:

``` text
Frontend
frontend developer
Front End Developer
web frontend
frontend development
```

These should resolve to a canonical roadmap identifier where possible.

Recommended normalization:

``` text
Input
 ↓
trim whitespace
 ↓
lowercase
 ↓
remove unnecessary punctuation
 ↓
normalize aliases
 ↓
exact slug lookup
 ↓
alias lookup
 ↓
optional fuzzy matching
```

Example alias map:

``` json
{
  "frontend developer": "frontend",
  "front end developer": "frontend",
  "frontend development": "frontend",
  "backend developer": "backend",
  "back end developer": "backend"
}
```

Do not use uncontrolled fuzzy matching that can map an unrelated topic
to the wrong roadmap.

If confidence is low, treat it as **not found** and use the AI fallback.

------------------------------------------------------------------------

# 8. Roadmap Data Transformation

roadmap.sh data does not necessarily have the exact structure expected
by Cognify.

Therefore, create a dedicated adapter:

``` text
roadmap.sh source
       ↓
Roadmap parser
       ↓
Roadmap normalizer
       ↓
Cognify Roadmap DTO
```

Do not spread roadmap.sh-specific parsing logic across controllers or
frontend components.

Recommended conceptual module:

``` text
services/
  roadmap/
    roadmapResolver
    roadmapSource
    roadmapParser
    roadmapNormalizer
    roadmapCache
    aiRoadmapFallback
```

Exact folder names should follow the existing Cognify architecture.

------------------------------------------------------------------------

# 9. Canonical Cognify Roadmap Schema

The existing Cognify roadmap schema should be reused where possible.

If the current schema is insufficient, define a normalized structure
similar to:

``` json
{
  "source": "roadmap.sh",
  "sourceSlug": "frontend",
  "title": "Frontend Developer Roadmap",
  "description": "...",
  "version": "...",
  "topics": [
    {
      "id": "unique-node-id",
      "title": "HTML",
      "description": "...",
      "order": 1,
      "children": []
    }
  ]
}
```

Important:

-   Preserve source attribution.
-   Preserve stable node IDs where available.
-   Preserve ordering.
-   Preserve relationships between topics.
-   Do not discard useful metadata.
-   Keep source-specific fields separate from Cognify's internal fields.

------------------------------------------------------------------------

# 10. Source Attribution

Every roadmap should carry its origin.

Example:

``` json
{
  "source": "roadmap.sh",
  "sourceUrl": "https://roadmap.sh/frontend",
  "sourceSlug": "frontend"
}
```

For AI fallback:

``` json
{
  "source": "ai",
  "sourceProvider": "gemini"
}
```

This is important for debugging and for explaining to users where
roadmap content came from.

------------------------------------------------------------------------

# 11. Caching Strategy

Do not fetch the entire upstream repository on every user request.

Recommended architecture:

``` text
                    ┌───────────────────┐
                    │ Cognify cache/DB  │
                    └─────────┬─────────┘
                              │
                         cache hit?
                        /           \
                      YES            NO
                       ↓              ↓
                  return data    fetch source
                                      ↓
                                  normalize
                                      ↓
                                  cache/store
                                      ↓
                                   return
```

Possible cache levels:

1.  **In-memory cache** -- short-term.
2.  **Redis** -- if already used by Cognify.
3.  **MySQL** -- persistent source snapshots.
4.  **Local JSON/static data** -- acceptable for a small controlled
    deployment.

Use whatever persistence mechanism Cognify already uses instead of
introducing unnecessary infrastructure.

------------------------------------------------------------------------

# 12. Sync Strategy

If roadmap.sh data is copied into Cognify, define how it is updated.

Possible approaches:

### Approach 1 -- Deployment-time sync

Fetch the repository during deployment/build.

### Approach 2 -- Scheduled sync

Periodically pull upstream changes.

### Approach 3 -- Manual sync

Developer updates the snapshot when needed.

Recommended:

``` text
Upstream roadmap.sh
        ↓
Periodic sync
        ↓
Validate
        ↓
Transform
        ↓
Update Cognify source cache
```

Never overwrite a working cached dataset with invalid or partially
downloaded data.

Use an atomic update strategy:

``` text
download → validate → transform → verify → replace active snapshot
```

------------------------------------------------------------------------

# 13. AI Fallback

The existing AI generation system should not be deleted.

It becomes:

``` text
Roadmap.sh lookup
      ↓
No match
      ↓
Existing AI generator
```

The AI generator should remain isolated behind a service interface.

Example conceptual interface:

``` js
getRoadmap(topic)
```

Implementation:

``` text
getRoadmap(topic)
    ↓
resolveRoadmapSh(topic)
    ↓
if found:
    return roadmapShRoadmap
else:
    return generateWithAI(topic)
```

This prevents frontend code from knowing where the roadmap came from.

------------------------------------------------------------------------

# 14. AI Fallback Validation

AI output must be validated before returning it.

Validate:

-   JSON structure.
-   Required fields.
-   Non-empty roadmap.
-   Valid topic/node structure.
-   Maximum depth.
-   Maximum number of nodes.
-   String length limits.
-   No malformed objects.
-   No unexpected executable content.

If validation fails:

``` text
AI response
    ↓
schema validation
    ↓
FAIL
    ↓
return controlled error
```

Do not silently display malformed AI output.

------------------------------------------------------------------------

# 15. API Design

Prefer one stable Cognify endpoint rather than separate frontend
endpoints for roadmap.sh and AI.

Example:

``` http
GET /api/roadmaps/:topic
```

or use the existing roadmap endpoint if one already exists.

Response:

``` json
{
  "success": true,
  "source": "roadmap.sh",
  "roadmap": {
    "slug": "frontend",
    "title": "Frontend Developer Roadmap",
    "topics": []
  }
}
```

AI fallback:

``` json
{
  "success": true,
  "source": "ai",
  "roadmap": {
    "title": "...",
    "topics": []
  }
}
```

This keeps the frontend independent of the source.

------------------------------------------------------------------------

# 16. Error Handling for Roadmaps

Handle separately:

### Source unavailable

``` text
roadmap.sh source unavailable
        ↓
use cached copy if available
        ↓
otherwise AI fallback
```

### Source exists but parsing fails

Do not use corrupted data.

``` text
parse failure
    ↓
log error
    ↓
use previous valid snapshot
    ↓
AI fallback only if appropriate
```

### AI unavailable

Return:

``` json
{
  "success": false,
  "error": "No roadmap source is currently available for this topic."
}
```

Frontend should display a meaningful message.

------------------------------------------------------------------------

# 17. Roadmap Testing Requirements

Test at least:

### Existing roadmap

Input:

``` text
Frontend Developer
```

Expected:

``` text
roadmap.sh roadmap
```

### Alias

Input:

``` text
Front End
```

Expected:

``` text
frontend roadmap
```

### Unsupported topic

Input:

``` text
Quantum Blockchain Architect
```

Expected:

``` text
AI fallback
```

### AI failure

Expected:

``` text
controlled error
```

### Source unavailable

Expected:

``` text
cached roadmap OR AI fallback
```

### Malformed AI output

Expected:

``` text
validation failure
```

------------------------------------------------------------------------

# 18. Workstream B -- Code Playground

## 18.1 Current Architecture

The current Code Playground is understood to use:

``` text
React / frontend code editor
        ↓
Execute button
        ↓
Cognify backend
        ↓
Piston API
        ↓
Piston hosted on VPS
        ↓
Sandbox/container
        ↓
Compiler/interpreter
        ↓
Execution result
        ↓
Cognify backend
        ↓
Frontend output
```

Piston itself exposes runtime discovery and code execution APIs. The
standard v2 API includes:

``` text
GET /api/v2/runtimes
POST /api/v2/execute
```

The self-hosted deployment must have the requested language runtime
installed and available.

Reference: https://github.com/engineer-man/piston

------------------------------------------------------------------------

# 19. Code Playground Problem

Current symptom:

> Code submitted through the Cognify Code Playground is unable to
> execute.

The root cause is not yet known.

Therefore, the implementation must begin with **layer-by-layer
diagnosis**, not with a blind rewrite.

------------------------------------------------------------------------

# 20. Piston Diagnostic Flow

Run the following checks in order.

## Step 1 -- Frontend

Confirm that clicking Execute:

-   actually invokes the expected handler;
-   sends the current editor contents;
-   sends the correct language;
-   sends stdin when applicable;
-   sends the correct API URL;
-   does not fail due to CORS;
-   does not cancel the request;
-   correctly handles non-2xx responses.

Inspect browser DevTools:

``` text
Network → Execute request
```

Record:

-   Request URL
-   HTTP method
-   Request payload
-   Status code
-   Response body
-   Response time

------------------------------------------------------------------------

# 21. Step 2 -- Cognify Backend

Confirm that the backend endpoint receives the request.

Log:

``` text
execution request received
language = ...
version = ...
code length = ...
stdin length = ...
```

Do not log full user source code in production unless required for
debugging.

Check:

-   route registration;
-   request body parsing;
-   authentication;
-   validation;
-   timeout;
-   outbound HTTP request;
-   error handling.

------------------------------------------------------------------------

# 22. Step 3 -- VPS Connectivity

From the Cognify backend environment, test connectivity to the Piston
VPS.

Examples:

``` bash
curl -i http://PISTON_HOST:PORT/api/v2/runtimes
```

or HTTPS if configured:

``` bash
curl -i https://PISTON_HOST/api/v2/runtimes
```

Expected:

``` text
HTTP 200
JSON runtime list
```

If this fails, the problem is before code execution.

Potential causes:

-   wrong host;
-   wrong port;
-   firewall;
-   VPS security group;
-   reverse proxy;
-   DNS;
-   TLS certificate;
-   service not running;
-   Docker networking;
-   backend unable to reach private network.

------------------------------------------------------------------------

# 23. Step 4 -- Check Piston Service

On the VPS:

``` bash
docker ps
```

Check:

-   Piston container exists.
-   Container is running.
-   Port is exposed.
-   Container has not repeatedly restarted.

Then:

``` bash
docker logs <piston-container>
```

Look for:

-   startup errors;
-   runtime installation errors;
-   permission problems;
-   container crashes;
-   request errors;
-   sandbox errors.

------------------------------------------------------------------------

# 24. Step 5 -- Check Runtimes

Query:

``` http
GET /api/v2/runtimes
```

The response should include the language Cognify requests.

Example:

``` json
[
  {
    "language": "python",
    "version": "...",
    "aliases": ["py"]
  }
]
```

Do not assume a runtime exists just because Piston supports the language
in general.

A self-hosted Piston installation only executes languages whose runtimes
have actually been installed.

------------------------------------------------------------------------

# 25. Step 6 -- Check Language Mapping

Cognify may use values such as:

``` text
python
javascript
js
cpp
c++
java
```

Piston may use canonical language names and aliases.

Create a single backend mapping layer:

``` js
{
  js: "javascript",
  javascript: "javascript",
  py: "python",
  python: "python",
  cpp: "c++"
}
```

However, the mapping should be derived from the actual `/runtimes`
response whenever possible.

Do not hard-code versions unnecessarily.

------------------------------------------------------------------------

# 26. Step 7 -- Test Piston Directly

Before debugging Cognify, execute code directly against the VPS Piston
instance.

Example conceptual request:

``` json
{
  "language": "python",
  "version": "3.x",
  "files": [
    {
      "name": "main.py",
      "content": "print('hello')"
    }
  ]
}
```

If this fails directly against Piston:

``` text
Cognify is not the root cause.
Fix Piston/VPS first.
```

If this works:

``` text
Piston is healthy.
Investigate Cognify frontend/backend integration.
```

------------------------------------------------------------------------

# 27. Step 8 -- Inspect Compile and Run Responses

Piston can return different execution stages/results.

The backend must distinguish:

``` text
compile error
runtime error
timeout
output
stderr
signal
system error
```

Do not assume every failed execution is an HTTP error.

An execution request can successfully reach Piston while the program
itself fails.

Frontend should display:

``` text
Program output
```

and separately:

``` text
Compilation error
Runtime error
Execution timeout
System error
```

------------------------------------------------------------------------

# 28. Step 9 -- Timeout Investigation

Check all timeout layers:

``` text
Frontend request timeout
        ↓
Node/Express timeout
        ↓
HTTP client timeout
        ↓
Piston run_timeout
        ↓
Piston sandbox timeout
```

If one layer times out before another, the user may see a generic
failure.

Set intentional limits.

Example conceptual policy:

``` text
request timeout: 10–15s
execution timeout: 3–5s
```

Exact values should be chosen based on the product requirements.

Never allow arbitrary long-running user processes.

------------------------------------------------------------------------

# 29. Step 10 -- VPS Resource Limits

Check:

``` bash
free -h
df -h
docker stats
```

Also inspect:

``` bash
docker info
```

Look for:

-   RAM exhaustion;
-   CPU exhaustion;
-   disk exhaustion;
-   container limits;
-   zombie containers;
-   excessive concurrent executions.

A VPS can appear healthy while Piston cannot create new execution
sandboxes because the host is out of memory, disk, PIDs, or other
resources.

------------------------------------------------------------------------

# 30. Step 11 -- Docker / Sandbox Configuration

Piston relies on isolated execution infrastructure.

Verify:

-   Docker is installed.
-   Docker daemon is running.
-   Piston has required privileges.
-   Required kernel/cgroup configuration is present.
-   Execution containers can be created.
-   Execution containers can be destroyed.
-   No stale containers accumulate.

Piston's documented self-hosting setup requires Docker, and its standard
setup uses containerized execution.

Do not weaken sandbox isolation merely to make execution work.

------------------------------------------------------------------------

# 31. Step 12 -- Reverse Proxy / HTTPS

If Piston is behind Nginx, Apache, Caddy, Cloudflare, or another proxy,
verify:

``` text
Internet
   ↓
Reverse proxy
   ↓
Piston port
```

Check:

-   correct upstream port;
-   request body size;
-   request timeout;
-   connection timeout;
-   HTTPS certificate;
-   WebSocket support if any interactive execution functionality is
    used;
-   CORS only where necessary.

A reverse proxy can make `/runtimes` work while blocking or timing out
`/execute`, so test both independently.

------------------------------------------------------------------------

# 32. Recommended Piston Health Endpoint

Add a backend health check.

Conceptually:

``` http
GET /api/health/piston
```

Response:

``` json
{
  "healthy": true,
  "piston": {
    "reachable": true,
    "runtimeCount": 25
  }
}
```

This should be an internal/admin diagnostic endpoint if exposing runtime
information publicly is undesirable.

------------------------------------------------------------------------

# 33. Piston Service Abstraction

Keep Piston-specific logic in one service.

Conceptual structure:

``` text
services/
  codeExecution/
    pistonClient
    runtimeResolver
    executionValidator
    executionFormatter
```

Controller:

``` text
POST /execute
       ↓
validate request
       ↓
codeExecutionService.execute()
       ↓
Piston client
       ↓
normalize result
       ↓
return response
```

Frontend should never communicate directly with the VPS Piston endpoint
if Cognify's backend is intended to own execution authorization and
policy.

------------------------------------------------------------------------

# 34. Execution Request Validation

Before forwarding to Piston:

Validate:

-   language;
-   source code length;
-   file count;
-   file name;
-   stdin length;
-   execution timeout;
-   supported runtime.

Reject:

-   excessively large payloads;
-   unsupported languages;
-   invalid filenames;
-   invalid versions;
-   suspicious execution parameters.

------------------------------------------------------------------------

# 35. Security Requirements

Code execution is a high-risk feature.

Never:

-   execute user code directly on the Cognify application host;
-   expose Docker socket to untrusted application code;
-   remove sandbox isolation to "fix" execution;
-   allow unrestricted network access from execution containers;
-   allow unlimited CPU/RAM/time;
-   expose internal VPS credentials to the frontend.

Recommended:

``` text
Frontend
   ↓
Cognify API
   ↓
Piston
   ↓
isolated execution sandbox
```

Apply:

-   CPU limits;
-   memory limits;
-   execution timeout;
-   process limits;
-   filesystem isolation;
-   network restrictions where supported;
-   request rate limiting.

------------------------------------------------------------------------

# 36. Observability

Add structured logs around execution.

Example:

``` text
execution.requested
execution.runtime_resolved
execution.piston_request
execution.piston_response
execution.completed
execution.failed
```

Each request should have an execution ID:

``` text
executionId = ...
```

Example:

``` json
{
  "executionId": "exec_123",
  "language": "python",
  "status": "completed",
  "durationMs": 842
}
```

Do not store raw source code in logs by default.

------------------------------------------------------------------------

# 37. Suggested Implementation Order

## Phase 1 -- Understand current code

1.  Locate current roadmap generation endpoint.
2.  Locate Gemini/API service.
3.  Locate roadmap response schema.
4.  Locate roadmap frontend rendering.
5.  Locate Code Playground execute handler.
6.  Locate backend execution route.
7.  Locate Piston client.
8.  Locate Piston VPS configuration.
9.  Locate Docker/VPS deployment files.

------------------------------------------------------------------------

## Phase 2 -- Roadmap source integration

1.  Inspect current roadmap schema.
2.  Inspect current roadmap.sh repository.
3.  Build roadmap catalog.
4.  Implement roadmap resolver.
5.  Implement source parser.
6.  Implement Cognify normalization.
7.  Add cache/storage.
8.  Add source metadata.
9.  Route existing roadmap API through resolver.
10. Preserve AI generator as fallback.
11. Add schema validation.
12. Add tests.

------------------------------------------------------------------------

## Phase 3 -- Code Playground diagnosis

1.  Reproduce failure.
2.  Inspect browser Network tab.
3.  Test Cognify backend endpoint directly.
4.  Test VPS Piston `/runtimes`.
5.  Test VPS Piston `/execute`.
6.  Inspect Piston logs.
7.  Inspect Docker state.
8.  Inspect VPS resources.
9.  Verify runtime installation.
10. Verify proxy/networking.
11. Fix the actual failing layer.
12. Add health checks and structured errors.
13. Add regression tests.

------------------------------------------------------------------------

# 38. Testing Matrix

## Roadmaps

  Test                        Expected
  --------------------------- -----------------------------------
  Existing roadmap.sh topic   roadmap.sh source
  Alias of existing topic     Correct roadmap.sh source
  Unsupported topic           AI fallback
  AI API unavailable          Controlled failure
  roadmap.sh unavailable      Cached source or AI fallback
  Invalid AI response         Validation error
  Duplicate request           Cache hit
  Upstream update             New valid snapshot
  Invalid upstream data       Previous valid snapshot preserved

## Code Playground

  Test                      Expected
  ------------------------- --------------------------------------------
  Python hello world        Output returned
  JavaScript hello world    Output returned
  C/C++ compilation         Successful result
  Runtime error             stderr shown
  Compilation error         compile error shown
  Timeout                   timeout message
  Invalid language          validation error
  Empty code                validation error
  Large code                controlled rejection
  Piston unavailable        clear service error
  VPS restart               service recovers
  Concurrent executions     no unexpected cross-execution interference
  Malicious/infinite loop   sandbox/timeout stops execution

------------------------------------------------------------------------

# 39. Acceptance Criteria

## Roadmap system

The work is complete when:

-   [ ] Cognify checks roadmap.sh before AI generation.
-   [ ] Existing roadmap.sh roadmaps are retrieved correctly.
-   [ ] User aliases resolve correctly.
-   [ ] Roadmap data is transformed into the existing Cognify schema.
-   [ ] Source attribution is available.
-   [ ] Roadmap data is cached appropriately.
-   [ ] AI generation remains available as fallback.
-   [ ] AI fallback is only used when appropriate.
-   [ ] AI responses are schema validated.
-   [ ] Source/API failures have controlled fallback behavior.
-   [ ] Existing roadmap UI continues to work.
-   [ ] Tests cover both roadmap.sh and AI paths.

## Code Playground

The work is complete when:

-   [ ] Execute button sends the correct request.
-   [ ] Backend receives and validates execution requests.
-   [ ] Backend can reach VPS Piston.
-   [ ] Piston `/runtimes` returns valid runtimes.
-   [ ] Required languages are installed.
-   [ ] Direct Piston execution succeeds.
-   [ ] Cognify execution succeeds.
-   [ ] stdout is displayed.
-   [ ] stderr is displayed.
-   [ ] compile errors are displayed.
-   [ ] runtime errors are displayed.
-   [ ] timeout behavior works.
-   [ ] Piston outages produce meaningful errors.
-   [ ] VPS resource limits are safe.
-   [ ] Sandbox isolation is preserved.
-   [ ] Execution logs contain useful diagnostics.
-   [ ] Regression tests are added.

------------------------------------------------------------------------

# 40. Files / Areas Claude Should Locate Before Editing

Claude should first inspect the repository and identify:

``` text
Frontend
├── roadmap page/component
├── roadmap API client
├── code editor/playground
├── execute button/handler
└── output/error renderer

Backend
├── roadmap routes
├── roadmap controller
├── AI/Gemini service
├── roadmap schema/model
├── code execution route
├── Piston client/service
├── validation middleware
├── environment configuration
└── error handling

Infrastructure
├── Docker files
├── docker-compose files
├── VPS deployment scripts
├── reverse proxy configuration
└── environment variables
```

Do not create duplicate implementations if an equivalent service already
exists.

------------------------------------------------------------------------

# 41. Important Engineering Constraints

1.  **Do not remove the existing AI generator.**

    -   Convert it to fallback behavior.

2.  **Do not couple the frontend to roadmap.sh.**

    -   Backend should own source resolution.

3.  **Do not scrape roadmap.sh HTML when structured source data is
    available.**

4.  **Do not hard-code every roadmap manually.**

    -   Build the catalog from the upstream source.

5.  **Do not assume every roadmap.sh topic maps one-to-one to a Cognify
    topic.**

    -   Use a resolver/alias layer.

6.  **Do not expose AI API keys to the frontend.**

7.  **Do not expose the Piston VPS directly to untrusted browser
    requests unless there is a deliberate security design for it.**

8.  **Do not bypass the Piston sandbox to fix execution.**

9.  **Do not silently swallow Piston errors.**

10. **Do not replace working architecture unnecessarily.**

    -   First identify the actual failure.

------------------------------------------------------------------------

# 42. Suggested Final Architecture

``` text
                         COGNIFY
                           │
             ┌─────────────┴─────────────┐
             │                           │
        ROADMAP SYSTEM              CODE PLAYGROUND
             │                           │
             ↓                           ↓
      Roadmap Resolver             Execution API
             │                           │
       ┌─────┴─────┐                     ↓
       │           │                Piston Client
       ↓           ↓                     │
 roadmap.sh       AI                     ↓
       │         Gemini              VPS Piston
       │           │                     │
       └─────┬─────┘                     ↓
             ↓                    Isolated Runtime
       Normalizer                       │
             ↓                          ↓
       Cache / DB                 Execution Result
             │                          │
             └──────────┬───────────────┘
                        ↓
                   Cognify UI
```

------------------------------------------------------------------------

# 43. Claude Implementation Instructions

When giving this document to Claude Code, the implementation should
follow this order:

### Step 1 -- Repository audit

Before modifying anything:

-   inspect the complete repository structure;
-   identify frontend/backend boundaries;
-   locate current roadmap generation;
-   locate Gemini/API integrations;
-   locate the Code Playground;
-   locate Piston integration;
-   locate deployment/VPS configuration;
-   identify environment variables;
-   identify current tests.

Produce a short internal map of the relevant files.

### Step 2 -- Roadmap implementation

Implement:

``` text
resolve roadmap
      ↓
roadmap.sh lookup
      ↓
if available → normalize + return
      ↓
else → existing AI generator
      ↓
validate
      ↓
return
```

Reuse existing schemas and APIs wherever possible.

### Step 3 -- Code Playground diagnosis

Do not immediately rewrite the Piston integration.

Reproduce the failure and trace:

``` text
browser
→ Cognify API
→ Piston request
→ VPS
→ Piston
→ runtime
→ execution
→ response
→ browser
```

Identify the first failing layer.

Fix that layer.

### Step 4 -- Testing

Run:

-   existing tests;
-   roadmap source tests;
-   AI fallback tests;
-   Piston connectivity test;
-   runtime test;
-   execution tests;
-   error/timeout tests.

### Step 5 -- Final report

After implementation, report:

``` text
Files changed:
- ...

Roadmap changes:
- ...

Piston changes:
- ...

Root cause of Code Playground issue:
- ...

Fix:
- ...

Tests:
- ...

Remaining limitations:
- ...
```

------------------------------------------------------------------------

# 44. Definition of Done

The implementation should be considered complete only when Cognify
behaves like this:

``` text
USER:
"Give me a Frontend Developer roadmap"

        ↓

Cognify checks roadmap.sh

        ↓

FOUND

        ↓

Use roadmap.sh roadmap

        ↓

Display in Cognify
```

And:

``` text
USER:
"Give me a roadmap for an unsupported niche topic"

        ↓

Cognify checks roadmap.sh

        ↓

NOT FOUND

        ↓

Use existing Gemini/API generator

        ↓

Validate generated roadmap

        ↓

Display in Cognify
```

And Code Playground:

``` text
USER WRITES CODE
        ↓
CLICK EXECUTE
        ↓
COGNIFY API
        ↓
PISTON VPS
        ↓
ISOLATED EXECUTION
        ↓
OUTPUT / ERROR
        ↓
COGNIFY UI
```

with the entire path working reliably and with clear diagnostics when
any dependency is unavailable.

------------------------------------------------------------------------

# 45. References

-   roadmap.sh: https://roadmap.sh/
-   roadmap.sh source repository:
    https://github.com/kamranahmedse/developer-roadmap
-   Piston repository: https://github.com/engineer-man/piston

These references should be checked against the current upstream state
during implementation rather than treated as immutable API contracts.
