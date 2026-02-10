import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { getTeamContext } from '../src/utils/team.js';

describe('getTeamContext', () => {
  let originalEnv: NodeJS.ProcessEnv;

  beforeEach(() => {
    originalEnv = { ...process.env };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('should return undefined when no env vars are set', () => {
    delete process.env.CLAUDE_CODE_TEAM_NAME;
    delete process.env.CLAUDE_CODE_AGENT_ID;
    expect(getTeamContext()).toBeUndefined();
  });

  it('should return undefined when only CLAUDE_CODE_TEAM_NAME is set', () => {
    process.env.CLAUDE_CODE_TEAM_NAME = 'cleanup';
    delete process.env.CLAUDE_CODE_AGENT_ID;
    expect(getTeamContext()).toBeUndefined();
  });

  it('should return undefined when only CLAUDE_CODE_AGENT_ID is set', () => {
    delete process.env.CLAUDE_CODE_TEAM_NAME;
    process.env.CLAUDE_CODE_AGENT_ID = 'redis-removal@cleanup';
    expect(getTeamContext()).toBeUndefined();
  });

  it('should parse name@team format correctly', () => {
    process.env.CLAUDE_CODE_TEAM_NAME = 'cleanup';
    process.env.CLAUDE_CODE_AGENT_ID = 'redis-removal@cleanup';
    expect(getTeamContext()).toEqual({
      teamName: 'cleanup',
      agentName: 'redis-removal',
    });
  });

  it('should handle agent ID without @ separator', () => {
    process.env.CLAUDE_CODE_TEAM_NAME = 'my-team';
    process.env.CLAUDE_CODE_AGENT_ID = 'solo-agent';
    expect(getTeamContext()).toEqual({
      teamName: 'my-team',
      agentName: 'solo-agent',
    });
  });

  it('should handle team-lead agent', () => {
    process.env.CLAUDE_CODE_TEAM_NAME = 'cleanup';
    process.env.CLAUDE_CODE_AGENT_ID = 'team-lead@cleanup';
    expect(getTeamContext()).toEqual({
      teamName: 'cleanup',
      agentName: 'team-lead',
    });
  });

  it('should handle agent ID with multiple @ signs', () => {
    process.env.CLAUDE_CODE_TEAM_NAME = 'test';
    process.env.CLAUDE_CODE_AGENT_ID = 'agent@name@test';
    expect(getTeamContext()).toEqual({
      teamName: 'test',
      agentName: 'agent',
    });
  });

  it('should return undefined for empty string env vars', () => {
    process.env.CLAUDE_CODE_TEAM_NAME = '';
    process.env.CLAUDE_CODE_AGENT_ID = 'agent@team';
    expect(getTeamContext()).toBeUndefined();
  });
});
