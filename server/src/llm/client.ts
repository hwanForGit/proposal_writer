import OpenAI from 'openai';
import { requireLlmConfig } from '../config.js';

let _client: OpenAI | null = null;
let _resolvedModel: string | null = null;

const buildClient = (): { client: OpenAI; model: string } => {
  const { apiKey, baseUrl, model } = requireLlmConfig();
  if (!_client) {
    _client = new OpenAI({ apiKey, baseURL: baseUrl });
    _resolvedModel = model;
  }
  return { client: _client, model: _resolvedModel ?? model };
};

export const getLlmClient = (): { client: OpenAI; model: string } =>
  buildClient();
