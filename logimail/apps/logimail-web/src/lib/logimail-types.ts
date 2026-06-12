export type StatusTone = 'success' | 'warning' | 'danger' | 'info' | 'neutral';

export type ShellStatusItem = {
  label: string;
  value: string;
  tone: StatusTone;
};
