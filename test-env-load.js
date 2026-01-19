require('dotenv').config();
const key = process.env.OPENAI_API_KEY;
console.log('Key exists:', !!key);
console.log('Key length:', key?.length || 0);
console.log('LLM_PROVIDER:', process.env.LLM_PROVIDER);
console.log('Valid key:', !!(key && key !== 'test-key' && key.length > 20));
