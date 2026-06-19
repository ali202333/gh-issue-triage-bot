const { OpenAI } = require('openai');
const Anthropic = require('@anthropic-ai/sdk');
const crypto = require('crypto');
const { TriageResponseSchema } = require('./triageSchema');

const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY;

function decryptKey(encryptedText) {
  if (!encryptedText || !ENCRYPTION_KEY) return null;
  try {
    const [ivHex, encryptedHex, tagHex] = encryptedText.split(':');
    const decipher = crypto.createDecipheriv(
      'aes-256-gcm',
      Buffer.from(ENCRYPTION_KEY, 'hex'),
      Buffer.from(ivHex, 'hex')
    );
    decipher.setAuthTag(Buffer.from(tagHex, 'hex'));
    let decrypted = decipher.update(encryptedHex, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
  } catch (err) {
    console.error("Decryption failure:", err.message);
    return null;
  }
}

async function runAITriage({ title, body, repoRules, provider, encryptedApiKey }) {
  const apiKey = decryptKey(encryptedApiKey);
  if (!apiKey) throw new Error("Decryption failure or missing API key.");

  const systemInstructions = `
    You are an enterprise GitHub issue triage pipeline agent. 
    Analyze the payload and populate parameters adhering strictly to requested structural formats.
    
    Repository Custom Instructions:
    ${JSON.stringify(repoRules || [])}
  `;

  const userPayloadText = `Issue Title Context: ${title}\n\nMarkup Body Contents:\n${body}`;

  if (provider === 'openai') {
    const openai = new OpenAI({ apiKey });
    const completion = await openai.beta.chat.completions.parse({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: systemInstructions },
        { role: 'user', content: userPayloadText }
      ],
      response_format: { type: 'json_object' }
    });

    const parsedData = TriageResponseSchema.parse(JSON.parse(completion.choices[0].message.content));
    return { result: parsedData, tokensUsed: completion.usage?.total_tokens || 0 };
  }

  if (provider === 'anthropic') {
    const anthropic = new Anthropic({ apiKey });
    const response = await anthropic.messages.create({
      model: 'claude-3-5-haiku-20241022',
      max_tokens: 1200,
      messages: [
        { role: 'user', content: `${systemInstructions}\n\nTarget Payload:\n${userPayloadText}` }
      ],
      output_config: {
        format: {
          type: 'json_schema',
          schema: {
            type: 'object',
            properties: {
              suggestedLabels: { type: 'array', items: { type: 'string' } },
              isIncomplete: { type: 'boolean' },
              politeCommentText: { type: 'string' },
              priority: { type: 'string', enum: ['low', 'medium', 'high', 'critical'] }
            },
            required: ['suggestedLabels', 'isIncomplete', 'politeCommentText', 'priority'],
            additionalProperties: false
          }
        }
      }
    });

    const parsedData = TriageResponseSchema.parse(JSON.parse(response.content[0].text));
    return { result: parsedData, tokensUsed: (response.usage?.output_tokens || 0) + (response.usage?.input_tokens || 0) };
  }

  throw new Error(`Unsupported provider: ${provider}`);
}

module.exports = { runAITriage };
