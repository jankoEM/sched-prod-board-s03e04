# sched-prod incident board — plan

The on-call board for sched-prod. One page, one list: tonight's incidents, newest first, so on-call sees
what just broke and takes it.

## Flows

| flow | who | what happens |
|------|-----|--------------|
| `open-board` | on-call | opens the board; sees tonight's incidents |
| `ack-incident` | on-call | picks an incident on the board, reads the id in the confirm, and acks it — "I've got this one" |
| `watch-board` | on-call | keeps the board open; it stays current without a reload |

## Requirements

- **R1** New incidents appear live at the top of the list, newest first.
- **R2** Each incident row has an **Ack** button. Ack does not send the ack: it opens a confirm that names the
  incident id it was opened for. **Ack <id>** in the confirm sends the ack (`api.ack(id)`) for that id and marks
  the row acked; **Cancel** (or Escape) sends nothing. The confirm stays in a fixed place while rows keep
  arriving (R1 is unchanged: new incidents stay live at the top). Decided by product on 2026-11-17, after the
  step-1 recording showed a click at 00:15 acking INC-4588 when the pointer was aimed at INC-9802.
- **R3** Show a loader until incidents load.
- **R4** The board refreshes itself every 2 seconds while open.
- **R5** Times show in the viewer's local time; day before month for EU locales (dd/mm).
- **R6** The page names its build: `<meta name="build" content="<git sha>">` in the head and the same sha in the footer.

## Hooks (pinned — tests and the replay rely on them)

| `data-testid` | element |
|---------------|---------|
| `board` | the board's main area |
| `loader` | the loader (gone once incidents load) |
| `empty` | what shows when there are no incidents |
| `incident-list` | the list |
| `incident-row` | one incident row, with `data-id="<incident id>"` |
| `ack` | the Ack button in a row |
| `acked` | the acked mark in a row |
| `confirm` | the confirm, naming the incident id (shown only while it asks) |
| `confirm-ack` | the button in the confirm that sends the ack |
| `confirm-cancel` | the button in the confirm that sends nothing |
| `build-sha` | the sha in the footer |

## Done

Every issue in `issues/` delivered, deployed to a public https address, and shown working.
