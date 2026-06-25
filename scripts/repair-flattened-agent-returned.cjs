const fs = require('node:fs');
const path = require('node:path');

const storePath = process.argv[2] || path.join(process.env.APPDATA || '', 'tui-ai-terminal', 'conversations.json');
const store = JSON.parse(fs.readFileSync(storePath, 'utf8'));

function findReferencedConversation(title) {
  return (store.conversations || []).find((conversation) => conversation.title === title);
}

function hasFlattenedTable(content) {
  return /\|\s*:?-{3,}:?\s*\|/u.test(content) && !/\n\|[^\n]+\|\n\|/u.test(content);
}

let repaired = 0;
for (const conversation of store.conversations || []) {
  const messages = conversation.messages || [];
  for (const message of messages) {
    if (message.role !== 'system' || typeof message.content !== 'string') continue;
    const match = /^#(.+?) \((.+?)\) returned:\n\n([\s\S]*)$/u.exec(message.content);
    if (!match || !hasFlattenedTable(message.content)) continue;

    const target = findReferencedConversation(match[1]);
    const output = (target?.runs || [])
      .slice()
      .reverse()
      .find((run) => typeof run.output === 'string' && run.output.includes('|') && run.output.includes('\n|'))?.output;
    if (!output) continue;

    message.content = `#${match[1]} (${match[2]}) returned:\n\n${output.trim()}`;
    repaired += 1;
  }
}

if (repaired) {
  fs.writeFileSync(storePath, `${JSON.stringify(store, null, 2)}\n`, 'utf8');
}

console.log(`Repaired ${repaired} flattened returned message(s).`);
