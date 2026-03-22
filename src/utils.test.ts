import { describe, it, expect, beforeEach, afterEach, spyOn } from 'bun:test';
import * as core from '@actions/core';
import {
  runCommand,
  getMentions,
  assertKeyword,
  extractUserPrompt,
  parseEnvVars,
} from './utils.js';

describe('utils', () => {
  describe('runCommand', () => {
    it('should execute a simple command successfully', () => {
      const result = runCommand(['echo', 'hello']);
      expect(result).toBe('hello');
    });

    it('should handle command with multiple arguments', () => {
      const result = runCommand(['echo', 'hello', 'world']);
      expect(result).toBe('hello world');
    });

    it('should throw error on non-zero exit status', () => {
      expect(() => runCommand(['false'])).toThrow();
    });

    it('should throw error with command name on failure', () => {
      try {
        runCommand(['ls', '/nonexistent-directory-xyz']);
        throw new Error('Should have thrown');
      } catch (e) {
        expect(e).toBeInstanceOf(Error);
        expect((e as Error).message).toContain('ls');
      }
    });

    it('should provide input to stdin', () => {
      const result = runCommand(['cat'], { input: 'test input' });
      expect(result).toBe('test input');
    });

    it('should pass custom environment variables', () => {
      const result = runCommand(['sh', '-c', 'echo $TEST_VAR'], undefined, {
        TEST_VAR: 'custom_value',
      });
      expect(result).toBe('custom_value');
    });

    it('should merge custom env with process env', () => {
      const result = runCommand(['sh', '-c', 'echo $PATH:$TEST_VAR'], undefined, {
        TEST_VAR: 'custom',
      });
      expect(result).toContain('custom');
      expect(result).toContain('/'); // PATH should exist
    });
  });

  describe('getMentions', () => {
    let getInputSpy: ReturnType<typeof spyOn>;

    beforeEach(() => {
      getInputSpy = spyOn(core, 'getInput');
    });

    afterEach(() => {
      getInputSpy.mockRestore();
    });

    it('should return default mention when no input is provided', () => {
      getInputSpy.mockReturnValue('');
      expect(getMentions()).toEqual(['/pi']);
    });

    it('should parse comma-separated mentions', () => {
      getInputSpy.mockReturnValue('/pi,@bot,/ai');
      expect(getMentions()).toEqual(['/pi', '@bot', '/ai']);
    });

    it('should trim whitespace from mentions', () => {
      getInputSpy.mockReturnValue(' /pi , @bot , /ai ');
      expect(getMentions()).toEqual(['/pi', '@bot', '/ai']);
    });

    it('should convert mentions to lowercase', () => {
      getInputSpy.mockReturnValue('/Pi,@Bot,/AI');
      expect(getMentions()).toEqual(['/pi', '@bot', '/ai']);
    });

    it('should handle single mention', () => {
      getInputSpy.mockReturnValue('/custom');
      expect(getMentions()).toEqual(['/custom']);
    });
  });

  describe('assertKeyword', () => {
    let getInputSpy: ReturnType<typeof spyOn>;
    let setFailedSpy: ReturnType<typeof spyOn>;

    beforeEach(() => {
      getInputSpy = spyOn(core, 'getInput').mockReturnValue('/pi');
      setFailedSpy = spyOn(core, 'setFailed').mockImplementation(() => {
        // Intentionally empty - we just want to track calls
      });
    });

    afterEach(() => {
      getInputSpy.mockRestore();
      setFailedSpy.mockRestore();
    });

    it('should not throw when comment contains mention', () => {
      expect(() => assertKeyword('/pi fix this bug')).not.toThrow();
    });

    it('should not throw when comment starts with mention', () => {
      expect(() => assertKeyword('/pi fix this bug')).not.toThrow();
    });

    it('should not throw when mention is in middle', () => {
      expect(() => assertKeyword('Can you /pi help me?')).not.toThrow();
    });

    it('should not throw when mention is at end', () => {
      expect(() => assertKeyword('Help me please /pi')).not.toThrow();
    });

    it('should throw when comment does not contain mention', () => {
      expect(() => assertKeyword('fix this bug')).toThrow();
    });

    it('should call setFailed when mention not found', () => {
      try {
        assertKeyword('fix this bug');
        throw new Error('Should have thrown');
      } catch {
        expect(setFailedSpy).toHaveBeenCalled();
      }
    });

    it('should handle multiple mentions', () => {
      getInputSpy.mockReturnValue('/pi,@bot');
      expect(() => assertKeyword('/pi help me')).not.toThrow();
      expect(() => assertKeyword('@bot help me')).not.toThrow();
    });

    it('should be case insensitive for mention', () => {
      expect(() => assertKeyword('/PI fix this')).not.toThrow();
    });
  });

  describe('extractUserPrompt', () => {
    let getInputSpy: ReturnType<typeof spyOn>;

    beforeEach(() => {
      getInputSpy = spyOn(core, 'getInput').mockReturnValue('/pi');
    });

    afterEach(() => {
      getInputSpy.mockRestore();
    });

    it('should extract prompt after mention', () => {
      const prompt = extractUserPrompt('/pi fix this bug');
      expect(prompt).toBe('fix this bug');
    });

    it('should return null for mention only', () => {
      const prompt = extractUserPrompt('/pi');
      expect(prompt).toBeNull();
    });

    it('should handle whitespace after mention', () => {
      const prompt = extractUserPrompt('/pi   fix this bug');
      expect(prompt).toBe('fix this bug');
    });

    it('should handle mention in middle of text', () => {
      const prompt = extractUserPrompt('Can you /pi help me?');
      expect(prompt).toBe('help me?');
    });

    it('should handle multiple mentions', () => {
      getInputSpy.mockReturnValue('/pi,@bot');
      const prompt1 = extractUserPrompt('/pi help');
      expect(prompt1).toBe('help');

      const prompt2 = extractUserPrompt('@bot help');
      expect(prompt2).toBe('help');
    });

    it('should return null if no mention found', () => {
      const prompt = extractUserPrompt('just a comment');
      expect(prompt).toBeNull();
    });
  });

  describe('parseEnvVars', () => {
    it('should parse single env var', () => {
      const envVars = parseEnvVars('API_KEY=secret123');
      expect(envVars).toEqual([{ key: 'API_KEY', value: 'secret123' }]);
    });

    it('should parse multiple env vars', () => {
      const envVars = parseEnvVars('API_KEY=secret123\nDEBUG=true');
      expect(envVars).toEqual([
        { key: 'API_KEY', value: 'secret123' },
        { key: 'DEBUG', value: 'true' },
      ]);
    });

    it('should handle empty input', () => {
      const envVars = parseEnvVars('');
      expect(envVars).toEqual([]);
    });

    it('should handle whitespace only', () => {
      const envVars = parseEnvVars('   ');
      expect(envVars).toEqual([]);
    });

    it('should trim whitespace', () => {
      const envVars = parseEnvVars('  API_KEY=secret123  \n  DEBUG=true  ');
      expect(envVars).toEqual([
        { key: 'API_KEY', value: 'secret123' },
        { key: 'DEBUG', value: 'true' },
      ]);
    });

    it('should filter lines without equals', () => {
      const envVars = parseEnvVars('API_KEY=secret123\nINVALID_LINE\nDEBUG=true');
      expect(envVars).toEqual([
        { key: 'API_KEY', value: 'secret123' },
        { key: 'DEBUG', value: 'true' },
      ]);
    });

    it('should handle values with spaces', () => {
      const envVars = parseEnvVars('MESSAGE=hello world');
      expect(envVars).toEqual([{ key: 'MESSAGE', value: 'hello world' }]);
    });

    it('should handle values with equals signs', () => {
      const envVars = parseEnvVars('URL=https://example.com?param=value');
      expect(envVars).toEqual([{ key: 'URL', value: 'https://example.com?param=value' }]);
    });

    it('should handle empty values', () => {
      const envVars = parseEnvVars('EMPTY=');
      expect(envVars).toEqual([{ key: 'EMPTY', value: '' }]);
    });

    it('should handle multi-line with blank lines', () => {
      const envVars = parseEnvVars('API_KEY=secret123\n\nDEBUG=true');
      expect(envVars).toEqual([
        { key: 'API_KEY', value: 'secret123' },
        { key: 'DEBUG', value: 'true' },
      ]);
    });
  });
});
