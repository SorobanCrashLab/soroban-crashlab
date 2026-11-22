'use client';

import { useEffect } from 'react';
import { registerCommand } from './plugins';
import type { CommandEntry } from './registry';

/** Register a command for the lifetime of the calling feature component. */
export function useCommandRegistration(command: CommandEntry): void {
  useEffect(() => registerCommand(command), [command]);
}
