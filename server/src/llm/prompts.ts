import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ApiError } from '../middleware/error-handler.js';

const __filename = fileURLToPath(import.meta.url);
const PROMPTS_DIR = resolve(dirname(__filename), '../../../prompts');

const PLACEHOLDER = /\{\{(\w+)\}\}/g;

export async function loadPrompt(name: string): Promise<string> {
  const path = resolve(PROMPTS_DIR, `${name}.md`);
  try {
    return await readFile(path, 'utf-8');
  } catch (err) {
    throw new ApiError(
      500,
      'PROMPT_LOAD_FAILED',
      `프롬프트 파일을 읽을 수 없습니다: ${name}.md`,
      { path, cause: err instanceof Error ? err.message : String(err) },
    );
  }
}

export function renderPrompt(
  template: string,
  vars: Record<string, string>,
): { rendered: string; unresolved: string[] } {
  const unresolved: string[] = [];
  const rendered = template.replace(PLACEHOLDER, (match, key: string) => {
    if (key in vars) return vars[key]!;
    unresolved.push(key);
    return match;
  });
  return { rendered, unresolved };
}

export async function loadAndRenderPrompt(
  name: string,
  vars: Record<string, string>,
): Promise<string> {
  const template = await loadPrompt(name);
  const { rendered, unresolved } = renderPrompt(template, vars);
  if (unresolved.length > 0) {
    throw new ApiError(
      500,
      'PROMPT_VARS_MISSING',
      `프롬프트 변수가 채워지지 않았습니다: ${[...new Set(unresolved)].join(', ')}`,
      { promptName: name, missing: [...new Set(unresolved)] },
    );
  }
  return rendered;
}

export { PROMPTS_DIR };
