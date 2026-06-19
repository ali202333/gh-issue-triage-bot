const { z } = require('zod');

const TriageResponseSchema = z.object({
  suggestedLabels: z.array(z.string()).describe("Target categories targeting issue scope. e.g. ['bug', 'auth', 'ui']"),
  isIncomplete: z.boolean().describe("Flag true if reproduction parameters or runtime error logs are completely missing from body context"),
  politeCommentText: z.string().describe("Constructed polite markdown message addressing missing elements back to user. Remain empty string if context holds proper integrity."),
  priority: z.enum(['low', 'medium', 'high', 'critical']).describe("Evaluated critical severity metric for sorting priorities")
});

module.exports = { TriageResponseSchema };
