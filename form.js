// 교육일지 공통 화면 동작 (안전교육일지·보안교육일지가 함께 사용)
// 양식별 설정은 페이지에서 window.FORM 으로 넘김:
//   key      : 브라우저 저장 공간 이름 앞에 붙는 구분자 (양식마다 데이터를 따로 저장)
//   name     : 파일명·메일 제목에 쓰는 양식 이름
//   ids      : 자동 저장할 입력칸 id 목록
//   rowCells : 참석자 행에서 번호 칸 뒤에 올 칸 ('dept'/'emp'/'name'/'sig')
//   split    : true면 참석자 명단을 좌우 2단(#attL, #attR), 아니면 #attBody 한 단
//   absJoin  : 미서명자 → 미참석자 때 이름을 이어 붙일 구분 문자
//   signParam: 서명 링크에 붙일 양식 구분 (sign.html 화면 구성용)
const FORM = window.FORM;
const K = k => (FORM.key || '') + k; // 저장 공간 이름
const ids = FORM.ids;
let photos = [];
const MAIL_TO = '';

// 입력값 자동 저장/복원
function save(){ try{ const o={}; ids.forEach(i=>o[i]=document.getElementById(i).value); localStorage.setItem(K('safetyLog'),JSON.stringify(o)); }catch(e){} }
try{ const o=JSON.parse(localStorage.getItem(K('safetyLog'))||'{}'); ids.forEach(i=>{ if(o[i]!=null) document.getElementById(i).value=o[i]; }); }catch(e){}
ids.forEach(i=>document.getElementById(i).addEventListener('input',save));
function resetAll(){
  if(!confirm('입력 내용과 참석자 명단·서명을 모두 지울까요? (진행 중인 서명 링크도 새로 바뀝니다)')) return;
  ['safetyLog','signSession','attRows'].forEach(k=>{ try{ localStorage.removeItem(K(k)); }catch(e){} });
  location.reload();
}

// 사진: 용량 줄이기 위해 1280px로 축소
function addPhotos(input){
  [...input.files].forEach(f=>{
    const img=new Image();
    img.onload=()=>{
      const s=Math.min(1,1280/Math.max(img.width,img.height));
      const c=document.createElement('canvas'); c.width=img.width*s; c.height=img.height*s;
      c.getContext('2d').drawImage(img,0,0,c.width,c.height);
      photos.push(c.toDataURL('image/jpeg',0.8)); renderPhotos(); URL.revokeObjectURL(img.src);
    };
    img.src=URL.createObjectURL(f);
  });
  input.value='';
}
function renderPhotos(){
  document.getElementById('photos').innerHTML = photos.map((p,i)=>
    `<figure><img src="${p}"><button class="del" onclick="photos.splice(${i},1);renderPhotos()">×</button></figure>`).join('');
  updateTotals();
}

// 서명: [서명하기] 버튼 → 팝업에서 서명 → 칸에 이미지로 삽입
const pad=document.getElementById('pad'), pctx=pad.getContext('2d');
let target=null, drawn=false;
function sigCell(){ return `<div class="sigbox"><button class="sbtn" onclick="openSig(this.parentNode)">✍️ 서명하기</button></div>`; }
function openSig(box){
  target=box; document.getElementById('modal').hidden=false;
  const r=pad.getBoundingClientRect(); pad.width=r.width*2; pad.height=r.height*2;
  pctx.setTransform(2,0,0,2,0,0); pctx.lineWidth=2.5; pctx.lineCap='round'; pctx.lineJoin='round'; drawn=false;
}
function closeSig(){ document.getElementById('modal').hidden=true; target=null; }
function clearPad(){ pctx.clearRect(0,0,pad.width,pad.height); drawn=false; }
function doneSig(){
  if(!drawn){ alert('서명을 입력해 주세요.'); return; }
  setSigImg(target, pad.toDataURL('image/png'));
  closeSig();
}
// 서명 이미지 넣기: 참석자 칸은 누르면 다시 서명, 결재란은 누르면 서명을 지우고 버튼(직접/QR)으로 되돌림
function setSigImg(box, src){
  const appr=box.closest('.appr td.sign');
  box.innerHTML=`<img src="${src}" title="${appr?'눌러서 서명 지우기':'눌러서 다시 서명'}">`;
  box.querySelector('img').onclick = appr
    ? function(){ if(confirm(`${appr.dataset.role} 결재 서명을 지우고 다시 받을까요?`)) appr.innerHTML=apprCell(appr.dataset.role); }
    : function(){ openSig(this.parentNode); };
  if(!appr && typeof saveRows==='function'){ updateCount(); saveRows(); }
}
(()=>{ let on=false;
  const pt=e=>{ const b=pad.getBoundingClientRect(); return [e.clientX-b.left,e.clientY-b.top]; };
  pad.onpointerdown=e=>{ on=true; pad.setPointerCapture(e.pointerId); pctx.beginPath(); pctx.moveTo(...pt(e)); };
  pad.onpointermove=e=>{ if(on){ pctx.lineTo(...pt(e)); pctx.stroke(); drawn=true; } };
  pad.onpointerup=pad.onpointercancel=()=>on=false;
})();
// 결재란: 직접 서명 + 결재자 휴대폰 QR 서명
function apprCell(role){ return `<div class="sigbox appr-btns"><button class="sbtn" onclick="openSig(this.parentNode)">✍️ 서명</button><button class="sbtn" onclick="openShare('${role}')">📱 QR</button></div>`; }

// ── 참석자 명단 ──
const ROWS_DEFAULT=FORM.rows||20;
// 행 목록 (화면 순서 = 번호 순서). 2단이면 왼쪽 표 → 오른쪽 표 순서
function attRows(){ return [...document.querySelectorAll('#attWrap tr.att-row')]; }
function fieldEl(tr,f){ return tr.querySelector('.f-'+f); }
// 체크박스 칸은 체크되면 '1', 아니면 ''
function fieldVal(tr,f){ const el=fieldEl(tr,f); if(!el) return ''; return el.type==='checkbox' ? (el.checked?'1':'') : el.value.trim(); }
function setField(tr,f,v){ const el=fieldEl(tr,f); if(!el) return; if(el.type==='checkbox') el.checked = v==='1'||v===true; else el.value=v; }
// 칸 이름이 'it_'로 시작하면 품목 수령 체크박스 칸
const cellHtml=c=>c==='sig' ? `<td class="sigcell">${sigCell()}</td>`
  : c.startsWith('it_') ? `<td><input type="checkbox" class="f-${c} chk" title="수령"></td>` : `<td><input class="f-${c}"></td>`;
function addRow(dept='',name='',emp=''){
  const tr=document.createElement('tr'); tr.className='att-row';
  tr.innerHTML=`<td><span class="rn"></span><button class="rdel" title="이 행 삭제" onclick="delRow(this.closest('tr'))">✕</button></td>`
    + FORM.rowCells.map(cellHtml).join('');
  setField(tr,'dept',dept); setField(tr,'emp',emp); setField(tr,'name',name);
  document.getElementById(FORM.split ? 'attR' : 'attBody').appendChild(tr);
  layoutRows();
  return tr;
}
// 번호 다시 매기기 + 2단이면 앞쪽 절반은 왼쪽 표, 나머지는 오른쪽 표로 배치
function layoutRows(){
  const rows=attRows();
  if(FORM.split){
    const L=document.getElementById('attL'), R=document.getElementById('attR'), half=Math.ceil(rows.length/2);
    rows.forEach((tr,i)=>{ const to=i<half?L:R; if(tr.parentNode!==to || to.lastElementChild!==tr) to.appendChild(tr); });
  }
  rows.forEach((tr,i)=>tr.querySelector('.rn').textContent=i+1);
  updateTotals();
}
function clearRows(){ attRows().forEach(tr=>tr.remove()); }
// 합계 줄: FORM.totals에 적힌 칸(예: 수량)의 숫자를 더해 #sum_칸이름 에 표시
function updateTotals(){
  if(typeof FORM.updateTotals==='function') return FORM.updateTotals();
  (FORM.totals||[]).forEach(f=>{
    const sum=attRows().reduce((a,tr)=>a+(parseFloat(fieldVal(tr,f).replace(/[^\d.-]/g,''))||0),0);
    const el=document.getElementById('sum_'+f), t=`${sum} 개`; if(el && el.textContent!==t) el.textContent=t;
  });
}
function delRow(tr){
  const name=fieldVal(tr,'name'), signed=!!tr.querySelector('.sigbox img');
  if((name||signed||fieldVal(tr,'dept')||fieldVal(tr,'emp'))
     && !confirm(`${tr.querySelector('.rn').textContent}번 ${name?name+'님 ':''}행을 삭제할까요?${signed?'\n(받은 서명도 함께 지워집니다)':''}`)) return;
  tr.remove(); layoutRows();
  if(typeof updateCount==='function') updateCount(); else updateTotals();
  if(typeof saveRows==='function') saveRows();
}
function delLastRow(){
  const rows=attRows();
  if(!rows.length) return alert('삭제할 행이 없습니다.');
  delRow(rows[rows.length-1]);
}
document.querySelectorAll('.appr .sign').forEach(td=>td.innerHTML=apprCell(td.dataset.role));
for(let i=0;i<ROWS_DEFAULT;i++) addRow();

// 날짜: 달력 선택 → "2026년 10월 12일" 표시 (#dateText와 .dateText 모두)
function showDate(){ const v=document.getElementById('date').value.split('-');
  const t = v.length===3 ? `${v[0]}년 ${+v[1]}월 ${+v[2]}일` : '____년 __월 __일';
  document.querySelectorAll('#dateText, .dateText').forEach(el=>el.textContent=t); }
const dt=document.getElementById('date'); if(!dt.value) dt.valueAsDate=new Date(); showDate();
dt.addEventListener('change',()=>{ showDate(); save(); });

function fileName(){
  const v=i=>{ const el=document.getElementById(i); return el ? el.value.trim() : ''; };
  return `${FORM.name}_${v('date').replaceAll('-','')}${document.getElementById('team') ? '_'+(v('team')||'팀') : ''}.pdf`;
}

// PDF: 화면 크기와 무관하게 A4 폭(194mm≈733px)의 복제본을 만들어 변환
async function makePdf(){
  const doc=document.getElementById('doc'), clone=doc.cloneNode(true);
  clone.removeAttribute('id'); clone.classList.add('pdf-mode','pdf-sheet');
  // 복제본 안의 id 제거 (원본 명단 등과 겹쳐 저장·집계 코드가 복제본을 읽지 않도록)
  clone.querySelectorAll('[id]').forEach(el=>el.removeAttribute('id'));
  // 입력칸 → 일반 글자로 바꿔 잘림 방지
  const src=doc.querySelectorAll('input,textarea'), dst=clone.querySelectorAll('input,textarea');
  dst.forEach((el,i)=>{
    const o=src[i];
    if(['file','date'].includes(o.type)) return el.remove();
    if(o.type==='checkbox'){ const t=document.createElement('span'); t.className='pdf-val'; t.textContent=o.checked?'✔':''; return el.replaceWith(t); }
    const t=document.createElement(o.tagName==='TEXTAREA'?'div':'span');
    t.className=o.tagName==='TEXTAREA'?'pdf-text':'pdf-val'; t.textContent=o.value;
    if(el.style.width) t.style.display='inline-block', t.style.minWidth=el.style.width;
    el.replaceWith(t);
  });
  const wrap=document.createElement('div'); wrap.style.cssText='position:absolute;left:0;top:0;width:733px;z-index:-1';
  const sx=scrollX, sy=scrollY; scrollTo(0,0);
  wrap.appendChild(clone); document.body.appendChild(wrap);
  try{
    return await html2pdf().set({
      margin:8, filename:fileName(), image:{type:'jpeg',quality:0.95},
      html2canvas:{scale:2, width:733, windowWidth:733, scrollX:0, scrollY:0, x:0, y:0}, jsPDF:{unit:'mm',format:'a4'},
      pagebreak:{mode:['css','legacy'], before:'.page2', avoid:['tr','figure','.att tr']}
    }).from(clone).outputPdf('blob');
  } finally { wrap.remove(); scrollTo(sx,sy); }
}

async function savePdf(){
  const blob=await makePdf();
  const a=document.createElement('a'); a.href=URL.createObjectURL(blob); a.download=fileName(); a.click();
}

async function sendMail(){
  const blob=await makePdf();
  const file=new File([blob],fileName(),{type:'application/pdf'});
  const topic=document.getElementById('topic');
  const subject=`[${FORM.name}] ${topic ? topic.value : document.getElementById('dateText').textContent}`;
  // 휴대폰: 공유창 → 메일앱에 PDF 첨부
  if(navigator.canShare && navigator.canShare({files:[file]})){
    try{ await navigator.share({files:[file], title:subject, text:subject}); return; }catch(e){ if(e.name==='AbortError') return; }
  }
  // PC: PDF 다운로드 후 메일 창 열기 (첨부는 직접)
  const a=document.createElement('a'); a.href=URL.createObjectURL(blob); a.download=fileName(); a.click();
  alert('PC에서는 메일 자동 첨부가 불가합니다.\n다운로드된 PDF를 메일에 직접 첨부해 주세요.');
  location.href=`mailto:${MAIL_TO}?subject=${encodeURIComponent(subject)}`;
}
