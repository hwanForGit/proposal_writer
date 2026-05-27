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
  // Phase 1 M7 시점에 require로 승격
  anthropicApiKey: process.env.ANTHROPIC_API_KEY ?? '',
};

export { required, optional };
