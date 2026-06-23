import type { CliId } from './terminal';
import type { AgentSkill } from './agent';

const commonSkills: AgentSkill[] = [
  {
    id: 'review',
    label: 'Review',
    command: '/review',
    description: 'Find bugs, regressions, risks, and missing tests.',
    prompt: 'Use the review skill. Prioritize bugs, regressions, risks, and missing tests. Lead with findings and include file/line references when possible.\n\n'
  },
  {
    id: 'fix',
    label: 'Fix',
    command: '/fix',
    description: 'Implement a focused fix and verify it.',
    prompt: 'Use the fix skill. Implement a focused fix, keep the change scoped, and verify it with the most relevant checks.\n\n'
  },
  {
    id: 'explain',
    label: 'Explain',
    command: '/explain',
    description: 'Explain code or behavior clearly.',
    prompt: 'Use the explain skill. Explain the relevant code or behavior clearly, with references to files when useful.\n\n'
  },
  {
    id: 'test',
    label: 'Test',
    command: '/test',
    description: 'Add or update focused tests.',
    prompt: 'Use the test skill. Add or update focused tests for the behavior in question, then run the relevant checks.\n\n'
  },
  {
    id: 'docs',
    label: 'Docs',
    command: '/docs',
    description: 'Write or update documentation.',
    prompt: 'Use the docs skill. Write or update concise documentation that matches the project style.\n\n'
  }
];

export const cliSkills: Record<CliId, AgentSkill[]> = {
  shell: [],
  codex: [
    ...commonSkills,
    {
      id: 'image',
      label: 'Image',
      command: '/image',
      description: 'Analyze attached or selected images.',
      prompt: 'Use the image skill. Analyze the attached image(s) and connect the observations to the task.\n\n'
    }
  ],
  opencode: commonSkills,
  claude: [
    ...commonSkills,
    {
      id: 'plan',
      label: 'Plan',
      command: '/plan',
      description: 'Break down an implementation approach before editing.',
      prompt: 'Use the planning skill. Break down the implementation approach, then proceed once the path is clear.\n\n'
    }
  ],
  kimi: commonSkills,
  antigravity: commonSkills,
  antigtravaty: commonSkills
};

export function getCliSkills(profileId: CliId): AgentSkill[] {
  return cliSkills[profileId] ?? commonSkills;
}
