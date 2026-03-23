import { z } from 'zod';

export const GenArgsSchema = z.object({
  prompt: z.string().min(1).max(2000),
  model: z.string(),
  negative_prompt: z.string().optional(),
  width: z.number().int().min(64).max(2048).optional(),
  height: z.number().int().min(64).max(2048).optional(),
  steps: z.number().int().min(1).max(100).optional(),
  seed: z.number().int().optional(),
  includeMetadata: z.boolean().optional().default(false),
});

export interface GenArgs extends z.infer<typeof GenArgsSchema> {}

export interface BackendMessage {
  status: 'progress' | 'loading' | 'success' | 'error' | 'ready' | 'info' | 'starting' | 'preview' | 'busy';
  text?: string;
  value?: number;
  image?: string;
  step?: number;
  total?: number;
  path?: string;
  seed?: number;
  message?: string;
}

export interface GenResult extends BackendMessage {
  base64?: string;
}

export interface ImageInfo {
  command: string;
  path: string;
  prompt: string;
  seed: string | number;
  model: string;
  date: string;
  timestamp: number;
  base64?: string;
}

export interface ScanResult {
  status: 'success' | 'error';
  images: ImageInfo[];
  message?: string;
}
