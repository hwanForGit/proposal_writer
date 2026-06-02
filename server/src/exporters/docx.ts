import { spawn } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

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

    return await readFile(docxPath);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}
