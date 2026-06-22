import type { CliId } from './terminal';

export type ThemePreference = 'light' | 'system' | 'dark';
export type LanguagePreference = 'system' | 'en' | 'zh-CN';

export interface CliBinding {
  command: string;
  args: string;
}

export type CliBindings = Partial<Record<CliId, CliBinding>>;

export interface AppSettings {
  theme: ThemePreference;
  language: LanguagePreference;
  nativeMaterial: boolean;
  terminalFontSize: number;
  defaultProfileId: CliId;
  cliBindings: CliBindings;
  confirmClose: boolean;
  openLinksExternally: boolean;
  desktopPet: boolean;
  desktopPetAssetPath?: string;
}

export const defaultCliBindings: CliBindings = {
  shell: {
    command: '',
    args: ''
  },
  opencode: {
    command: 'opencode',
    args: ''
  },
  codex: {
    command: 'codex',
    args: ''
  },
  antigtravaty: {
    command: 'antigtravaty',
    args: ''
  },
  antigravity: {
    command: 'antigravity',
    args: ''
  },
  claude: {
    command: 'claude',
    args: ''
  },
  kimi: {
    command: 'kimi',
    args: ''
  }
};

export const defaultSettings: AppSettings = {
  theme: 'light',
  language: 'system',
  nativeMaterial: true,
  terminalFontSize: 14,
  defaultProfileId: 'shell',
  cliBindings: defaultCliBindings,
  confirmClose: true,
  openLinksExternally: true,
  desktopPet: true,
  desktopPetAssetPath: undefined
};
