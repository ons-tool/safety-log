// 서명 QR 코덱: 서명 획(좌표)을 압축해 QR 문자열로 만들고, 다시 이미지로 복원
// 형식: SG2|세션|이름|소속|사번|획데이터  (각 필드 encodeURIComponent → ASCII만 사용)
// 획데이터(SG2): 획마다 [점 개수][x0][y0] + (점 개수-1)개의 이동량 바이트(dx,dy 각 4비트) → base64url
// 사진으로 찍어도 읽히도록 QR을 작게(덜 촘촘하게) 만드는 것이 목적
const SIG_W = 128, SIG_H = 48;
const OLD = { W: 160, H: 64, PEN_UP: 255 }; // SG1(이전 형식) 읽기용

// 직선에 가까운 점들을 제거 (Ramer-Douglas-Peucker)
function simplify(pts, tol) {
  if (pts.length < 3) return pts;
  const [ax, ay] = pts[0], [bx, by] = pts[pts.length - 1];
  const len = Math.hypot(bx - ax, by - ay) || 1;
  let far = 0, idx = 0;
  for (let i = 1; i < pts.length - 1; i++) {
    const d = Math.abs((bx - ax) * (ay - pts[i][1]) - (ax - pts[i][0]) * (by - ay)) / len;
    if (d > far) { far = d; idx = i; }
  }
  if (far <= tol) return [pts[0], pts[pts.length - 1]];
  return simplify(pts.slice(0, idx + 1), tol).slice(0, -1).concat(simplify(pts.slice(idx), tol));
}

function encodeStrokes(strokes, w, h) {
  const bytes = [];
  strokes.forEach(st => {
    // 격자 좌표로 변환 → 연속 중복 제거 → 단순화
    let p = st.map(([x, y]) => [
      Math.max(0, Math.min(SIG_W - 1, Math.round(x / w * (SIG_W - 1)))),
      Math.max(0, Math.min(SIG_H - 1, Math.round(y / h * (SIG_H - 1)))),
    ]).filter((q, i, a) => !i || q[0] !== a[i - 1][0] || q[1] !== a[i - 1][1]);
    if (!p.length) return;
    p = simplify(p, 0.7);
    // 한 번에 -8~7칸만 움직일 수 있으므로 긴 구간은 중간점을 넣어 나눔
    const pts = [p[0]];
    for (let i = 1; i < p.length; i++) {
      const [px, py] = pts[pts.length - 1], [x, y] = p[i];
      const n = Math.ceil(Math.max(Math.abs(x - px), Math.abs(y - py)) / 7);
      for (let k = 1; k <= n; k++) pts.push([Math.round(px + (x - px) * k / n), Math.round(py + (y - py) * k / n)]);
    }
    // 점이 255개를 넘으면 획을 나눔
    for (let s = 0; s < pts.length; s += 254) {
      const part = pts.slice(Math.max(0, s - 1), s + 254);
      bytes.push(part.length, part[0][0], part[0][1]);
      for (let i = 1; i < part.length; i++)
        bytes.push(((part[i][0] - part[i - 1][0] + 8) << 4) | (part[i][1] - part[i - 1][1] + 8));
      if (s + 254 >= pts.length) break;
    }
  });
  let s = ''; bytes.forEach(b => s += String.fromCharCode(b));
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromB64(b64) { return atob(b64.replace(/-/g, '+').replace(/_/g, '/')); }

// 획데이터 → [[x,y],...] 목록 (격자 좌표)
function decodeStrokes(b64) {
  const s = fromB64(b64), out = [];
  for (let i = 0; i < s.length;) {
    const n = s.charCodeAt(i), st = [[s.charCodeAt(i + 1), s.charCodeAt(i + 2)]]; i += 3;
    for (let k = 1; k < n; k++, i++) {
      const b = s.charCodeAt(i), [px, py] = st[st.length - 1];
      st.push([px + (b >> 4) - 8, py + (b & 15) - 8]);
    }
    out.push(st);
  }
  return out;
}
function decodeStrokesOld(b64) {
  const s = fromB64(b64), out = []; let st = null;
  for (let i = 0; i < s.length;) {
    const x = s.charCodeAt(i);
    if (x === OLD.PEN_UP) { if (st) out.push(st); st = null; i++; continue; }
    (st = st || []).push([x * (SIG_W - 1) / OLD.W, s.charCodeAt(i + 1) * (SIG_H - 1) / OLD.H]); i += 2;
  }
  if (st) out.push(st);
  return out;
}

function strokesToPng(b64, ver) {
  const strokes = ver === 'SG1' ? decodeStrokesOld(b64) : decodeStrokes(b64);
  const k = 4, c = document.createElement('canvas'); c.width = SIG_W * k; c.height = SIG_H * k;
  const g = c.getContext('2d'); g.scale(k, k);
  g.lineWidth = 1.1; g.lineCap = 'round'; g.lineJoin = 'round';
  strokes.forEach(st => {
    g.beginPath(); g.moveTo(st[0][0] + .5, st[0][1] + .5);
    if (st.length === 1) g.lineTo(st[0][0] + .6, st[0][1] + .5);
    st.slice(1).forEach(([x, y]) => g.lineTo(x + .5, y + .5));
    g.stroke();
  });
  return c.toDataURL('image/png');
}

function packSig(session, name, dept, emp, strokesB64) {
  return ['SG2', session, name, dept, emp].map(encodeURIComponent).join('|') + '|' + strokesB64;
}

function unpackSig(text) {
  const p = String(text).split('|');
  if (p.length !== 6 || (p[0] !== 'SG1' && p[0] !== 'SG2')) return null;
  const [ver, session, name, dept, emp] = p.slice(0, 5).map(decodeURIComponent);
  return { ver, session, name, dept, emp, strokes: p[5] };
}

// QR 그리기: 칸을 정수 픽셀로 맞추고 흰 여백(4칸)을 둬 카메라 앱 인식률 확보
// 데이터가 너무 길면 예외 발생
function drawQR(el, text, maxPx, level = 'M') {
  const qr = qrcode(0, level); qr.addData(text); qr.make();
  const cell = Math.max(2, Math.floor(maxPx / (qr.getModuleCount() + 8)));
  el.innerHTML = qr.createImgTag(cell, cell * 4);
  el.querySelector('img').style.cssText = 'display:block;image-rendering:pixelated;background:#fff';
}

if (typeof module !== 'undefined') module.exports = { encodeStrokes, decodeStrokes, packSig, unpackSig, SIG_W, SIG_H };
