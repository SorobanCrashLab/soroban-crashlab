# Postmortem: <title>

> Blameless: describe what systems and processes allowed the failure, not who
> to blame. People acted reasonably on the information they had; the question
> is why that information or those guardrails were not enough.

| | |
|---|---|
| Incident issue | #<n> |
| Severity | SEV<1–4> |
| Date (UTC) | YYYY-MM-DD, HH:MM–HH:MM |
| Duration | detection → resolution |
| IC / author | @handle / @handle |
| Status | draft · in review · final |

## Summary

Three sentences: what broke, who was affected, how it was fixed.

## Impact

Users/data affected, data lost (window), SLA impact, downstream effects
(nightly evidence, CI gates).

## Timeline (UTC)

| Time | Event |
|---|---|
| HH:MM | Trigger (deploy, config change, external event) |
| HH:MM | First signal (which alert / auto-issue / report) |
| HH:MM | Acknowledged by … |
| HH:MM | Mitigation started … |
| HH:MM | Resolved |

## Detection

How did we find out? How long after it started? What would have caught it sooner?

## Root cause and contributing factors

The chain of causes ("5 whys" is fine), including the missing guardrails.

## What went well / what went badly / where we got lucky

-

## Action items

Every item has an owner and a date. Prefer items that prevent the class of
failure over items that fix this instance.

| Action | Type (prevent / detect / mitigate / process) | Owner | Due | Issue |
|---|---|---|---|---|
| | | @ | YYYY-MM-DD | #|

## Playbook updates

Which playbook was used, what was wrong or missing, and the PR that fixed it.
