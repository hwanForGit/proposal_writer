import { spawn } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

export async function markdownToDocx(markdown: string): Promise<Buffer> {
  const dir = await mkdtemp(join(tmpdir(), 'pw-docx-'));
  const mdPath = join(dir, 'input.md');
  const docxPath = join(dir, 'output.docx');
  try {
    await writeFile(mdPath, markdown, 'utf-8');

    await new Promise<void>((resolve, reject) => {
      const proc = spawn('pandoc', [
        mdPath,
        '-f',
        'markdown+pipe_tables+grid_tables+autolink_bare_uris+task_lists',
        '-t',
        'docx',
        '-o',
        docxPath,
        '--standalone',
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
