export interface FileNode {
  name: string;
  path: string;
  is_dir: boolean;
  children?: FileNode[];
}

export type LlmProvider = 'local' | 'openai' | 'claude' | 'gemini';

export interface LlmConfig {
  provider: LlmProvider;
  endpoint: string;
  apiKey: string;
  model: string;
}

export interface DragDropPayload {
  paths: string[];
  position?: { x: number; y: number };
}

export type OpenFilePayload = string[];

export interface ConfirmParams {
  title: string;
  message: string;
  actionLabel?: string;
  onConfirm?: () => void | Promise<void>;
  onDiscard?: () => void;
}
