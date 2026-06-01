import MarkdownIt from 'markdown-it';
import puppeteer from 'puppeteer';

const mdRenderer = new MarkdownIt({
  html: false,
  linkify: true,
  breaks: false,
  typographer: false,
});

// 화면 .markdown-body 스타일을 PDF에 그대로 임베드 (외형 일치 보장)
const PDF_STYLES = `
  @page { size: A4; margin: 20mm 15mm; }
  body {
    font-family: 'Apple SD Gothic Neo', 'Malgun Gothic', '맑은 고딕',
                 system-ui, -apple-system, sans-serif;
    line-height: 1.6;
    color: #1f2937;
    font-size: 11pt;
  }
  h1 { font-size: 1.5rem; font-weight: 700; margin: 1.25rem 0 0.5rem; color: #111827; }
  h1:first-child { margin-top: 0; }
  h2 { font-size: 1.2rem; font-weight: 600; margin: 1rem 0 0.5rem; color: #111827; }
  h3 { font-size: 1.05rem; font-weight: 600; margin: 0.875rem 0 0.4rem; color: #111827; }
  h4 { font-size: 1rem; font-weight: 600; margin: 0.75rem 0 0.4rem; color: #1f2937; }
  p { margin: 0.5rem 0; }
  strong { font-weight: 700; color: #111827; }
  em { font-style: italic; }
  ul { padding-left: 1.25rem; margin: 0.5rem 0; list-style: disc; }
  ol { padding-left: 1.25rem; margin: 0.5rem 0; list-style: decimal; }
  li { margin: 0.125rem 0; }
  li > ul, li > ol { margin: 0.125rem 0; }
  blockquote {
    border-left: 3px solid #d1d5db;
    padding-left: 0.75rem;
    margin: 0.75rem 0;
    color: #4b5563;
  }
  code {
    font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
    font-size: 0.875em;
    background: #f3f4f6;
    padding: 0.1em 0.3em;
    border-radius: 0.2rem;
  }
  pre {
    background: #f3f4f6;
    padding: 0.75rem;
    border-radius: 0.375rem;
    overflow-x: auto;
    margin: 0.75rem 0;
    font-size: 0.85em;
  }
  pre code { background: transparent; padding: 0; }
  a { color: #2563eb; text-decoration: underline; }
  hr { border: 0; border-top: 1px solid #e5e7eb; margin: 1rem 0; }
  table {
    border-collapse: collapse;
    margin: 0.75rem 0;
    font-size: 0.875rem;
    width: 100%;
  }
  th, td {
    border: 1px solid #d1d5db;
    padding: 0.4rem 0.6rem;
    text-align: left;
    vertical-align: top;
  }
  th { background: #f9fafb; font-weight: 600; }
`;

export async function markdownToPdf(markdown: string): Promise<Buffer> {
  const htmlBody = mdRenderer.render(markdown);
  const html = `<!doctype html>
<html lang="ko">
<head>
  <meta charset="UTF-8">
  <title>사업계획서</title>
  <style>${PDF_STYLES}</style>
</head>
<body>${htmlBody}</body>
</html>`;

  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });
  try {
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: 'networkidle0' });
    const pdf = await page.pdf({
      format: 'A4',
      printBackground: true,
      margin: { top: '20mm', right: '15mm', bottom: '20mm', left: '15mm' },
    });
    return Buffer.from(pdf);
  } finally {
    await browser.close();
  }
}
