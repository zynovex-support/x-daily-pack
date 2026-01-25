/**
 * 命令执行器
 */
import { exec } from 'child_process';
import { config } from '../config.js';

export function executeCommand(command, options = {}) {
  return new Promise((resolve, reject) => {
    const timeout = options.timeout || config.commandTimeout;
    const cwd = options.cwd || config.projectRoot;

    exec(command, { cwd, timeout }, (error, stdout, stderr) => {
      if (error) {
        reject({ error, stderr: stderr || error.message });
        return;
      }

      let output = stdout || stderr || '(no output)';
      if (output.length > config.maxOutputLength) {
        output = output.slice(0, config.maxOutputLength) + '\n... (truncated)';
      }

      resolve(output.trim());
    });
  });
}
