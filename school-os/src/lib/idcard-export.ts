import QRCode from 'qrcode';
import { SCHOOL, type IdCardData } from './idcard';

/* ---------------- PNG export (canvas redraw of the card front) ---------------- */

export interface CardExportOptions {
  qrText: string;
  version: number;
  showPrivate: boolean;
}

const INK = '#182033';
const INK_SOFT = '#34405A';
const MUTED = '#596780';

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

export async function drawIdCardPng(card: IdCardData, opts: CardExportOptions): Promise<HTMLCanvasElement> {
  try {
    await Promise.race([
      document.fonts.ready,
      new Promise((resolve) => setTimeout(resolve, 800)),
    ]);
  } catch { /* system fonts are a fine fallback */ }

  const W = 1012;
  const H = 638;
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas unavailable');

  // shell
  const bg = ctx.createLinearGradient(0, 0, W, H);
  bg.addColorStop(0, '#F8FBFF');
  bg.addColorStop(0.55, '#EDF2FB');
  bg.addColorStop(1, '#DCE7FB');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);
  const band = ctx.createLinearGradient(0, 0, W, 0);
  band.addColorStop(0, '#ABC4FF');
  band.addColorStop(0.5, '#C1D3FE');
  band.addColorStop(1, '#ABC4FF');
  ctx.fillStyle = band;
  ctx.fillRect(0, 0, W, 12);

  // header: logo chevron + school name
  ctx.strokeStyle = INK;
  ctx.lineWidth = 8;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.beginPath();
  ctx.moveTo(66, 118);
  ctx.lineTo(104, 48);
  ctx.lineTo(142, 118);
  ctx.stroke();
  ctx.fillStyle = '#ABC4FF';
  ctx.beginPath();
  ctx.arc(104, 132, 7, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = INK;
  ctx.font = '800 44px "Plus Jakarta Sans", system-ui, sans-serif';
  ctx.textBaseline = 'alphabetic';
  ctx.fillText(SCHOOL.name, 172, 96);
  ctx.fillStyle = MUTED;
  ctx.font = '500 21px "JetBrains Mono", ui-monospace, monospace';
  ctx.fillText(`${SCHOOL.trust} · ${SCHOOL.code} · ${SCHOOL.place}`.toUpperCase(), 174, 130);
  if (card.session !== '') {
    ctx.font = '600 22px "JetBrains Mono", ui-monospace, monospace';
    const w = ctx.measureText(card.session).width + 44;
    ctx.strokeStyle = '#B6CCFE';
    ctx.lineWidth = 2;
    roundRect(ctx, W - 48 - w, 52, w, 52, 26);
    ctx.stroke();
    ctx.fillStyle = INK;
    ctx.fillText(card.session, W - 48 - w + 22, 87);
  }
  ctx.fillStyle = '#C1D3FE';
  ctx.fillRect(48, 172, W - 96, 2);

  // monogram
  const mg = ctx.createLinearGradient(48, 210, 218, 380);
  mg.addColorStop(0, '#CCDBFD');
  mg.addColorStop(1, '#ABC4FF');
  ctx.fillStyle = mg;
  roundRect(ctx, 48, 210, 170, 170, 28);
  ctx.fill();
  ctx.fillStyle = INK;
  ctx.font = '800 68px "Plus Jakarta Sans", system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(card.initials, 133, 322);
  ctx.textAlign = 'left';

  // name + role/id
  ctx.fillStyle = INK;
  ctx.font = '800 52px "Plus Jakarta Sans", system-ui, sans-serif';
  ctx.fillText(card.fullName, 248, 282, 470);
  ctx.fillStyle = INK_SOFT;
  ctx.font = '600 27px "JetBrains Mono", ui-monospace, monospace';
  ctx.fillText(`${card.roleLabel.toUpperCase()} · ${card.institutionalId}`, 250, 330);

  // detail cells
  const cols = card.lines.slice(0, 3);
  cols.forEach((l, i) => {
    const x = 250 + i * 168;
    ctx.fillStyle = 'rgba(255,255,255,0.55)';
    roundRect(ctx, x, 356, 156, 76, 16);
    ctx.fill();
    ctx.fillStyle = MUTED;
    ctx.font = '500 17px "JetBrains Mono", ui-monospace, monospace';
    ctx.fillText(l.label.toUpperCase(), x + 14, 384);
    ctx.fillStyle = INK;
    ctx.font = '700 25px "Plus Jakarta Sans", system-ui, sans-serif';
    ctx.fillText(l.value, x + 14, 416, 140);
  });

  // QR pad (right column)
  const qr = QRCode.create(opts.qrText, { errorCorrectionLevel: 'M' });
  const n = qr.modules.size;
  const padX = W - 268;
  const padY = 196;
  const padS = 220;
  ctx.fillStyle = '#FFFFFF';
  roundRect(ctx, padX, padY, padS, padS, 20);
  ctx.fill();
  ctx.strokeStyle = '#C1D3FE';
  ctx.lineWidth = 2;
  roundRect(ctx, padX, padY, padS, padS, 20);
  ctx.stroke();
  const quiet = 2;
  const cell = (padS - 32) / (n + quiet * 2);
  const ox = padX + 16 + quiet * cell;
  const oy = padY + 16 + quiet * cell;
  ctx.fillStyle = INK;
  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n; c++) {
      if (qr.modules.data[r * n + c]) ctx.fillRect(ox + c * cell, oy + r * cell, cell + 0.5, cell + 0.5);
    }
  }

  // private lines
  if (opts.showPrivate) {
    const privates = [
      card.guardian !== '' ? `Guardian · ${card.guardian}` : '',
      card.email !== '' ? card.email : '',
      card.phone !== '' ? card.phone : '',
    ].filter((v) => v !== '').slice(0, 2);
    ctx.fillStyle = INK_SOFT;
    ctx.font = '600 23px "Plus Jakarta Sans", system-ui, sans-serif';
    privates.forEach((p, i) => ctx.fillText(p, 250, 478 + i * 36, 470));
  }

  // footer
  ctx.fillStyle = MUTED;
  ctx.font = '500 22px "JetBrains Mono", ui-monospace, monospace';
  ctx.fillText(`SCAN TO VERIFY · CREDENTIAL v${opts.version}`, 48, H - 44);
  ctx.textAlign = 'right';
  ctx.fillText(SCHOOL.code, W - 48, H - 44);
  ctx.textAlign = 'left';
  return canvas;
}

/* ---------------- print (dedicated print window, CR80 proportions) ---------------- */

export async function printIdCard(card: IdCardData, opts: CardExportOptions): Promise<void> {
  const qrCanvas = document.createElement('canvas');
  await QRCode.toCanvas(qrCanvas, opts.qrText, {
    width: 220, margin: 1, color: { dark: '#182033', light: '#ffffff' },
  });
  const qrUrl = qrCanvas.toDataURL('image/png');
  const win = window.open('', '_blank', 'width=480,height=360');
  if (!win) throw new Error('Popup blocked — allow popups to print the ID card.');

  const cells = card.lines.slice(0, 3).map((l) => `
    <div class="cell"><div class="lbl">${l.label}</div><div class="val">${l.value}</div></div>`).join('');
  const privates = opts.showPrivate
    ? [card.guardian !== '' ? `Guardian · ${card.guardian}` : '', card.email, card.phone]
      .filter((v) => v !== '').slice(0, 2).map((p) => `<div class="priv">${p}</div>`).join('')
    : '';
  const session = card.session !== '' ? `<div class="session">${card.session}</div>` : '';

  win.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>${card.fullName} · ID Card</title>
<style>
  @page { size: auto; margin: 8mm; }
  * { box-sizing: border-box; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  body { margin: 0; font-family: "Plus Jakarta Sans", system-ui, sans-serif; color: #182033; }
  .card { width: 85.6mm; height: 53.98mm; border-radius: 4mm; overflow: hidden;
    background: linear-gradient(135deg, #F8FBFF 0%, #EDF2FB 55%, #DCE7FB 100%);
    border: 0.4mm solid #C1D3FE; padding: 3.4mm 4mm; position: relative; }
  .band { position: absolute; top: 0; left: 0; right: 0; height: 1.4mm;
    background: linear-gradient(90deg, #ABC4FF, #C1D3FE, #ABC4FF); }
  .head { display: flex; align-items: center; gap: 2.4mm; }
  .school { font-weight: 800; font-size: 4.6mm; letter-spacing: -0.01em; }
  .sub { font-family: monospace; font-size: 2.1mm; color: #596780; letter-spacing: 0.06em; }
  .session { margin-left: auto; font-family: monospace; font-size: 2.4mm; font-weight: 600;
    border: 0.35mm solid #B6CCFE; border-radius: 3mm; padding: 0.8mm 2.2mm; }
  .rule { height: 0.3mm; background: #C1D3FE; margin: 2.4mm 0; }
  .body { display: flex; gap: 3mm; }
  .mono { width: 17mm; height: 17mm; border-radius: 3mm; flex: none;
    background: linear-gradient(140deg, #CCDBFD, #ABC4FF);
    display: flex; align-items: center; justify-content: center;
    font-weight: 800; font-size: 7mm; }
  .name { font-weight: 800; font-size: 5.4mm; letter-spacing: -0.01em; }
  .role { font-family: monospace; font-size: 2.6mm; color: #34405A; margin-top: 0.8mm; }
  .cells { display: flex; gap: 1.6mm; margin-top: 2mm; }
  .cell { background: rgba(255,255,255,0.55); border-radius: 1.8mm; padding: 1.2mm 1.8mm; min-width: 0; }
  .lbl { font-family: monospace; font-size: 1.9mm; color: #596780; letter-spacing: 0.05em; }
  .val { font-size: 2.7mm; font-weight: 700; white-space: nowrap; }
  .priv { font-size: 2.4mm; font-weight: 600; color: #34405A; margin-top: 1mm; }
  .qr { margin-left: auto; flex: none; background: #fff; border: 0.35mm solid #C1D3FE;
    border-radius: 2.4mm; padding: 1.4mm; height: fit-content; }
  .qr img { width: 19mm; height: 19mm; display: block; }
  .foot { display: flex; justify-content: space-between; font-family: monospace;
    font-size: 2.2mm; color: #596780; margin-top: 2.2mm; }
</style></head><body>
<div class="card"><div class="band"></div>
  <div class="head">
    <svg width="30" height="30" viewBox="0 0 32 32"><rect width="32" height="32" rx="9" fill="#EDF2FB"/><path d="M9 20.5 16 9l7 11.5" stroke="#182033" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" fill="none"/><circle cx="16" cy="22.6" r="1.6" fill="#ABC4FF"/></svg>
    <div><div class="school">${SCHOOL.name}</div><div class="sub">${SCHOOL.trust} · ${SCHOOL.code} · ${SCHOOL.place}</div></div>
    ${session}
  </div>
  <div class="rule"></div>
  <div class="body">
    <div class="mono">${card.initials}</div>
    <div style="min-width:0"><div class="name">${card.fullName}</div>
      <div class="role">${card.roleLabel.toUpperCase()} · ${card.institutionalId}</div>
      <div class="cells">${cells}</div>${privates}</div>
    <div class="qr"><img src="${qrUrl}" alt="ID verification QR code"></div>
  </div>
  <div class="foot"><span>SCAN TO VERIFY · CREDENTIAL v${opts.version}</span><span>${SCHOOL.code}</span></div>
</div>
<script>window.onload = () => { window.focus(); window.print(); };</script>
</body></html>`);
  win.document.close();
}

