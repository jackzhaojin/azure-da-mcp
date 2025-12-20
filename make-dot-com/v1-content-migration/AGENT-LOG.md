# EDS Content Migration Agent — Development Log

Complete development history of the Make.com EDS content migration agent prompts and instructions.

---

## Initial Opus Conversation (2025-12-20)

**Topic:** Creating system prompt and agent instructions for Make.com EDS content migration automation

### Exchange 1

**Jack's Request:**
> According to make.com we'll need our system prompt to be more concise and universally usable, we're trying to have a content ai editing agent but this is too much detail.
>
> Input could be a live webpage or a PDF
>
> Output should always be a new adobe edge delivery services da.live page, first getting then creating.

**Claude's Response Summary:**
Asked clarifying questions:
1. Do you have the current verbose prompt to trim, or draft fresh?
2. What's the target da.live path pattern?
3. Content transformation rules - preserve as-is, apply EDS blocks, or clean/simplify?
4. Template page - reference existing or start blank?

Noted goal: ~200-400 word prompt for Make.com that orchestrates MCP tools (get_dalive_content, create_dalive_content, save_dalive_content).

---

### Exchange 2

**Jack's Request:**
> Current verbose prompt
>
> [Provided existing verbose prompt about da.live content editor with JSON response format, Playwright QA, etc.]
>
> Target example:
> https://da.live/#/jackzhaojin/da-live-postal-2025-07/migration-batch-2025-12-13 I like the concept of migration batch with a date and potentially some notes, maybe ai it's done, or what version of the prompt
>
> 1. Content needs to be in the proprietary da.live format, so if you're analyzing PDF or other webpage as input, agent needs to also understand how EDS build this. This could be from memory, or by reading existing block library of all the blocks could be authored
> 2. Yes, from content block libraries, but those may or may not be provided in prompt.
>
> The MCP servers and their uses. Each agent binds tightly to the tools and it's good for agents to know its tools and MCP
> 1. Playwright or foundational model agent - we need this agent to see and understand source pages, as well as look at migration output after preview publish
> 2. DA.live MCP server
>    1. GET content and SAVE content via MCP, it's important to GET content to understand at least 1 page, before saving. da.live has its own data structure
>    2. Preview publish via MCP - it's important to preview publish so that the migration work can be validated by AI and humans. For example, https://da.live/edit#/jackzhaojin/da-live-postal-2025-07/migration-batch-2025-12-13/iot-temperature-controlled-delivery preview publishes to https://main--da-live-postal-2025-07--jackzhaojin.aem.page/migration-batch-2025-12-13/iot-temperature-controlled-delivery
>    3. Memory - we're going to plan on using a page in da.live, instead of a public facing webpage, we'll have best lesson learned, and prioritized and kept trimmed, however technically we'll be our da.live agents
>    4. Get in all the relevant block component libraries, their da.live content structure, as well as their output, so AI agent knows input and output

**Claude's Response Summary:**
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

### Exchange 3

**Jack's Request:**
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

**Claude's Response Summary:**
Created two-part deliverable:

**1. System Prompt (Concise)** - ~200 words for Make.com system prompt field

**2. Agent Instructions (Verbose)** - Detailed kickoff prompt with 4 phases:
- Phase 1: Context Loading (memory → block libraries → source analysis)
- Phase 2: Content Transformation (block mapping, EDS HTML generation, create, preview publish)
- Phase 3: Validation & Refinement Loop (max 3 iterations with Playwright)
- Phase 4: Completion (final report)

Included example da.live HTML structure, transformation rules, validation checklist, and execution variables.

---

### Exchange 4

**Jack's Request:**
> Answering questions
> 1. let's have the block library be the whole /source/{{owner}}/{{site}}/block-library/index.html. Note that the index.html in da.live gets published to root of the page, for example https://da.live/edit#/jackzhaojin/da-live-postal-2025-07/block-library/index gets published to https://main--da-live-postal-2025-07--jackzhaojin.aem.page/block-library/ ideally should have a list to all the other block libraries. Maybe this can be a first memory entry
> 2. Memory page can be manually created, if it's not there the memory segment can be ignored
> 3. Ya confidence score would be good for each run and maybe gaps noted

**Claude's Response Summary:**
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

### Exchange 5

**Jack's Request:**
> For the longer agent instruction please use a claude document format, the output is breaking and please keep it somewhere you as my chat bot can edit as well.
>
> Also for my agent instructions, please also save important memory back to the memory page

**Claude's Response Summary:**
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

### Key Artifacts from Opus Session

| File | Purpose |
|------|---------|
| `eds-migration-agent-instructions.md` | Verbose agent kickoff prompt |
| `eds-migration-system-prompt.md` | Concise Make.com system prompt |

### Architecture Decisions Made

1. **Two MCP servers**: Playwright (view/validate) + DA.live (CRUD + publish)
2. **Block library**: Index page links to individual blocks, agent discovers structure
3. **Memory**: Stored in da.live page, optional, updated after each run with lessons learned
4. **Output path**: `/source/{owner}/{site}/migration-batch-{YYYY-MM-DD}/{page-slug}`
5. **Validation**: Max 3 Playwright loops
6. **Confidence scoring**: 0-100% with gap documentation

---

## Claude Code Session (2025-12-20)

**Focus:** Refining prompts, handling Make.com variables, PDF context issues, and creating progressive prompt versions

### Issue 1: Variable Notation Conflicts

**Jack's Request:**
> Can you use a different variable notation for '/Users/jackjin/dev/azure-da-mcp/make-dot-com/v1-content-migration/agent-init-prompt.md'? the {{}} is triggering make.com variables, but yeah note the variable notation top of the file so it's clear to AI reading it, and can't be {{}}

**Solution:**
- Changed all internal variables from `{{variable}}` to `${variable}` notation
- Added clear note at top explaining variable notation
- Preserved Make.com's actual runtime variables with `{{}}` notation

---

### Issue 2: Make.com Variable Integration

**Jack's Request:**
> OK so make.com can set run time variables, have a section in variable loading at the very top, either variables set in this prompt or variables set in make.com
>
> keep all the variables set currently for now in the prompt, in make.com we're setting these two variables: {{5.sourceType}} {{5.sourceLocation}}
>
> The {{}} are real make variables and we should keep them. Working examples we should follow are sourceType can be pdf or webpage. location should be https://dalivemcprg94e3.blob.core.windows.net/contentsource/pdf-2025-12-18/customer-experience-digital-postal.pdf or a URL for a page accessible publicly
>
> Move all the variables up top and try and pull in the two make variables, and rest of the prompting / agent should adjust

**Solution:**
- Created "VARIABLE LOADING" section at top with two subsections:
  - **Make.com Runtime Variables** (using `{{}}` notation)
  - **Internal Template Variables** (using `${}`notation)
- Added `{{5.sourceType}}` and `{{5.sourceLocation}}`
- Updated source analysis section to handle both PDF and webpage based on sourceType

---

### Issue 3: Folder Postfix for Unique Runs

**Jack's Request:**
> OK for your internal variables today's date is 12-20, and maybe support like a postfix so each migration run is unique as a make.com variable. maybe source type, location, and folder-post-fix can be a 3rd variable, in make.com i'll have it set to trial-run-3

**Solution:**
- Added `{{5.folderPostfix}}` as third Make.com variable
- Updated all migration batch paths from:
  - `/source/${owner}/${site}/migration-batch-${date}/`
  - To: `/source/${owner}/${site}/migration-batch-${date}-{{5.folderPostfix}}/`
- Updated date format to `12-20` (MM-DD)
- Added example: `trial-run-3`

---

### Issue 4: PDF Context Loading Problems

**Jack's Request:**
> Looks like da live get content worked fine in make however it's not having a good time fetching the PDF - can you do a bit of research on how do we get make.com to load the PDF into it's agent context so it can then analyze and save the content?

**Research Findings:**
- Make.com AI Agents support uploading PDFs as context files using "Upsert Agent Context (file)" module
- PDFs are converted to vector chunks in Make's RAG database
- Should pre-load PDF before agent runs (not fetch during execution via MCP)
- Timeout issue was due to trying to fetch PDF during agent execution

**Recommended Workflow:**
```
[HTTP: Download PDF] → [Upsert Agent Context (file)] → [Run AI Agent]
```

**Jack's Follow-up:**
> Uploading the pdf data into context is too big for make.com's agent apparently, it errored out

**Alternative Solutions Provided:**
1. Extract text first (CloudConvert/PDF.co) then upload text context
2. Pass PDF URL with longer timeout configuration
3. Pre-process PDF outside agent
4. Test with Playwright MCP directly

---

### Issue 5: Testing Playwright with PDFs

**Jack's Request:**
> Is there a make.com agent that can fetch? maybe update the instructions when fetching pdf use the agent tool and do not use mcp, can you write me 2 simple prompts so i can test it out in make.com, create simple pdf fetch native, and mcp playwright website visit, it should work with a page like https://main--da-live-postal-2025-07--jackzhaojin.aem.page/index-copy, and mcp playwright pdf test, 3 test total.

**Solution:**
Created 3 test prompts:
1. **Native PDF Fetch** - Use Claude's built-in PDF reading (no MCP)
2. **MCP Playwright Webpage** - Test Playwright with webpage
3. **MCP Playwright PDF** - Test if Playwright can handle PDFs

---

### Issue 6: PDF Successfully Loaded to Context

**Jack's Report:**
> ok i was able to get the agent chaining to work, can you update init prompt to basically refer to the PDF from previous step? Maybe try and refer to the file name

**Solution:**
- Updated instructions to tell agent PDF is pre-loaded in context
- Changed from "fetch the PDF" to "access PDF from your context"
- Added: "DO NOT attempt to download or fetch the PDF again"
- Made filename reference generic (extracted from sourceLocation)

---

### Issue 7: Creating Progressive Prompt Versions

**Jack's Request:**
> OK this looks good, rename agent-init-prompt to postpend-full.
>
> Let's make simpler prompts to start, for now, do not do memory for block, just ask ai to read one sample page https://da.live/edit#/jackzhaojin/da-live-postal-2025-07/index-copy and have AI do its best to create the page in migration location.
>
> Let's have a MVP version of this in a separate file

**Jack's Follow-up:**
> Maybe can we generate a combination of all this stuff?
>
> Like ideally we add in memory, then add in block library, than memory, generate a MD file for each one of these

**Solution:**
Created 4 progressive prompt files:

1. **`agent-init-prompt-mvp.md`** ⭐
   - Basic: Source → Sample Page → Transform → Create → Validate → Report
   - 7 simple steps, no complexity
   - Perfect for initial testing

2. **`agent-init-prompt-mvp-memory.md`**
   - MVP + Memory system
   - Reads lessons from past migrations
   - Updates memory with new lessons
   - 9 steps

3. **`agent-init-prompt-mvp-blocklibrary.md`**
   - MVP + Block Library discovery
   - Fetches block library index
   - Maps source to standard blocks
   - 8 steps

4. **`agent-init-prompt-full.md`** 🚀
   - Everything combined (original full version)
   - Memory + Block Library + Refinement loops
   - Confidence scoring + Gap documentation
   - Production-ready

Created **`README.md`** with:
- Comparison table of all versions
- Recommended testing path
- Quick start guide
- Troubleshooting

---

### Issue 8: Creating Comprehensive Documentation

**Jack's Request:**
> After the README.md is created, combine it with '/Users/jackjin/dev/azure-da-mcp/make-dot-com/v1-content-migration/init-opus-conversation.md'. Basically, it all started with that init opus, document all the init opus stuff as H2 as initial conversation, then merge in the additional stuff you did in a single log. README.md should be shorter, and maybe agent log markdown should be longer.
>
> One H2 (##) for init opus, and another H2 (##) for this chat session. Again more important to capture what I put into claude code than what not. DO NOT LOSE ANY CONTENT FROM INIT OPUS

**Solution:**
- Created this comprehensive `AGENT-LOG.md` combining both sessions
- Preserved ALL content from init-opus-conversation.md
- Focused on documenting Jack's requests and key decisions
- Shortened README.md to be a quick reference guide

---

## Final Deliverables

| File | Purpose | Complexity |
|------|---------|-----------|
| `agent-init-prompt-mvp.md` | Basic migration workflow | Low |
| `agent-init-prompt-mvp-memory.md` | MVP + Memory learning | Medium |
| `agent-init-prompt-mvp-blocklibrary.md` | MVP + Block library | Medium |
| `agent-init-prompt-full.md` | Full production version | High |
| `README.md` | Quick reference guide | - |
| `AGENT-LOG.md` | Complete development history | - |

---

## Key Technical Decisions

### Variable Notation System
- **Make.com Runtime Variables**: `{{5.variableName}}` - Injected by Make.com workflow
- **Internal Template Variables**: `${variableName}` - Defined within prompt

### PDF Handling Strategy
- **Pre-load PDFs to context** using "Upsert Agent Context (file)" before agent runs
- **Agent accesses from context** - no fetching during execution
- **Avoids timeouts** and file size limits

### Progressive Testing Path
```
MVP → MVP + Memory → MVP + Block Library → Full
```

### Migration Path Pattern
```
/source/${owner}/${site}/migration-batch-${date}-{{5.folderPostfix}}/${page_slug}.html
```

### Preview URL Pattern
```
https://main--${site}--${owner}.aem.page/migration-batch-${date}-{{5.folderPostfix}}/${page_slug}
```

---

## Open Items / Future Enhancements

1. Test all 4 prompt versions with real migrations
2. Validate memory page accumulation and trimming
3. Test block library discovery with actual library
4. Measure confidence score accuracy
5. Refine gap documentation format based on real usage
6. Consider adding retry logic for failed migrations
7. Explore batch processing for multiple pages

---

**Last Updated:** 2025-12-20
**Development Team:** Jack Jin + Claude (Opus & Claude Code)
