# Mainichi Noutore (毎日のうトレ)

A daily brain-training web app built to help older adults keep their minds active.
Designed for a parent about to turn 60 — simple enough to use every day on a phone,
grounded in published research on dementia risk reduction.

## What it does

- **Daily habit checks** — the lifestyle factors that make up the biggest share of
  dementia risk (aerobic exercise, fish and vegetables, sleep, social contact,
  alcohol, smoking). One tap each.
- **Cognitive benchmarks** — 14 short exercises (~7 minutes total) that measure
  processing speed, working memory, executive function, and verbal fluency.
  Each one can be run individually, with an annotated demo video and spoken
  instructions so first-time users aren't lost.
- **Trend tracking** — per-domain score graphs and weekly reports, so gradual
  change is visible instead of a single number.
- **AI coach** — turns recent records into concrete suggestions for next week,
  generated in-app.
- **Family groups** — a 6-letter code lets family members see each other's
  streaks and scores inside the app.
- **Streaks and badges** — small nudges that keep the habit going.

## The exercises

| Exercise | Domain |
| --- | --- |
| Double Attention | processing speed |
| Quick Math | processing speed |
| N-back | working memory |
| Monkey Test | spatial memory |
| Dual Task | divided attention |
| Stroop | inhibition |
| Verbal Fluency | vocabulary, speech input |
| Visual Search | attention switching |
| Digit Span (backward) | working memory |
| Word Recall | memory retention |
| Trail Making (number–kana) | executive function |
| Digit–Symbol Coding | processing speed |
| Shiritori | vocabulary, retrieval speed |
| Delivery Route | planning, executive function |

## Research it draws on

- Livingston et al., *The Lancet* (2020/2024) — modifiable dementia-risk factors
- The ACTIVE trial — speed-of-processing training effects
- The Synapse Project — learning new skills vs. games alone
- WAIS Digit–Symbol and Trail Making Test conventions for the benchmark tasks

## Tech

Static PWA — plain HTML/CSS/JS, no build step, no accounts.
Works offline through a service worker and keeps all records in localStorage.
Family sharing uses a keyless key-value store; the AI coach calls a free LLM
endpoint with numeric records only (no personal information).

Deployed at https://mainichi-noutore-jqbzcccl.devinapps.com
