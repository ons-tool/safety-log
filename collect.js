// 서명 수합 (서버 없음): 서명 링크 QR 공유 → 참석자·결재자 휴대폰에서 서명 QR 생성
// → 이 기기 카메라로 스캔해 참석자 명단 / 결재란에 반영 (데이터는 이 브라우저에만 저장)
const esc = t => String(t ?? '').replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const store = {
  get(k, d) { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch (e) { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} },
  del(k) { try { localStorage.removeItem(k); } catch (e) {} },
};
store.del('members'); // 예전 팀원 목록 기능에서 저장한 명단은 더 이상 쓰지 않으므로 삭제

// ── 서명 링크 (링크에는 세션 코드만 들어감, 개인정보 없음) ──
const newCode = () => Math.random().toString(36).slice(2, 8).padEnd(6, '0');
let sessionId = store.get(K('signSession'), null);
if (!sessionId) { sessionId = newCode(); store.set(K('signSession'), sessionId); }
let shareRole = ''; // '' = 참석자, '담당' / '팀장' = 결재

function closePop(id) { document.getElementById(id).hidden = true; }

function newSession(ask) {
  if (ask && !confirm('새 링크를 발급하면 이전 링크로 만든 서명 QR은 스캔할 때 반영 여부를 묻습니다.\n(명단과 이미 받은 서명은 그대로 유지됩니다) 계속할까요?')) return;
  sessionId = newCode();
  store.set(K('signSession'), sessionId);
  openShare(shareRole);
}
function signUrl(role) {
  return new URL(`sign.html?s=${sessionId}` + (FORM.signParam ? `&f=${FORM.signParam}` : '')
    + (role ? `&r=${encodeURIComponent(role)}` : ''), location.href).href;
}
function openShare(role) {
  shareRole = role === '담당' || role === '팀장' ? role : '';
  const url = signUrl(shareRole);
  document.getElementById('shareTitle').textContent = shareRole
    ? `📱 결재(${shareRole}) 서명 · 결재자가 휴대폰으로 QR을 찍어 서명`
    : '🔗 휴대폰으로 QR을 찍어 서명 (참석자)';
  document.getElementById('shareUrl').textContent = url;
  const q = document.getElementById('qr'); q.innerHTML = '';
  drawQR(q, url, Math.min(280, innerWidth - 80));
  document.getElementById('shareModal').hidden = false;
}
async function copyLink() {
  try { await navigator.clipboard.writeText(document.getElementById('shareUrl').textContent); alert('복사되었습니다.'); }
  catch (e) { prompt('아래 링크를 복사하세요', document.getElementById('shareUrl').textContent); }
}
async function shareLink() {
  const url = document.getElementById('shareUrl').textContent;
  if (navigator.share) { try { await navigator.share({ title: shareRole ? `${FORM.name} 결재 서명 (${shareRole})` : `${FORM.name} 참석 서명`, url }); } catch (e) {} }
  else copyLink();
}

// ── 서명 QR 스캔 ──
let camStream = null, scanTimer = null, lastText = '', msgHold = 0;
async function openScan() {
  const msg = document.getElementById('scanMsg'), video = document.getElementById('cam');
  document.getElementById('scanModal').hidden = false;
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia)
    return msg.textContent = '❌ 이 브라우저/주소에서는 카메라를 쓸 수 없습니다. (localhost 또는 https 주소로 열어 주세요) — 아래 [QR 사진 파일로 읽기]를 이용하세요.';
  await startCam(document.getElementById('camSel').value);
}
async function startCam(deviceId) {
  const msg = document.getElementById('scanMsg'), video = document.getElementById('cam');
  stopCam();
  msg.textContent = '카메라를 켜는 중…';
  setTimeout(() => { if (msg.textContent === '카메라를 켜는 중…') msg.textContent = '⏳ 브라우저 주소창 아래 카메라 권한 창에서 [허용]을 눌러 주세요.'; }, 4000);
  try {
    camStream = await navigator.mediaDevices.getUserMedia({ video: deviceId ? { deviceId: { exact: deviceId } } : true });
  } catch (e) {
    if (Date.now() < msgHold) return; // 그사이 사진 파일로 읽은 결과가 떠 있으면 덮어쓰지 않음
    msg.textContent = {
      NotAllowedError: /KAKAOTALK|NAVER|Instagram|FBAN|Line\//i.test(navigator.userAgent)
        ? '❌ 앱 안의 브라우저(카톡·네이버 등)에서는 카메라를 쓸 수 없습니다. 메뉴 → [다른 브라우저로 열기]를 누르거나, 아래 [📸 카메라 앱으로 찍어서 읽기]를 이용하세요.'
        : '❌ 카메라 권한이 거부되었습니다. 주소창 왼쪽 아이콘 → 권한 → 카메라 [허용] 후 다시 시도하거나, 아래 [📸 카메라 앱으로 찍어서 읽기]를 이용하세요.',
      NotFoundError: '❌ 연결된 카메라가 없습니다.',
      NotReadableError: '❌ 카메라를 다른 프로그램(Teams·Zoom 등)이 사용 중이거나 장치가 막혀 있습니다. 해당 프로그램을 종료하고 다시 시도하세요.',
    }[e.name] || `❌ 카메라 오류: ${e.name} ${e.message}`;
    return;
  }
  video.srcObject = camStream;
  try { await video.play(); } catch (e) {}
  // 카메라 목록 (권한을 받은 뒤에야 이름이 보임)
  const sel = document.getElementById('camSel'), cams = (await navigator.mediaDevices.enumerateDevices()).filter(d => d.kind === 'videoinput');
  const curId = camStream.getVideoTracks()[0].getSettings().deviceId;
  sel.innerHTML = cams.map((d, i) => `<option value="${d.deviceId}" ${d.deviceId === curId ? 'selected' : ''}>${esc(d.label || '카메라 ' + (i + 1))}</option>`).join('');
  sel.hidden = cams.length < 2;
  const label = camStream.getVideoTracks()[0].label || '카메라';
  const c = document.createElement('canvas'), g = c.getContext('2d', { willReadFrequently: true });
  let ticks = 0, dark = 0;
  scanTimer = setInterval(() => {
    ticks++;
    if (!video.videoWidth) { if (ticks === 12) msg.textContent = `❌ ${label}: 영상이 들어오지 않습니다. 카메라 가림막·노트북 카메라 끄기 키(F키)를 확인하거나 다른 카메라를 선택하세요.`; return; }
    c.width = video.videoWidth; c.height = video.videoHeight; g.drawImage(video, 0, 0);
    const img = g.getImageData(0, 0, c.width, c.height);
    // 화면이 완전히 검은지 확인 (가림막 등)
    let sum = 0; for (let i = 0; i < img.data.length; i += 4000) sum += img.data[i];
    dark = sum / (img.data.length / 4000) < 8 ? dark + 1 : 0;
    const code = jsQR(img.data, c.width, c.height);
    if (code && code.data !== lastText) { lastText = code.data; msg.textContent = applySig(code.data); }
    else if (!lastText && Date.now() > msgHold) msg.textContent = dark > 8 ? `⚠️ ${label}: 화면이 검게 나옵니다. 카메라 가림막을 확인하세요.` : `📷 ${label} 켜짐 · 서명 QR을 화면 가운데에 크게 비춰 주세요`;
  }, 250);
}
function stopCam() {
  clearInterval(scanTimer);
  if (camStream) camStream.getTracks().forEach(t => t.stop());
  camStream = null;
}
function closeScan() { stopCam(); lastText = ''; closePop('scanModal'); }
// 사진 속 QR 찾기: 전체/가운데 영역 × 여러 크기 × 대비 보정을 차례로 시도
function findQR(src, w, h) {
  const regions = [[0, 0, 1], [0.15, 0.15, 0.7], [0.25, 0.25, 0.5]]; // [x, y, 크기] 비율
  for (const contrast of [false, true])
    for (const [rx, ry, rs] of regions)
      for (const max of [1000, 1600, 700]) {
        const sw = w * rs, sh = h * rs;
        const s = Math.min(1, max / Math.max(sw, sh));
        const c = document.createElement('canvas'); c.width = Math.round(sw * s); c.height = Math.round(sh * s);
        const g = c.getContext('2d', { willReadFrequently: true });
        g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height);
        g.drawImage(src, w * rx, h * ry, sw, sh, 0, 0, c.width, c.height);
        const img = g.getImageData(0, 0, c.width, c.height);
        if (contrast) {
          // 흑백 변환 후 밝기 범위를 늘려 반사·어두운 사진 보정
          const d = img.data; let lo = 255, hi = 0;
          for (let i = 0; i < d.length; i += 4) { const v = (d[i] * 3 + d[i + 1] * 6 + d[i + 2]) / 10; d[i] = v; if (v < lo) lo = v; if (v > hi) hi = v; }
          const k = 255 / Math.max(1, hi - lo);
          for (let i = 0; i < d.length; i += 4) d[i] = d[i + 1] = d[i + 2] = (d[i] - lo) * k;
        }
        const code = jsQR(img.data, c.width, c.height);
        if (code) return code;
      }
  return null;
}
// 카메라가 안 될 때: QR 사진/캡처 파일에서 읽기
function scanFile(input) {
  const msg = document.getElementById('scanMsg');
  [...input.files].forEach(f => {
    const img = new Image();
    img.onload = () => {
      const code = findQR(img, img.naturalWidth, img.naturalHeight);
      const text = code ? applySig(code.data) : `⚠️ ${f.name}: QR을 찾지 못했습니다. QR 부분이 크고 선명하게 나오도록 캡처해 주세요.`;
      msg.textContent = text; msgHold = Date.now() + 8000;
      if (!text.startsWith('✅')) alert(text);
      URL.revokeObjectURL(img.src);
    };
    img.src = URL.createObjectURL(f);
  });
  input.value = '';
}
function applySig(text) {
  const s = unpackSig(text);
  if (!s) return '⚠️ 서명 QR이 아닙니다.';
  if (s.session !== sessionId && !confirm(`${s.name}님의 서명 QR은 현재 서명 링크(${sessionId})가 아닌 다른 링크(${s.session || '코드 없음'})로 만들어졌습니다.\n그래도 반영할까요?`))
    return `⚠️ ${s.name}님: 다른 서명 링크로 만든 QR이라 반영하지 않았습니다.`;
  let png;
  try { png = strokesToPng(s.strokes, s.ver); } catch (e) { return '⚠️ 서명 QR 내용이 손상되었습니다. 다시 서명해 주세요.'; }
  // 결재 서명 → 결재란
  if (s.role) {
    const cell = document.querySelector(`.appr td.sign[data-role="${s.role}"]`);
    if (!cell) return `⚠️ 알 수 없는 결재 구분입니다: ${s.role}`;
    if (cell.querySelector('img') && !confirm(`${s.role} 결재란에 이미 서명이 있습니다. ${s.name}님 서명으로 바꿀까요?`)) return `${s.role} 결재란: 기존 서명 유지`;
    if (!cell.querySelector('.sigbox')) cell.innerHTML = apprCell(s.role);
    setSigImg(cell.querySelector('.sigbox'), png);
    return `✅ 결재(${s.role}) ${s.name}님 서명 반영`;
  }
  // 참석자 서명 → 같은 이름 행, 없으면 첫 빈 행, 없으면 행 추가
  const rows = attRows();
  let tr = rows.find(t => fieldVal(t, 'name') === s.name);
  if (tr && tr.querySelector('.sigbox img') && !confirm(`${s.name}님은 이미 서명했습니다. 새 서명으로 바꿀까요?`)) return `${s.name}님: 기존 서명 유지`;
  if (!tr) tr = rows.find(t => !fieldVal(t, 'name') && !t.querySelector('.sigbox img')) || addRow();
  setField(tr, 'name', s.name); if (s.dept) setField(tr, 'dept', s.dept); if (s.emp) setField(tr, 'emp', s.emp);
  setSigImg(tr.querySelector('.sigbox'), png);
  return `✅ ${s.name}님 서명 반영 (${document.getElementById('att').value}명 완료)`;
}
function updateCount() {
  const rows = attRows();
  const named = rows.filter(tr => fieldVal(tr, 'name')).length;
  const signed = rows.filter(tr => tr.querySelector('.sigbox img')).length;
  document.getElementById('att').value = signed; save();
  document.getElementById('liveInfo').textContent = `📷 스캔 수합 · 서명 ${signed} / ${named}명`;
}

// ── 명단·서명을 이 기기에 저장/복원 (새로고침 대비, 양식별로 따로 저장) ──
function saveRows() {
  store.set(K('attRows'), attRows().map(tr => {
    const img = tr.querySelector('.sigbox img');
    return { dept: fieldVal(tr, 'dept'), emp: fieldVal(tr, 'emp'), name: fieldVal(tr, 'name'), img: img ? img.src : '' };
  }));
}
document.getElementById('attWrap').addEventListener('input', saveRows);
new MutationObserver(saveRows).observe(document.getElementById('attWrap'), { childList: true, subtree: true });
(() => {
  const rows = store.get(K('attRows'), null);
  if (!Array.isArray(rows)) return;
  clearRows();
  rows.forEach(r => {
    const tr = addRow(r.dept, r.name, r.emp);
    if (r.img) {
      const box = tr.querySelector('.sigbox');
      box.innerHTML = `<img src="${r.img}" title="눌러서 다시 서명">`;
      box.querySelector('img').onclick = function () { openSig(this.parentNode); };
    }
  });
  // 예전 버전(기본 5~10행)에서 저장된 명단은 한 번만 기본 20행까지 채움
  if (!store.get(K('rows20'), false)) { for (let i = attRows().length; i < ROWS_DEFAULT; i++) addRow(); store.set(K('rows20'), true); }
  if (rows.some(r => r.name || r.img)) updateCount();
})();
store.set(K('rows20'), true);

// 미서명자 → 미참석자 칸
function fillAbsent() {
  const names = attRows().filter(tr => fieldVal(tr, 'name') && !tr.querySelector('.sigbox img')).map(tr => fieldVal(tr, 'name'));
  document.getElementById('absCnt').value = names.length;
  document.getElementById('absNames').value = names.join(FORM.absJoin || '\n');
  save();
}
