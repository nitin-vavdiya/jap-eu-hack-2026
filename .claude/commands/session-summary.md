Generate a session summary for Nitin's Claude Code onboarding learning journal.

Follow these steps exactly:

## Step 1: Gather Context

Run these commands to understand what happened:
- `date` — get current date and time
- `git log --since="midnight" --oneline` — today's commits
- `git diff --stat HEAD~10..HEAD` — recent file changes
- `ls claude_plan/progress_report/sessions/` — check existing session files for today

Also review the current conversation history — what was discussed, what was built, what was explained.

## Step 2: Read the Learning Plan

Read `claude_plan/Nitin_Personalized_Onboarding_Plan.pdf` to confirm milestone and task details.

## Step 3: Identify Plan Coverage

From the conversation and git changes, identify:
- Which milestone(s) were touched (Milestone 1–10)
- Which specific tasks were worked on (Task 1–40), fully or partially
- The nature of the work: study / exercise / real project work / tool exploration

## Step 4: Write the Daily Session File

**File path:** `claude_plan/progress_report/sessions/YYYY-MM-DD.md` (use today's date)

- If the file **does not exist**: create it with the day header below, then add Session 1
- If the file **exists**: count existing `## Session` headings, append the next one (Session 2, Session 3, etc.)

**Day header (only on first session of the day):**
```
# Learning Session Log — YYYY-MM-DD

> Submitted as evidence of Claude Code onboarding progress.
> Plan: 160 hrs · 10 milestones · 40 tasks
> Learner: Nitin Vavdiya, Solution Architect, smartSense Consulting Solutions

---
```

**Session block format:**
```
## Session N — HH:MM

### Milestones & Tasks Covered
| Milestone | Task | Status |
|-----------|------|--------|
| Milestone X — Title | Task Y — Task Title | Completed / Partial |

### What Was Done
[2–4 sentences. Be specific — mention actual files, commands, features built, concepts explored.]

### Evidence
- Files changed: [list from git]
- Commands run: [e.g. /init, npm run dev:backend]
- Outputs produced: [e.g. CLAUDE.md created, session-summary command built]

### My Achievements
[2–3 bullet points of what *you* specifically contributed — architectural decisions made, trade-offs evaluated, domain expertise applied, gaps identified, direction given to Claude Code]

### Key Learnings
[2–3 bullet points of what *you* learned — new Claude Code capabilities discovered, concepts understood, insights about working with AI on architecture tasks]

---
```

## Step 5: Update MASTER_TRACKER.md

**File path:** `claude_plan/progress_report/MASTER_TRACKER.md`

- If the file **does not exist**: create it using the full template in Step 6
- If the file **exists**: read it, update only the tasks that were worked on today

**Update rules:**
- ⬜ Not Started → 🔄 In Progress (if partially done)
- 🔄 In Progress → ✅ Completed (if fully done, add date as a deep link — see below)
- Update `Last Updated` field to today's date
- Increment `Hours Logged` by an estimated amount based on session length
- Update `Overall Progress` count

**Date Done deep-link format:**

When marking a task ✅ Completed, set the Date Done cell to a Markdown link that points directly to the exact session heading where the task was covered:

```
[YYYY-MM-DD](sessions/YYYY-MM-DD.md#anchor)
```

To generate the anchor from a session heading, apply GitHub Markdown anchor rules:
1. Lowercase the heading text
2. Remove any character that is not a letter, number, space, or hyphen (em dash `—`, colon `:`, parentheses, etc. are all removed)
3. Replace spaces with hyphens

Examples:
| Heading | Anchor |
|---------|--------|
| `## Session 1 — 10:13` | `#session-1--1013` |
| `## Session 2 — 15:43` | `#session-2--1543` |
| `## Session 0 — Anthropic Academy Course` | `#session-0--anthropic-academy-course` |
| `## Task 12 Retroactive Completion — 15:57` | `#task-12-retroactive-completion--1557` |
| `## Addendum — Task 1 Completion` | `#addendum--task-1-completion` |

Use the session heading where the task appears in the **Milestones & Tasks Covered** table. If the same task appears in multiple sessions, link to the session where it was marked **Completed** (not Partial).

Also update the **Session History** table — make the Date cell link to the session file (without anchor, since it covers the full day):
```
[YYYY-MM-DD](sessions/YYYY-MM-DD.md)
```

## Step 6: MASTER_TRACKER.md Template

Use this exact structure when creating the file for the first time:

```markdown
# Claude Code Learning Progress — Nitin Vavdiya

**Role:** Solution Architect · smartSense Consulting Solutions  
**Plan:** 160 hours · 10 milestones · 40 tasks  
**Started:** [fill on first run]  
**Last Updated:** [today's date]  
**Hours Logged:** ~0 of 160  
**Overall Progress:** 0/40 tasks complete  

---

## Milestone 1: Orientation & Setup — 10 hrs · 4 tasks
*Goal: Understand how Claude Code differs from Cursor and apply it to architecture work immediately.*

| # | Task | Hours | Status | Date Done |
|---|------|-------|--------|-----------|
| 1 | Watch & Read: Claude Code vs Cursor | 1.5h | ⬜ Not Started | — |
| 2 | Setup: Install and First Session on Real Project | 1.5h | ⬜ Not Started | — |
| 3 | Study: Context Window, Plan Mode, Approval Flow | 3h | ⬜ Not Started | — |
| 4 | Study: Advanced Prompting for Architects | 4h | ⬜ Not Started | — |

---

## Milestone 2: CLAUDE.md — Architectural Context Files — 10 hrs · 4 tasks
*Goal: Claude understands architectural decisions without re-explaining them every session.*

| # | Task | Hours | Status | Date Done |
|---|------|-------|--------|-----------|
| 5 | Study: CLAUDE.md for Architects — Beyond Basic Context | 2h | ⬜ Not Started | — |
| 6 | Exercise: Build CLAUDE.md for Primary Architecture Project | 3h | ⬜ Not Started | — |
| 7 | Exercise: Test and Refine Your CLAUDE.md | 2h | ⬜ Not Started | — |
| 8 | Exercise: Build CLAUDE.md for Secondary Projects and Global Preferences | 3h | ⬜ Not Started | — |

---

## Milestone 3: First Win — Real Architectural Work — 14 hrs · 4 tasks
*Goal: Complete a real architecture task that saves significant time vs doing it manually.*

| # | Task | Hours | Status | Date Done |
|---|------|-------|--------|-----------|
| 9 | Study: The Complete Anthropic Academy Course | 2h | ⬜ Not Started | — |
| 10 | Identify Your First Real Task | 2h | ⬜ Not Started | — |
| 11 | Exercise: Complete Your First Real Architecture Task | 4h | ⬜ Not Started | — |
| 12 | Study: Advanced Workflows and Common Patterns | 6h | ⬜ Not Started | — |

---

## Milestone 4: Microservice Development Acceleration — 18 hrs · 4 tasks
*Goal: Generate, extend, and refactor Spring Boot microservices at meaningful speed.*

| # | Task | Hours | Status | Date Done |
|---|------|-------|--------|-----------|
| 13 | Exercise: Complete Microservice Scaffolding Workflow | 4h | ⬜ Not Started | — |
| 14 | Exercise: Spring Security and Keycloak Integration Workflows | 4h | ⬜ Not Started | — |
| 15 | Exercise: SSI/DID and Blockchain Credentialing Workflows | 5h | ⬜ Not Started | — |
| 16 | Exercise: Multi-Service Refactoring and Cross-Cutting Changes | 5h | ⬜ Not Started | — |

---

## Milestone 5: Architecture Documentation and Decision Records — 14 hrs · 4 tasks
*Goal: Create, maintain, and improve architectural documentation that enables the team.*

| # | Task | Hours | Status | Date Done |
|---|------|-------|--------|-----------|
| 17 | Exercise: Architecture Decision Records (ADR) Generation | 3h | ⬜ Not Started | — |
| 18 | Exercise: System Architecture Documentation Generation | 3h | ⬜ Not Started | — |
| 19 | Exercise: API Contract Documentation and Review | 4h | ⬜ Not Started | — |
| 20 | Exercise: Technical Specification and RFC Generation | 4h | ⬜ Not Started | — |

---

## Milestone 6: DevOps, Cloud, and Infrastructure Workflows — 16 hrs · 4 tasks
*Goal: Generate, review, and maintain Kubernetes, Helm, and cloud infrastructure configurations.*

| # | Task | Hours | Status | Date Done |
|---|------|-------|--------|-----------|
| 21 | Exercise: Kubernetes Manifest and Helm Chart Generation | 4h | ⬜ Not Started | — |
| 22 | Exercise: Argo Workflow and CI/CD Pipeline Generation | 4h | ⬜ Not Started | — |
| 23 | Exercise: Cloud Infrastructure Review and Documentation | 4h | ⬜ Not Started | — |
| 24 | Exercise: Multi-Environment Configuration Management | 4h | ⬜ Not Started | — |

---

## Milestone 7: Team Leadership and Code Review Workflows — 14 hrs · 4 tasks
*Goal: Multiply effectiveness as technical leader — better reviews, specs, and team standards.*

| # | Task | Hours | Status | Date Done |
|---|------|-------|--------|-----------|
| 25 | Exercise: AI-Augmented Code Review | 3h | ⬜ Not Started | — |
| 26 | Exercise: Junior Developer Mentoring Acceleration | 3h | ⬜ Not Started | — |
| 27 | Exercise: Error Recovery and the 3-Strike Rule | 4h | ⬜ Not Started | — |
| 28 | Exercise: Multi-Session Architecture Projects | 4h | ⬜ Not Started | — |

---

## Milestone 8: Advanced Capabilities and Custom Workflows — 16 hrs · 4 tasks
*Goal: Build custom tools and workflows that make Claude Code a permanent daily practice.*

| # | Task | Hours | Status | Date Done |
|---|------|-------|--------|-----------|
| 29 | Exercise: Build Your Custom Slash Command Library | 4h | ⬜ Not Started | — |
| 30 | Exercise: MCP Server Integration | 4h | ⬜ Not Started | — |
| 31 | Exercise: Security and Compliance Review Workflows | 4h | ⬜ Not Started | — |
| 32 | Exercise: Open Source Contribution Acceleration (Tractus-X) | 4h | ⬜ Not Started | — |

---

## Milestone 9: Team Standards and Knowledge Multiplication — 14 hrs · 4 tasks
*Goal: Claude Code learnings become team standards that multiply effectiveness across the team.*

| # | Task | Hours | Status | Date Done |
|---|------|-------|--------|-----------|
| 33 | Study: Team Best Practices, Security, and Anti-Patterns | 3h | ⬜ Not Started | — |
| 34 | Exercise: Build the Team's CLAUDE.md Library | 3h | ⬜ Not Started | — |
| 35 | Exercise: Build the Team's Architecture Prompt Library | 4h | ⬜ Not Started | — |
| 36 | Exercise: Establish AI-First Architecture Practices for Your Team | 4h | ⬜ Not Started | — |

---

## Milestone 10: Capstone — Build Something Real — 14 hrs · 4 tasks
*Goal: Complete a significant architecture project end-to-end and measure the impact.*

| # | Task | Hours | Status | Date Done |
|---|------|-------|--------|-----------|
| 37 | Capstone Prep: Design the Capstone Project | 2h | ⬜ Not Started | — |
| 38 | Capstone: Build the Project | 8h | ⬜ Not Started | — |
| 39 | Capstone: Measure, Document, and Write Before/After Story | 2h | ⬜ Not Started | — |
| 40 | Capstone: Present at Showcase and Lead Knowledge Transfer | 2h | ⬜ Not Started | — |

---

## Session History

| Date | Sessions | Tasks Touched | Hours |
|------|----------|---------------|-------|
| — | — | — | — |
```

## Final Check

After writing both files, confirm to the user:
- Which session file was created or updated (show the path)
- Which tasks were marked updated in MASTER_TRACKER.md
- Current overall progress (X/40 tasks)
