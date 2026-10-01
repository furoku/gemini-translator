/* global estimateCostUsdForModelChars, refreshUsageStats */

const CURRENT_PRICING = Object.freeze({
  'gemini-3.5-flash-lite': { input: 0.30, output: 2.50 },
  'gemini-3.1-flash-lite': { input: 0.25, output: 1.50 },
  'gemini-2.5-flash-lite': { input: 0.10, output: 0.40 },
  'gemini-2.0-flash-lite': { input: 0.075, output: 0.30 },
  'gemini-2.0-flash': { input: 0.10, output: 0.40 }
});

estimateCostUsdForModelChars = function estimateCurrentCost(modelId, inputChars, outputChars) {
  const prices = CURRENT_PRICING[modelId] || CURRENT_PRICING['gemini-3.5-flash-lite'];
  const charsPerToken = 4;
  const inputCost = (Number(inputChars || 0) / charsPerToken / 1_000_000) * prices.input;
  const outputCost = (Number(outputChars || 0) / charsPerToken / 1_000_000) * prices.output;
  return inputCost + outputCost;
};

refreshUsageStats().catch(() => {});
