export interface TeamContext {
  teamName: string;
  agentName: string;
}

// Read team context from environment variables set by Claude Code Agent Teams.
// CLAUDE_CODE_AGENT_ID format: "name@teamName"
export function getTeamContext(): TeamContext | undefined {
  const teamName = process.env.CLAUDE_CODE_TEAM_NAME;
  const agentId = process.env.CLAUDE_CODE_AGENT_ID;

  if (!teamName || !agentId) return undefined;

  const atIndex = agentId.indexOf('@');
  const agentName = atIndex !== -1 ? agentId.slice(0, atIndex) : agentId;

  return { teamName, agentName };
}
