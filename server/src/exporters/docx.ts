import { spawn } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import JSZip from 'jszip';

// pandoc이 만든 docx의 스타일(글씨 크기·간격)을 사업계획서 기준으로 후처리.
//   대분류(H3)=15pt, 중분류(H4)=13pt, 소분류(H5)=11pt, 본문(기본)=10pt. (sz = 0.5pt 단위)
//   헤딩 앞 간격을 키워 대/중/소분류 묶음이 한 줄씩 띄워지도록 함.
//   파싱 실패 등 어떤 문제든 원본 docx를 그대로 반환(내보내기 자체는 깨지지 않게).
function patchDocxStylesXml(xml: string): string {
  // 본문 기본 글씨 10pt (docDefaults sz 24→20)
  let out = xml.replace(/<w:rPrDefault>[\s\S]*?<\/w:rPrDefault>/, (blk) =>
    blk
      .replace(/<w:sz w:val="\d+"\s*\/>/, '<w:sz w:val="20" />')
      .replace(/<w:szCs w:val="\d+"\s*\/>/, '<w:szCs w:val="20" />'),
  );
  const setStyle = (id: string, sz: number, before: number) => {
    const re = new RegExp(
      `<w:style [^>]*w:styleId="${id}"[^>]*>[\\s\\S]*?<\\/w:style>`,
    );
    out = out.replace(re, (block) => {
      let b = block;
      if (/<w:sz w:val="\d+"\s*\/>/.test(b)) {
        b = b
          .replace(/<w:sz w:val="\d+"\s*\/>/, `<w:sz w:val="${sz}" />`)
          .replace(/<w:szCs w:val="\d+"\s*\/>/, `<w:szCs w:val="${sz}" />`);
      } else if (/<\/w:rPr>/.test(b)) {
        // sz가 없으면 rPr 끝에 추가(색상 뒤 → OOXML 순서 유효)
        b = b.replace(
          /<\/w:rPr>/,
          `<w:sz w:val="${sz}" /><w:szCs w:val="${sz}" /></w:rPr>`,
        );
      }
      // 헤딩 앞 간격(묶음 사이 한 줄 띄움 효과)
      b = b.replace(
        /<w:spacing ([^>]*?)w:before="\d+"([^>]*?)\/>/,
        `<w:spacing $1w:before="${before}"$2/>`,
      );
      return b;
    });
  };
  setStyle('Heading3', 30, 240); // 대분류 15pt
  setStyle('Heading4', 26, 200); // 중분류 13pt
  setStyle('Heading5', 22, 160); // 소분류 11pt
  return out;
}

async function applyDocxStyles(buf: Buffer): Promise<Buffer> {
  try {
    const zip = await JSZip.loadAsync(buf);
    const stylesFile = zip.file('word/styles.xml');
    if (!stylesFile) return buf;
    const xml = await stylesFile.async('string');
    zip.file('word/styles.xml', patchDocxStylesXml(xml));
    return await zip.generateAsync({ type: 'nodebuffer' });
  } catch {
    return buf; // 후처리 실패 시 원본 그대로 (내보내기는 정상 동작)
  }
}

// 표 구분선(|---|---|)의 대시 개수를 모든 열에서 균등하게 맞춘다.
// LLM이 내용 길이에 맞춰 대시를 불균등하게 쓰면(예: |:--|:------------|:--|)
// pandoc이 그 비율대로 좁은 열을 1글자 폭으로 고정 → 한글이 세로로 붕괴.
// 대시를 균등화하면 pandoc이 균등 고정폭(tblLayout fixed + tblW pct5000)으로
// 만들어 Word가 autofit하지 않고 지정 폭 안에서 정상 줄바꿈한다. (정렬 콜론은 보존)
export function normalizeTableSeparators(md: string): string {
  let inFence = false;
  return md
    .split('\n')
    .map((line) => {
      const t = line.trim();
      if (/^(```|~~~)/.test(t)) {
        inFence = !inFence;
        return line;
      }
      if (inFence) return line;
      // 분리행: 파이프가 있고, 대시가 있고, 파이프/대시/콜론/공백만으로 구성
      if (!t.includes('|') || !t.includes('-')) return line;
      if (!/^[\s|:-]+$/.test(t)) return line;
      return line
        .split('|')
        .map((p) => {
          const c = p.trim();
          if (c === '' || !/^:?-{1,}:?$/.test(c)) return p; // 외곽 파이프 등 보존
          const left = c.startsWith(':');
          const right = c.endsWith(':');
          return ` ${left ? ':' : ''}---${right ? ':' : ''} `;
        })
        .join('|');
    })
    .join('\n');
}

export async function markdownToDocx(markdown: string): Promise<Buffer> {
  const dir = await mkdtemp(join(tmpdir(), 'pw-docx-'));
  const mdPath = join(dir, 'input.md');
  const docxPath = join(dir, 'output.docx');
  try {
    await writeFile(mdPath, normalizeTableSeparators(markdown), 'utf-8');

    await new Promise<void>((resolve, reject) => {
      const proc = spawn('pandoc', [
        mdPath,
        '-f',
        // yaml_metadata_block 비활성화: 본문 중간의 '---' 구분선을 YAML 메타데이터로
        // 오해해 파싱 실패(예: 다음 줄의 **/* 를 YAML alias로 해석)하는 것을 방지.
        'markdown-yaml_metadata_block+pipe_tables+grid_tables+autolink_bare_uris+task_lists',
        '-t',
        'docx',
        '-o',
        docxPath,
        '--standalone',
        // 짧은 표까지 강제로 고정폭(tblLayout fixed + tblW pct5000)으로 만들어
        // Word의 CJK autofit 붕괴(한글 열이 1글자로 줄어듦)를 차단. 대시 균등화
        // (normalizeTableSeparators)와 함께 적용해야 모든 열이 균등 폭이 된다.
        '--columns=1',
      ]);
      let stderr = '';
      proc.stderr.on('data', (d) => {
        stderr += d.toString();
      });
      proc.on('error', (err) => {
        const e = err as NodeJS.ErrnoException;
        if (e.code === 'ENOENT') {
          reject(new Error('PANDOC_NOT_INSTALLED'));
        } else {
          reject(err);
        }
      });
      proc.on('close', (code) => {
        if (code === 0) resolve();
        else reject(new Error(`pandoc exited ${code}: ${stderr.slice(0, 500)}`));
      });
    });

    return await applyDocxStyles(await readFile(docxPath));
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}
