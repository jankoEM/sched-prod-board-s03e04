import { fetchIncidents, ack } from './api.js';
import { formatLocal } from './time.js';

const REFRESH_MS = 2000; // R4

const board = document.querySelector('[data-testid="board"]');
const list = document.querySelector('[data-testid="incident-list"]');
const loader = document.querySelector('[data-testid="loader"]');
const empty = document.querySelector('[data-testid="empty"]');
const status = document.querySelector('.status');

/** Rows on screen, by incident id. Rows are kept, not re-rendered, so a click never lands on a rebuilt node. */
const rows = new Map();
/** Incidents acked from this board: id -> ackedAt. */
const acked = new Map();

function el(tag, attrs = {}, text) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v);
  if (text !== undefined) node.textContent = text; // text only: incident fields are data, never markup
  return node;
}

function markAcked(row, ackedAt) {
  const button = row.querySelector('[data-testid="ack"]');
  if (button) button.remove();
  if (!row.querySelector('[data-testid="acked"]')) {
    const mark = el('span', { 'data-testid': 'acked', class: 'acked', title: `acked ${ackedAt}` }, 'acked');
    row.querySelector('.act').append(mark);
  }
  row.classList.add('is-acked');
}

async function onAck(id, button) {
  button.disabled = true;
  button.textContent = 'acking…';
  try {
    const reply = await ack(id); // R2: api.ack(id) keeps the receipt and logs it
    acked.set(id, reply.ackedAt);
    const row = rows.get(id);
    if (row) markAcked(row, reply.ackedAt);
  } catch (err) {
    console.error(err);
    button.disabled = false;
    button.textContent = 'Ack';
    status.textContent = `ack failed for ${id}: ${err.message}`;
  }
}

// R2 (product's decision): Ack on a row only asks. The confirm sits in a fixed place, names the incident
// id it was opened for, and only its own button sends the ack. Rows keep arriving under it (R1).
const backdrop = document.querySelector('.confirm-backdrop');
const confirmAck = document.querySelector('[data-testid="confirm-ack"]');
const confirmCancel = document.querySelector('[data-testid="confirm-cancel"]');
/** The incident the open confirm is for: { id, button } or null. */
let pending = null;

function openConfirm(i, button) {
  pending = { id: i.id, button };
  for (const node of backdrop.querySelectorAll('.confirm-id')) node.textContent = i.id;
  backdrop.querySelector('.confirm-what').textContent = `${i.severity} · ${i.service} · ${i.region} · ${i.summary}`;
  backdrop.hidden = false;
  confirmCancel.focus(); // a second Enter or a double click must not send the ack
}

function closeConfirm() {
  const was = pending;
  pending = null;
  backdrop.hidden = true;
  if (was?.button.isConnected) was.button.focus();
  return was;
}

confirmAck.addEventListener('click', () => {
  const was = closeConfirm();
  if (was) onAck(was.id, was.button);
});
confirmCancel.addEventListener('click', closeConfirm);
document.addEventListener('keydown', (e) => {
  if (pending && e.key === 'Escape') closeConfirm();
});

function buildRow(i) {
  const row = el('li', { 'data-testid': 'incident-row', 'data-id': i.id, class: `row ${i.severity}` });
  row.append(
    el('span', { class: 'id' }, i.id),
    el('span', { class: 'sev' }, i.severity),
    el('span', { class: 'what' }, `${i.service} · ${i.region} · ${i.summary}`),
    el('time', { datetime: i.openedAt, title: i.openedAt }, formatLocal(i.openedAt)), // R5
  );
  const act = el('span', { class: 'act' });
  const button = el('button', { type: 'button', 'data-testid': 'ack' }, 'Ack');
  button.addEventListener('click', () => openConfirm(i, button)); // R2: Ack asks first, by incident id
  act.append(button);
  row.append(act);
  if (acked.has(i.id)) markAcked(row, acked.get(i.id));
  return row;
}

/** R1: newest first; new incidents go in at the top, known rows stay where they are in the DOM. */
function render(incidents) {
  const sorted = [...incidents].sort((a, b) => Date.parse(b.openedAt) - Date.parse(a.openedAt));
  const live = new Set(sorted.map((i) => i.id));
  for (const [id, row] of rows) {
    if (!live.has(id)) {
      if (pending?.id === id) {
        closeConfirm();
        status.textContent = `${id} left the board, ack not sent`;
      }
      row.remove();
      rows.delete(id);
    }
  }
  let prev = null;
  for (const i of sorted) {
    let row = rows.get(i.id);
    if (!row) {
      row = buildRow(i);
      rows.set(i.id, row);
      row.classList.add('is-new');
      setTimeout(() => row.classList.remove('is-new'), 4000);
    }
    const want = prev ? prev.nextSibling : list.firstChild;
    if (want !== row) list.insertBefore(row, want);
    prev = row;
  }
  empty.hidden = sorted.length > 0;
  list.hidden = sorted.length === 0;
}

let loaded = false;
async function tick() {
  try {
    const page = await fetchIncidents(); // hands back the whole current list
    render(page.incidents);
    if (!loaded) {
      loaded = true;
      loader.remove(); // R3: gone once incidents are on screen
      board.setAttribute('aria-busy', 'false');
    }
    status.textContent = `updated ${formatLocal(page.updatedAt, { seconds: true })}`;
  } catch (err) {
    console.error(err);
    status.textContent = `refresh failed, retrying: ${err.message}`;
  } finally {
    setTimeout(tick, REFRESH_MS); // R4: next refresh only after this one is done, so polls never pile up
  }
}

tick();
