# Conversation Summary: EDS Migration Agent Prompt Development

**Date:** 2025-12-20  
**Topic:** Creating system prompt and agent instructions for Make.com EDS content migration automation

---

## Exchange 1

### Jack's Prompt:
> According to make.com we'll need our system prompt to be more concise and univeraally usable, we're trying to have an content ai editing agent but this is too much detail.
>
> Input could be a live webpage or a PDF
>
> Output should always be a new adobe edge delivery services da.live page, first getting then creating.

### Claude's Response Summary:
Asked clarifying questions:
1. Do you have the current verbose prompt to trim, or draft fresh?
2. What's the target da.live path pattern?
3. Content transformation rules - preserve as-is, apply EDS blocks, or clean/simplify?
4. Template page - reference existing or start blank?

Noted goal: ~200-400 word prompt for Make.com that orchestrates MCP tools (get_dalive_content, create_dalive_content, save_dalive_content).

---

## Exchange 2

### Jack's Prompt:
> Current verbose prompt
>
> [Provided existing verbose prompt about da.live content editor with JSON response format, Playwright QA, etc.]
>
> Target example:
> https://da.live/#/jackzhaojin/da-live-postal-2025-07/migration-batch-2025-12-13 I like the concept of migration batch with a date and potentially some notes, maybe ai it's done, or what eversion of the prompt
>
> 1. Content needs to be in the prepiarry da.live format, so if you're analyzing PDF or other webpage as input, agent needs to also understand how EDS build this. This could be from memory, or by reading existing block library of all the blocks could be authored
> 2. Yes, from content block libraries, but those may or may not be provided in prompt.
>
> The MCP servers and their uses. Each agent binds tightly to the tools and it's good for agents to know its tools and MCP
> 1. Playwright or foundational model agent - we need this agent to see and understnad source pages, as well as look at migratin output after preview publish
> 2. DA.live MCP server
>    1. GET content and SAVE content via MCP, it's important to GET get content to understand at least 1 page, before saving. da.live has its own data structure
>    2. Preview publish via MCP - it's important to preview publish so that the migratoin work can be validated by AI and humans. For example, https://da.live/edit#/jackzhaojin/da-live-postal-2025-07/migration-batch-2025-12-13/iot-temperature-controlled-delivery preview publishes to https://main--da-live-postal-2025-07--jackzhaojin.aem.page/migration-batch-2025-12-13/iot-temperature-controlled-delivery
>    3. Memory - we're going to plan on using a page in da.live, instead of a public facing webpage, we'll have best lesson learned, and prioritzed and kept trimmed, however technically we'll be our da.live agents
>    4. Get in all the relevant block component libraries, their da.live content structure, as well as their output, so AI agent knows input and output

### Claude's Response Summary:
Identified architecture:

| Component | Purpose |
|-----------|---------|
| Playwright MCP | View source (webpage/PDF), validate output after publish |
| DA.live MCP | GET reference pages, CREATE/SAVE new pages, Preview Publish |
| Memory | Stored in da.live page (lessons learned, trimmed over time) |
| Block Libraries | Optional context injection for EDS patterns |

Drafted first version of concise system prompt (~200 words) with:
- Tool definitions (Playwright + DA.live MCP)
- Core rules (GET before CREATE, preserve accuracy, max 3 loops)
- Output path pattern: `/source/{owner}/{site}/migration-batch-{YYYY-MM-DD}/{page-slug}`
- Preview URL pattern

Asked follow-up questions about block library format, memory page path, and error handling.

---

## Exchange 3

### Jack's Prompt:
> Ya also with this context, give me what agent instructions should be as well, that should be much more verbose, this will go into the instructions / initial user prompt before user comes back. This should be very verbose and it'll start the agentic loop to produce a page.
>
> Each execution is basically responsible for the following
> 1. read memory page
> 2. read block library pages
> 3. read source
> 4. based on library pages and their structure, create new page, preview publish
> 5. Refinement loop
>    1. Use playwright to validate the page and determine it's good enough. Note that playwright has a ton of MCP, so agent needs to only run this loop a maximum of 3 times
>    2. MCP read if it's not in context, save, preview publish

### Claude's Response Summary:
Created two-part deliverable:

**1. System Prompt (Concise)** - ~200 words for Make.com system prompt field

**2. Agent Instructions (Verbose)** - Detailed kickoff prompt with 4 phases:
- Phase 1: Context Loading (memory → block libraries → source analysis)
- Phase 2: Content Transformation (block mapping, EDS HTML generation, create, preview publish)
- Phase 3: Validation & Refinement Loop (max 3 iterations with Playwright)
- Phase 4: Completion (final report)

Included example da.live HTML structure, transformation rules, validation checklist, and execution variables.

---

## Exchange 4

### Jack's Prompt:
> Answering questions
> 1. let's have the block library be the whole /source/{{owner}}/{{site}}/block-library/index.html. Note that the index.html in da.live gets publishsed to root of the the page, for example https://da.live/edit#/jackzhaojin/da-live-postal-2025-07/block-library/index gets published to https://main--da-live-postal-2025-07--jackzhaojin.aem.page/block-library/ ideally should have a list to all the other block libraries. Maybe this can be a first memory entry
> 2. Memory page can be manualy created, if it's not there the memory segment can be ignored
> 3. Ya confidence score would be good for each run and maybe gaps noted

### Claude's Response Summary:
Updated both prompts with:

1. **Block library** now uses index page at `/source/{{owner}}/{{site}}/block-library/index.html` as entry point, agent follows links to individual blocks
2. **Memory page** is optional - if doesn't exist, skip that step
3. **Confidence score** added with weighted scoring:
   - Content completeness (30%)
   - Block mapping accuracy (25%)
   - Validation pass status (25%)
   - Refinement iterations used (10%)
   - Gaps/uncertainties (10%)
4. **Gaps documentation** section added to final report

---

## Exchange 5

### Jack's Prompt:
> For the longer agent instruction please use a claude document format, the output is breaking and please keep it somewhere you as my chat bot can edit as well.
>
> Also for my agent instructions, please also save important memory back to the memory page

### Claude's Response Summary:
Created two markdown files:

1. **`eds-migration-agent-instructions.md`** - Complete verbose agent instructions with:
   - All 4 phases fully documented
   - Phase 4 now includes **memory update process** with structured format
   - Memory entry format using da.live HTML structure
   - Memory management guidelines (max 50 entries, prioritize recent/high-impact)
   - URL reference table
   - 10 critical reminders

2. **`eds-migration-system-prompt.md`** - Concise Make.com system prompt

Both files saved to `/mnt/user-data/outputs/` and are editable.

---

## Key Artifacts Produced

| File | Purpose | Location |
|------|---------|----------|
| `eds-migration-agent-instructions.md` | Verbose agent kickoff prompt | `/mnt/user-data/outputs/` |
| `eds-migration-system-prompt.md` | Concise Make.com system prompt | `/mnt/user-data/outputs/` |

---

## Architecture Decisions Made

1. **Two MCP servers**: Playwright (view/validate) + DA.live (CRUD + publish)
2. **Block library**: Index page links to individual blocks, agent discovers structure
3. **Memory**: Stored in da.live page, optional, updated after each run with lessons learned
4. **Output path**: `/source/{owner}/{site}/migration-batch-{YYYY-MM-DD}/{page-slug}`
5. **Validation**: Max 3 Playwright loops
6. **Confidence scoring**: 0-100% with gap documentation

---

## Open Items / Next Steps

1. Create sample memory page structure in da.live
2. Create sample block library index page
3. Test the prompt in Make.com with a real migration
4. Potentially add first memory entry about block library index pattern