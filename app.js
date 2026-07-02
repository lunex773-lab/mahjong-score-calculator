'use strict';

/* ================= 点数計算ロジック ================= */

const FU_LIST = [20, 25, 30, 40, 50, 60, 70, 80, 90, 100, 110];

const ceil100 = (x) => Math.ceil(x / 100) * 100;
const fmt = (n) => n.toLocaleString('ja-JP');

// 翻・符から基本点と満貫以上の呼び名を求める
function baseScore(han, fu, kiriage) {
  if (han >= 13) return { base: 8000, rank: '役満' };
  if (han >= 11) return { base: 6000, rank: '三倍満' };
  if (han >= 8) return { base: 4000, rank: '倍満' };
  if (han >= 6) return { base: 3000, rank: '跳満' };
  if (han >= 5) return { base: 2000, rank: '満貫' };
  const raw = fu * Math.pow(2, 2 + han);
  if (raw > 2000) return { base: 2000, rank: '満貫' };
  // 30符4翻・60符3翻はどちらも基本点1920
  if (kiriage && raw === 1920) return { base: 2000, rank: '満貫' };
  return { base: raw, rank: null };
}

function payments(seat, win, base) {
  if (win === 'ron') {
    return { type: 'ron', pts: ceil100(base * (seat === 'oya' ? 6 : 4)) };
  }
  if (seat === 'oya') {
    return { type: 'tsumo-oya', each: ceil100(base * 2) };
  }
  return { type: 'tsumo-ko', oya: ceil100(base * 2), ko: ceil100(base) };
}

/* ================= 状態 ================= */

const state = {
  seat: 'ko',
  win: 'ron',
  han: 3,
  fu: 30,
  honba: 0,
  kyotaku: 0,
  kiriage: false,
};

const fuState = {
  hand: 'normal',       // normal | chiitoi | pinfu-tsumo
  agari: 'menzen-ron',  // menzen-ron | tsumo | open-ron
  machi: 0,
  head: 0,
  melds: [0, 0, 0, 0],
};

let tableSeat = 'ko';

const $ = (id) => document.getElementById(id);

/* ================= 共通UI部品 ================= */

// セグメント/グリッド共通：クリックで .on を付け替えて値をコールバック
function initSelectGroup(el, onChange) {
  el.addEventListener('click', (e) => {
    const btn = e.target.closest('button');
    if (!btn || !el.contains(btn)) return;
    el.querySelectorAll('button').forEach((b) => b.classList.toggle('on', b === btn));
    onChange(btn.dataset.v);
  });
}

function initStepper(el, min, max, onChange) {
  const out = el.querySelector('.val');
  let value = Number(out.textContent);
  const update = (v) => {
    value = Math.min(max, Math.max(min, v));
    out.textContent = value;
    onChange(value);
  };
  el.querySelector('.minus').addEventListener('click', () => update(value - 1));
  el.querySelector('.plus').addEventListener('click', () => update(value + 1));
}

/* ================= 点数計算タブ ================= */

const HAN_MINI = {
  5: '満貫', 6: '跳満', 7: '跳満',
  8: '倍満', 9: '倍満', 10: '倍満',
  11: '三倍満', 12: '三倍満', 13: '役満',
};

function buildHanGrid() {
  const grid = $('grid-han');
  for (let h = 1; h <= 13; h++) {
    const b = document.createElement('button');
    b.type = 'button';
    b.dataset.v = h;
    b.innerHTML = `${h === 13 ? '13+' : h}${HAN_MINI[h] ? `<span class="mini">${HAN_MINI[h]}</span>` : ''}`;
    if (h === state.han) b.classList.add('on');
    grid.appendChild(b);
  }
  initSelectGroup(grid, (v) => {
    state.han = Number(v);
    renderResult();
  });
}

function buildFuGrid() {
  const grid = $('grid-fu');
  for (const fu of FU_LIST) {
    const b = document.createElement('button');
    b.type = 'button';
    b.dataset.v = fu;
    b.textContent = fu;
    if (fu === state.fu) b.classList.add('on');
    grid.appendChild(b);
  }
  initSelectGroup(grid, (v) => {
    state.fu = Number(v);
    renderResult();
  });
}

function selectFu(fu) {
  state.fu = fu;
  $('grid-fu').querySelectorAll('button').forEach((b) => {
    b.classList.toggle('on', Number(b.dataset.v) === fu);
  });
}

function resultWarnings() {
  const { fu, han, win } = state;
  if (han >= 5) return '';
  if (fu === 20 && win === 'ron') return '20符はロンでは発生しません（平和ツモ専用の符です）';
  if (fu === 20 && han === 1) return '20符1翻はありません（平和＋ツモで最低2翻になります）';
  if (fu === 25 && han === 1) return '25符1翻はありません（七対子は2翻からです）';
  if (fu === 25 && win === 'tsumo' && han === 2) return '七対子＋ツモは最低3翻になります';
  return '';
}

function renderResult() {
  const { seat, win, han, fu, honba, kyotaku, kiriage } = state;
  const { base, rank } = baseScore(han, fu, kiriage);
  const pay = payments(seat, win, base);
  const h100 = honba * 100;
  const kyotakuPts = kyotaku * 1000;

  let total, detail;
  if (pay.type === 'ron') {
    const pts = pay.pts + honba * 300;
    total = pts + kyotakuPts;
    detail = `放銃者から ${fmt(pts)} 点`;
  } else if (pay.type === 'tsumo-oya') {
    const each = pay.each + h100;
    total = each * 3 + kyotakuPts;
    detail = `${fmt(each)} 点オール`;
  } else {
    const oya = pay.oya + h100;
    const ko = pay.ko + h100;
    total = oya + ko * 2 + kyotakuPts;
    detail = `子 ${fmt(ko)} ／ 親 ${fmt(oya)} 点`;
  }
  if (kyotaku > 0) detail += `　＋供託 ${fmt(kyotakuPts)} 点`;

  const seatLabel = seat === 'oya' ? '親' : '子';
  const winLabel = win === 'ron' ? 'ロン' : 'ツモ';
  let rankText;
  if (rank && han >= 5) {
    rankText = `${rank}（${han >= 13 ? '13翻以上' : `${han}翻`}）`;
  } else if (rank) {
    rankText = `${rank}（${han}翻${fu}符）`;
  } else {
    rankText = `${han}翻${fu}符`;
  }

  $('result-sub').textContent = `${seatLabel}・${winLabel}｜${rankText}`;
  $('result-total').textContent = `${fmt(total)} 点`;
  $('result-detail').textContent = detail;

  const warn = resultWarnings();
  $('result-warn').textContent = warn;
  $('result-warn').hidden = !warn;

  $('field-fu').classList.toggle('disabled', han >= 5);
}

/* ================= 符の計算タブ ================= */

const MELD_OPTIONS = [
  ['順子（123 など）', 0],
  ['明刻・中張牌（2〜8）', 2],
  ['明刻・幺九牌（1・9・字）', 4],
  ['暗刻・中張牌（2〜8）', 4],
  ['暗刻・幺九牌（1・9・字）', 8],
  ['明槓・中張牌（2〜8）', 8],
  ['明槓・幺九牌（1・9・字）', 16],
  ['暗槓・中張牌（2〜8）', 16],
  ['暗槓・幺九牌（1・9・字）', 32],
];

function buildMelds() {
  const wrap = $('melds');
  for (let i = 0; i < 4; i++) {
    const row = document.createElement('div');
    row.className = 'meld-row';

    const label = document.createElement('span');
    label.className = 'meld-label';
    label.textContent = `${i + 1}つ目`;

    const sel = document.createElement('select');
    MELD_OPTIONS.forEach(([text, fu], idx) => {
      const opt = document.createElement('option');
      opt.value = idx;
      opt.textContent = fu > 0 ? `${text} +${fu}` : `${text} +0`;
      sel.appendChild(opt);
    });
    sel.addEventListener('change', () => {
      fuState.melds[i] = MELD_OPTIONS[Number(sel.value)][1];
      renderFu();
    });

    row.appendChild(label);
    row.appendChild(sel);
    wrap.appendChild(row);
  }
}

function computeFu() {
  if (fuState.hand === 'chiitoi') {
    return { total: 25, raw: 25, note: '七対子は25符固定です' };
  }
  if (fuState.hand === 'pinfu-tsumo') {
    return { total: 20, raw: 20, note: '平和ツモは20符固定です（ツモ符は付きません）' };
  }
  let raw = 20;
  raw += fuState.agari === 'menzen-ron' ? 10 : fuState.agari === 'tsumo' ? 2 : 0;
  raw += fuState.machi + fuState.head;
  raw += fuState.melds.reduce((a, b) => a + b, 0);

  if (raw === 20 && fuState.agari === 'open-ron') {
    return { total: 30, raw: 20, note: '加符のない鳴きロン（食い平和形）は30符扱いです' };
  }
  const total = Math.ceil(raw / 10) * 10;
  const note = total !== raw ? `内訳 ${raw}符 → 切り上げて ${total}符` : `切り上げなし（${raw}符）`;
  return { total, raw, note };
}

function renderFu() {
  const { total, note } = computeFu();
  $('fu-total').textContent = `${total}符`;
  $('fu-detail').textContent = note;
  $('fu-normal').classList.toggle('disabled', fuState.hand !== 'normal');
}

function applyFuToCalc() {
  const { total } = computeFu();
  // 対応する符ボタン（上限110符）に丸めて反映
  const fu = total > 110 ? 110 : total;
  selectFu(fu);
  renderResult();
  switchTab('calc');
}

/* ================= 早見表タブ ================= */

function tableCell(seat, han, fu) {
  const ronOK = fu !== 20 && !(fu === 25 && han === 1);
  const tsumoOK = !(fu === 20 && han === 1) && !(fu === 25 && han <= 2);
  const { base, rank } = baseScore(han, fu, state.kiriage);

  let ron = '—';
  let tsumo = '—';
  if (ronOK) ron = fmt(ceil100(base * (seat === 'oya' ? 6 : 4)));
  if (tsumoOK) {
    tsumo = seat === 'oya'
      ? `${fmt(ceil100(base * 2))}オール`
      : `${fmt(ceil100(base))}/${fmt(ceil100(base * 2))}`;
  }

  const isMangan = rank !== null && (ronOK || tsumoOK);
  const chip = isMangan ? ' <span class="mangan-chip">満</span>' : '';
  return {
    html: `<div class="c-ron">${ron}${chip}</div><div class="c-tsumo">${tsumo}</div>`,
    isMangan,
  };
}

function buildTable() {
  const hanCols = [1, 2, 3, 4];
  let html = '<thead><tr><th>符＼翻</th>';
  html += hanCols.map((h) => `<th>${h}翻</th>`).join('');
  html += '</tr></thead><tbody>';

  for (const fu of FU_LIST) {
    html += `<tr><th>${fu}符</th>`;
    for (const han of hanCols) {
      const cell = tableCell(tableSeat, han, fu);
      html += `<td${cell.isMangan ? ' class="is-mangan"' : ''}>${cell.html}</td>`;
    }
    html += '</tr>';
  }
  html += '</tbody>';
  $('score-table').innerHTML = html;
}

const LIMITS = [
  ['満貫', '5翻〜', 8000, 12000],
  ['跳満', '6〜7翻', 12000, 18000],
  ['倍満', '8〜10翻', 16000, 24000],
  ['三倍満', '11〜12翻', 24000, 36000],
  ['役満', '13翻〜', 32000, 48000],
];

function buildLimits() {
  $('limits').innerHTML = LIMITS.map(([name, hanRange, ko, oya]) => `
    <div class="limit-row">
      <span class="limit-name">${name}<small style="color:var(--text-dim);font-weight:600">　${hanRange}</small></span>
      <span class="limit-pts">子 ${fmt(ko)} ／ 親 ${fmt(oya)}</span>
    </div>`).join('');
}

/* ================= タブ切り替え ================= */

function switchTab(name) {
  document.querySelectorAll('.panel').forEach((p) => {
    p.classList.toggle('active', p.id === `panel-${name}`);
  });
  document.querySelectorAll('.tabbar button').forEach((b) => {
    b.classList.toggle('on', b.dataset.tab === name);
  });
  if (name === 'table') buildTable();
  window.scrollTo(0, 0);
}

/* ================= 初期化 ================= */

function init() {
  buildHanGrid();
  buildFuGrid();
  buildMelds();
  buildLimits();

  initSelectGroup($('seg-seat'), (v) => { state.seat = v; renderResult(); });
  initSelectGroup($('seg-win'), (v) => { state.win = v; renderResult(); });
  initStepper($('step-honba'), 0, 99, (v) => { state.honba = v; renderResult(); });
  initStepper($('step-kyotaku'), 0, 20, (v) => { state.kyotaku = v; renderResult(); });

  $('chk-kiriage').addEventListener('change', (e) => {
    state.kiriage = e.target.checked;
    renderResult();
  });

  initSelectGroup($('seg-hand'), (v) => { fuState.hand = v; renderFu(); });
  initSelectGroup($('seg-agari'), (v) => { fuState.agari = v; renderFu(); });
  initSelectGroup($('seg-machi'), (v) => { fuState.machi = Number(v); renderFu(); });
  initSelectGroup($('seg-head'), (v) => { fuState.head = Number(v); renderFu(); });
  $('btn-apply-fu').addEventListener('click', applyFuToCalc);

  initSelectGroup($('seg-table-seat'), (v) => { tableSeat = v; buildTable(); });

  document.querySelector('.tabbar').addEventListener('click', (e) => {
    const btn = e.target.closest('button');
    if (btn) switchTab(btn.dataset.tab);
  });

  renderResult();
  renderFu();
  buildTable();
}

init();
