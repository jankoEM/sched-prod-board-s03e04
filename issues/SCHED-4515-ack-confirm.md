---
id: SCHED-4515
title: Ack asks to confirm, naming the incident id
status: ready
plan: R2
---

Follow-up to SCHED-4511. Rows arrive at the top every few seconds (R1, R4), so the Ack button under the
pointer can belong to another incident by the time the click lands. Recorded on build 841119b: pointer on
INC-9802, click at 00:15 acked INC-4588.

Product's decision (2026-11-17): new incidents stay live at the top and Ack stays on the row, but Ack asks to
confirm, and the confirm names the incident id.

- Ack on a row opens the confirm (`data-testid="confirm"`) with that row's incident id. No ack is sent.
- `data-testid="confirm-ack"` sends `api.ack(id)` for the id the confirm names and marks that row acked.
- `data-testid="confirm-cancel"` and Escape close it and send nothing.
- The confirm does not move when rows arrive.

Acceptance: a click that lands on the wrong row sends no ack; the confirm shows the wrong id, on-call cancels,
picks the right row and confirms; the ack is for the id the confirm named.
