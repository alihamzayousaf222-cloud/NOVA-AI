const localUrl = process.env.OLLAMA_URL || 'http://127.0.0.1:11434';
const localModel = process.env.OLLAMA_MODEL || 'llama3.2';

const cloudUrl = process.env.OLLAMA_CLOUD_URL || 'https://ollama.com';
const cloudModel = process.env.OLLAMA_CLOUD_MODEL || 'gemma4:31b';

function useCloud() {
  return Boolean(process.env.OLLAMA_API_KEY);
}

function systemPrompt(fileContext = '') {
  return `You are NOVA AI, a helpful school and general-purpose AI assistant.
Default to clear English.
Do not use Hindi or Devanagari unless the user explicitly asks for it.
Be accurate, practical and honest about uncertainty.
For school questions, explain concepts clearly and use an appropriate academic style.
If file context is supplied, use it as supporting context and do not invent information that is not there.
${fileContext ? `\nFILE CONTEXT:\n${fileContext}` : ''}`;
}

export async function ollamaStatus() {
  if (useCloud()) {
    try {
      const r = await fetch(`${cloudUrl}/api/tags`, {
        headers: {
          Authorization: `Bearer ${process.env.OLLAMA_API_KEY}`
        }
      });

      if (!r.ok) {
        return {
          connected: false,
          mode: 'cloud',
          model: process.env.OLLAMA_CLOUD_MODEL || cloudModel
        };
      }

      return {
        connected: true,
        mode: 'cloud',
        model: process.env.OLLAMA_CLOUD_MODEL || cloudModel
      };
    } catch {
      return {
        connected: false,
        mode: 'cloud',
        model: process.env.OLLAMA_CLOUD_MODEL || cloudModel
      };
    }
  }

  try {
    const r = await fetch(`${localUrl}/api/tags`);

    if (!r.ok) {
      return {
        connected: false,
        mode: 'local',
        model: localModel
      };
    }

    const data = await r.json();

    return {
      connected: true,
      mode: 'local',
      model: localModel,
      models: (data.models || []).map(x => x.name)
    };
  } catch {
    return {
      connected: false,
      mode: 'local',
      model: localModel
    };
  }
}

export async function askOllama(messages, fileContext = '') {
  const system = systemPrompt(fileContext);

  const body = {
    model: useCloud() ? cloudModel : localModel,
    stream: false,
    messages: [
      { role: 'system', content: system },
      ...messages.map(m => ({
        role: m.role,
        content: m.content
      }))
    ]
  };

  const headers = {
    'Content-Type': 'application/json'
  };

  let endpoint;

  if (useCloud()) {
    endpoint = `${cloudUrl}/api/chat`;
    headers.Authorization = `Bearer ${process.env.OLLAMA_API_KEY}`;
  } else {
    endpoint = `${localUrl}/api/chat`;
  }

  const r = await fetch(endpoint, {
    method: 'POST',
    headers,
    body: JSON.stringify(body)
  });

  if (!r.ok) {
    const text = await r.text();

    throw new Error(
      `Ollama request failed (${r.status}): ${text.slice(0, 300)}`
    );
  }

  const data = await r.json();

  return data.message?.content || 'I could not generate a response.';
}