import 'dotenv/config';

const required = (key: string): string => {
  const value = process.env[key];
  if (!value) throw new Error(`Missing required env var: ${key}`);
  return value;
};

const optional = (key: string, fallback: string): string =>
  process.env[key] ?? fallback;

export const config = {
  port: Number(optional('PORT', '3001')),
  corsOrigin: optional('CORS_ORIGIN', 'http://localhost:5173'),
  nodeEnv: optional('NODE_ENV', 'development'),

  // 사내 LLM Gateway (OpenAI-compatible)
  openaiApiKey: process.env.OPENAI_API_KEY ?? '',
  openaiBaseUrl: optional(
    'OPENAI_BASE_URL',
    'https://ai-gateway.devinflab.com/v1',
  ),
  openaiModel: optional('OPENAI_MODEL', 'claude-4.5-sonnet'),

  // Body 생성 max_tokens (디버그/튜닝용)
  bodyMaxTokens: Number(optional('BODY_MAX_TOKENS', '5000')),
  bodyContinueMaxTokens: Number(optional('BODY_CONTINUE_MAX_TOKENS', '3000')),
};

export const requireLlmConfig = (): {
  apiKey: string;
  baseUrl: string;
  model: string;
} => ({
  apiKey: required('OPENAI_API_KEY'),
  baseUrl: required('OPENAI_BASE_URL'),
  model: config.openaiModel,
});

export { required, optional };
