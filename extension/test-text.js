function shouldSkipByContent(text) {
    const s = String(text || '').trim();
    if (!s) return true;
    if (s.length < 8) return true;
    const stripped = s
        .replace(/https?:\/\/\S+/gi, ' ')
        .replace(/\b(?:[a-z0-9-]+\.)+[a-z]{2,}(?:\/\S*)/gi, ' ')
        .replace(/[@#]\w+/g, ' ')
        .replace(/[\s\u00A0]+/g, '');
    if (!stripped) return true;
    const letters = stripped.replace(/[^A-Za-z\u3040-\u30FF\u4E00-\u9FFF]/g, '');
    if (letters.length < 4) return true;
    return false;
}

const JAPANESE_REGEX = /[ぁ-んァ-ン]/;

const text = 'Some clarifications:\n\n> Yes, Anthropic (kind of) walked back the OAuth ban to not include the Agents SDK.\n> Their documentation STILL says the Agent SDK is banned from using OAuth\n> If the Agents SDK is in fact carved out, it doesn\'t come supported out of the box with the';

console.log('Text length:', text.length);
console.log('Should skip?', shouldSkipByContent(text));
console.log('Has Japanese?', JAPANESE_REGEX.test(text));
