// 서명 QR 코덱: 서명 획(좌표)을 압축해 QR 문자열로 만들고, 다시 이미지로 복원
// 형식: SG1|세션|이름|소속|사번|획데이터  (각 필드 encodeURIComponent → ASCII만 사용)
const SIG_W = 160, SIG_H = 64, PEN_UP = 255;

function encodeStrokes(strokes, w, h) {
  const bytes = [];
  strokes.forEach(st => {
    let lx = -9, ly = -9;
    st.forEach(([x, y], i) => {
      const X = Math.max(0, Math.min(SIG_W, Math.round(x / w * SIG_W)));
      const Y = Math.max(0, Math.min(SIG_H, Math.round(y / h * SIG_H)));
      // 가까운 점은 생략해 QR 크기를 줄임 (획 끝점은 유지)
      if (i && i < st.length - 1 && Math.hypot(X - lx, Y - ly) < 3) return;
      bytes.push(X, Y); lx = X; ly = Y;
    });
    bytes.push(PEN_UP);
  });
  let s = ''; bytes.forEach(b => s += String.fromCharCode(b));
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function strokesToPng(b64) {
  const s = atob(b64.replace(/-/g, '+').replace(/_/g, '/'));
  const c = document.createElement('canvas'); c.width = SIG_W * 3; c.height = SIG_H * 3;
  const g = c.getContext('2d'); g.scale(3, 3);
  g.lineWidth = 1.4; g.lineCap = 'round'; g.lineJoin = 'round';
  let start = true;
  for (let i = 0; i < s.length;) {
    const x = s.charCodeAt(i);
    if (x === PEN_UP) { g.stroke(); start = true; i++; continue; }
    const y = s.charCodeAt(i + 1); i += 2;
    if (start) { g.beginPath(); g.moveTo(x, y); g.lineTo(x + 0.1, y); start = false; } else g.lineTo(x, y);
  }
  g.stroke();
  return c.toDataURL('image/png');
}

function packSig(session, name, dept, emp, strokesB64) {
  return ['SG1', session, name, dept, emp].map(encodeURIComponent).join('|') + '|' + strokesB64;
}

function unpackSig(text) {
  const p = String(text).split('|');
  if (p.length !== 6 || p[0] !== 'SG1') return null;
  const [, session, name, dept, emp] = p.slice(0, 5).map(decodeURIComponent);
  return { session, name, dept, emp, strokes: p[5] };
}
