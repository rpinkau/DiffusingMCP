export interface GenArgs {
  prompt: string;
  model: string;
  negative_prompt?: string;
  width?: number;
  height?: number;
  steps?: number;
  seed?: number;
}

export interface BackendMessage {
  status: 'progress' | 'loading' | 'success' | 'error' | 'ready' | 'info';
  text?: string;
  value?: number;
  path?: string;
  seed?: number;
  message?: string;
}

export interface GenResult extends BackendMessage {
  base64?: string;
}
