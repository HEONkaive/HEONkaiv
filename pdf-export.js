/* HEON ARCHIVE — browser-only A4 PDF writer (v12.8.2).
 * The page is rasterized with Canvas to preserve Korean glyphs and figures
 * on iPad Safari without print dialogs, web fonts, CDN dependencies, or uploads.
 * Each page is stored as a JPEG XObject in a standards-compliant PDF 1.4 file.
 */
(() => {
  'use strict';
  const PAGE_WIDTH = 1190;  // A4 at ~144 DPI
  const PAGE_HEIGHT = 1684;
  const MARGIN = 74;
  const CONTENT_RIGHT = PAGE_WIDTH - MARGIN;
  const BOTTOM = PAGE_HEIGHT - 93;
  const FONT = '"Apple SD Gothic Neo", "Malgun Gothic", "Nanum Gothic", "Noto Sans CJK KR", sans-serif';
  const encoder = new TextEncoder();
  const COLORS = {
    ink: '#172c4b', muted: '#58708e', blue: '#215fcd', line: '#d9e4f1',
    pale: '#f2f6fb', green: '#157d58', greenPale: '#ebf8f2', red: '#b6384b',
    white: '#ffffff', gold: '#9a6300'
  };
  const tick = () => new Promise(resolve => requestAnimationFrame(resolve));

  // Wrap Korean/Latin strings at the actual rendered canvas width; preserve
  // newlines and split any unusually long word instead of clipping it.
  function wrapText(ctx, text, width) {
    const out = [];
    for (const paragraph of String(text ?? '').replace(/\r\n?/g, '\n').split('\n')) {
      if (!paragraph.trim()) { out.push(''); continue; }
      const tokens = paragraph.trim().match(/\S+|\s+/g) || [];
      let line = '';
      for (let token of tokens) {
        if (/^\s+$/.test(token) && !line) continue;
        if (ctx.measureText(line + token).width <= width) { line += token; continue; }
        if (line.trim()) { out.push(line.trimEnd()); line = ''; }
        token = token.trimStart();
        if (!token) continue;
        if (ctx.measureText(token).width <= width) { line = token; continue; }
        // Oversize words / equations / URLs: split on code points.
        for (const char of token) {
          if (line && ctx.measureText(line + char).width > width) {
            out.push(line); line = '';
          }
          line += char;
        }
      }
      if (line.trim()) out.push(line.trimEnd());
    }
    return out.length ? out : [''];
  }

  class PdfFile {
    constructor() { this.images = []; }
    async addCanvas(canvas) {
      const blob = await new Promise((resolve, reject) => {
        try { canvas.toBlob(b => b ? resolve(b) : reject(new Error('PDF용 페이지 이미지 생성 실패')), 'image/jpeg', 0.88); }
        catch (err) { reject(err); }
      });
      this.images.push(new Uint8Array(await blob.arrayBuffer()));
    }
    build() {
      const bytes = [];
      let length = 0;
      const add = chunk => {
        const value = typeof chunk === 'string' ? encoder.encode(chunk) : chunk;
        bytes.push(value); length += value.length;
      };
      const offsets = [0];
      const begin = id => { offsets[id] = length; add(id + ' 0 obj\n'); };
      const end = () => add('\nendobj\n');
      const count = this.images.length;
      if (!count) throw new Error('저장할 PDF 페이지가 없습니다.');
      add('%PDF-1.4\n%HEON-ARCHIVE\n');
      begin(1); add('<< /Type /Catalog /Pages 2 0 R >>'); end();
      begin(2);
      add('<< /Type /Pages /Count ' + count + ' /Kids [');
      for (let i = 0; i < count; i++) add((3 + i * 3) + ' 0 R ');
      add('] >>'); end();
      for (let i = 0; i < count; i++) {
        const pid = 3 + i * 3, iid = pid + 1, cid = pid + 2;
        begin(pid);
        add('<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595.28 841.89] ' +
            '/Resources << /XObject << /Im0 ' + iid + ' 0 R >> >> /Contents ' + cid + ' 0 R >>');
        end();
        const img = this.images[i];
        begin(iid);
        add('<< /Type /XObject /Subtype /Image /Width ' + PAGE_WIDTH + ' /Height ' + PAGE_HEIGHT +
            ' /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ' + img.length +
            ' >>\nstream\n');
        add(img); add('\nendstream'); end();
        const commands = 'q\n595.28 0 0 841.89 0 0 cm\n/Im0 Do\nQ\n';
        begin(cid);
        add('<< /Length ' + encoder.encode(commands).length + ' >>\nstream\n' + commands + 'endstream');
        end();
      }
      const xref = length;
      add('xref\n0 ' + (count * 3 + 3) + '\n0000000000 65535 f \n');
      for (let i = 1; i <= count * 3 + 2; i++) {
        add(String(offsets[i]).padStart(10, '0') + ' 00000 n \n');
      }
      add('trailer\n<< /Size ' + (count * 3 + 3) + ' /Root 1 0 R >>\nstartxref\n' + xref + '\n%%EOF\n');
      return new Blob(bytes, {type:'application/pdf'});
    }
  }

  class PdfPainter {
    constructor(writer, title, mode) {
      this.writer = writer;
      this.title = title;
      this.mode = mode;
      this.canvas = null;
      this.ctx = null;
      this.page = 0;
      this.question = null;
      this.y = 0;
    }
    font(size = 22, weight = '400') { this.ctx.font = `${weight} ${size}px ${FONT}`; }
    async startPage(continued = false) {
      if (this.canvas) await this.writer.addCanvas(this.canvas);
      this.canvas = document.createElement('canvas');
      this.canvas.width = PAGE_WIDTH;
      this.canvas.height = PAGE_HEIGHT;
      this.ctx = this.canvas.getContext('2d', {alpha:false});
      if (!this.ctx) throw new Error('이 브라우저에서 PDF 페이지를 만들 수 없습니다.');
      const ctx = this.ctx;
      this.page++;
      ctx.fillStyle = COLORS.white;
      ctx.fillRect(0, 0, PAGE_WIDTH, PAGE_HEIGHT);
      ctx.fillStyle = COLORS.blue;
      ctx.fillRect(MARGIN, 63, 8, 37);
      this.font(24, '800');
      ctx.fillStyle = COLORS.ink;
      ctx.fillText('HEON ARCHIVE', MARGIN + 23, 90);
      this.font(15, '500');
      ctx.fillStyle = COLORS.muted;
      const pageLabel = `PAGE ${this.page}`;
      ctx.fillText(pageLabel, CONTENT_RIGHT - ctx.measureText(pageLabel).width, 88);
      ctx.fillStyle = COLORS.line;
      ctx.fillRect(MARGIN, 112, PAGE_WIDTH - MARGIN * 2, 2);
      this.y = 141;
      if (continued && this.question) {
        this.font(16, '700'); ctx.fillStyle = COLORS.blue;
        ctx.fillText(`${this.question} · 계속`, MARGIN, this.y + 15);
        this.y += 41;
      }
      ctx.fillStyle = COLORS.line;
      ctx.fillRect(MARGIN, PAGE_HEIGHT - 67, PAGE_WIDTH - MARGIN * 2, 1);
      this.font(14, '400');
      ctx.fillStyle = COLORS.muted;
      ctx.fillText(`${this.title}  ·  ${this.mode}`, MARGIN, PAGE_HEIGHT - 43);
    }
    async ensure(height) {
      if (!this.canvas) await this.startPage();
      if (this.y + height > BOTTOM) await this.startPage(true);
    }
    async gap(h=12) {
      await this.ensure(h);
      this.y += h;
    }
    async paragraph(value, opts={}) {
      const {size=21,lineHeight=31,weight='400',color=COLORS.ink,
        left=MARGIN,width=PAGE_WIDTH-left-MARGIN,after=9} = opts;
      this.font(size, weight);
      const lines = wrapText(this.ctx, value, width);
      for (const line of lines) {
        await this.ensure(lineHeight + 2);
        this.font(size, weight);
        this.ctx.fillStyle = color;
        this.ctx.fillText(line, left, this.y + size);
        this.y += lineHeight;
      }
      if (after) await this.gap(after);
    }
    async heading(value) {
      await this.ensure(51);
      this.font(19, '800'); this.ctx.fillStyle = COLORS.blue;
      this.ctx.fillText(value, MARGIN, this.y + 21);
      this.y += 40;
    }
    async box(text, opts={}) {
      const size=opts.size||18, lineHeight=opts.lineHeight||27;
      const inset=14, width=PAGE_WIDTH-MARGIN*2;
      this.font(size, opts.weight||'400');
      const lines = wrapText(this.ctx,text,width-inset*2);
      let cursor=0;
      while (cursor < lines.length) {
        await this.ensure(lineHeight+24);
        const capacity = Math.max(1, Math.floor((BOTTOM-this.y-20)/lineHeight));
        const slice=lines.slice(cursor,cursor+capacity);
        const height=slice.length*lineHeight+20;
        const ctx=this.ctx;
        ctx.fillStyle=opts.background||COLORS.pale;
        ctx.fillRect(MARGIN,this.y,width,height);
        if (opts.accent) {ctx.fillStyle=opts.accent;ctx.fillRect(MARGIN,this.y,5,height);}
        this.font(size,opts.weight||'400');
        ctx.fillStyle=opts.color||COLORS.ink;
        slice.forEach((line,i)=>ctx.fillText(line,MARGIN+inset,this.y+11+size+i*lineHeight));
        this.y+=height+6;
        cursor+=slice.length;
      }
    }
    async image(url, label, maxHeight=470) {
      if (!url) return;
      let img;
      try {
        img = new Image();
        img.decoding = 'async';
        img.src = new URL(url, document.baseURI).href;
        await new Promise((resolve, reject) => {
          if (img.complete && img.naturalWidth) { resolve(); return; }
          img.onload = () => resolve();
          img.onerror = () => reject(new Error('image load failed'));
        });
        if (!img.naturalWidth || !img.naturalHeight) throw new Error('empty image');
      } catch (err) {
        await this.paragraph(`이미지 불러오기 실패: ${label}`,{size:15,color:COLORS.red});
        return;
      }
      const maxWidth=PAGE_WIDTH-MARGIN*2-30;
      const w=Math.min(maxWidth,img.naturalWidth*1.5);
      const scale=Math.min(1,maxHeight/(img.naturalHeight*w/img.naturalWidth));
      const dw=w*scale, dh=img.naturalHeight*dw/img.naturalWidth;
      await this.ensure(dh+49);
      await this.paragraph(label,{size:15,color:COLORS.muted,lineHeight:23,after:5});
      await this.ensure(dh+11);
      this.ctx.fillStyle=COLORS.pale;
      this.ctx.fillRect(MARGIN,this.y,dw+10,dh+10);
      this.ctx.drawImage(img,MARGIN+5,this.y+5,dw,dh);
      this.y += dh+20;
      img.src='';
    }
    async questionStart(item, index, count) {
      if (this.canvas) await this.startPage();
      else await this.startPage();
      this.question = `${item.teacher||'교수님'} · ${item.label||index + 1}`;
      await this.paragraph(`${item.teacher||'교수님'} 교수님  ·  ${item.label||index + 1}  ·  ${item.tag||''}  (${index+1}/${count})`,{
        size:19,weight:'800',color:COLORS.blue,lineHeight:30,after:14
      });
      await this.heading('문제');
      await this.paragraph(item.prompt||'지문이 없습니다.',{size:22,weight:'600',lineHeight:35,after:15});
      if (Array.isArray(item.figures)) {
        for (const figure of item.figures) await this.image(figure.src,figure.label||'문제 이미지',330);
      }
      if (Array.isArray(item.choices) && item.choices.length) {
        await this.heading('선택지');
        for (const choice of item.choices) {
          await this.box(`${choice.symbol||''}  ${choice.text||''}${choice.correct?'   ✓ 정답':''}`,{
            background:choice.correct?COLORS.greenPale:COLORS.pale,
            color:COLORS.ink, accent:choice.correct?COLORS.green:null,
            size:19,lineHeight:28
          });
        }
      }
      await this.gap(9);
      await this.box(`정답: ${item.answer||'미확정'}       내 답안: ${item.picked||'미제출'}`,{
        background:COLORS.greenPale,accent:COLORS.green,size:20,weight:'700',lineHeight:31
      });
      await this.heading('해설 및 근거');
      await this.paragraph(item.explanation||'등록된 해설이 없습니다.',{size:19,lineHeight:30,after:10});
      if (Array.isArray(item.reasons) && item.reasons.length) {
        await this.heading('선택지별 해설');
        for (const reason of item.reasons) {
          await this.paragraph(`${reason.symbol}  ${reason.text}`,{size:18,lineHeight:28,after:12});
        }
      }
      if (Array.isArray(item.explanationImages) && item.explanationImages.length) {
        await this.heading('추가 해설 참고 이미지');
        for (const figure of item.explanationImages) {
          await this.image(figure.src, figure.label||'사용자 제공 참고 이미지', 470);
        }
      }
      if (item.evidence) {
        await this.heading('강의안 근거');
        await this.paragraph(item.evidence.label||'',{size:16,color:COLORS.muted,lineHeight:24,after:5});
        if (item.evidence.src) await this.image(item.evidence.src,'강의안 캡처',450);
      }
    }
    async finish() {
      if (this.canvas) {
        await this.writer.addCanvas(this.canvas);
        this.canvas.width = 0;
        this.canvas = null;
      }
    }
  }

  async function generate({title,modeLabel,items,onProgress}) {
    if (!Array.isArray(items) || !items.length) throw new Error('PDF로 저장할 문제를 찾지 못했습니다.');
    const writer=new PdfFile();
    const painter=new PdfPainter(writer,title,modeLabel);
    for (let i=0; i<items.length; i++) {
      await painter.questionStart(items[i],i,items.length);
      if (typeof onProgress==='function') onProgress(i+1,items.length);
      // Make sure the iPad has time to repaint progress and release resources.
      if(i%2===0) await tick();
    }
    await painter.finish();
    return {blob:writer.build(),pages:writer.images.length};
  }

  window.HeonPdfExport = Object.freeze({generate});
})();
