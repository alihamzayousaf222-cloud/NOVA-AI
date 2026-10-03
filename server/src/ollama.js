export async function ollamaStatus() {
  const url = process.env.OLLAMA_URL || 'http://127.0.0.1:11434';
  try {
    const r = await fetch(`${url}/api/tags`);
    if (!r.ok) return { connected: false, model: process.env.OLLAMA_MODEL || 'llama3.2' };
    const data = await r.json();
    const model = process.env.OLLAMA_MODEL || 'llama3.2';
    return { connected: true, model, models: (data.models || []).map(x => x.name) };
  } catch {
    return { connected: false, model: process.env.OLLAMA_MODEL || 'llama3.2' };
  }
}

export async function askOllama(messages, fileContext = '') {
  const url = process.env.OLLAMA_URL || 'http://127.0.0.1:11434';
  const model = process.env.OLLAMA_MODEL || 'llama3.2';
  const system = `You are NOVA AI, a helpful school and general-purpose AI assistant. Default to clear English. Do not use Hindi or Devanagari unless the user explicitly asks for it. Be accurate, practical and honest about uncertainty. For school questions, explain concepts clearly and use an appropriate academic style. If file context is supplied, use it as supporting context and do not invent information that is not there.\n${fileContext ? `FILE CONTEXT:\n${fileContext}` : ''}`;
  const body = { model, stream: false, messages: [{ role: 'system', content: system }, ...messages.map(m => ({ role: m.role, content: m.content }))] };
  const r = await fetch(`${url}/api/chat`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  if (!r.ok) {
    const text = await r.text();
    throw new Error(`Ollama request failed (${r.status}): ${text.slice(0, 300)}`);
  }
  const data = await r.json();
  return data.message?.content || 'I could not generate a response.';
}
