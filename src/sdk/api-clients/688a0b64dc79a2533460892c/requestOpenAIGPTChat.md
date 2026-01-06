## OpenAIGPTChat

Add OpenAI GPT 4.1 for text-based AI to your app. Enable natural conversation, answers, and content generation instantly with no setup, accounts, or API keys required.

```typescript
// OpenAIGPTChat - id: 688a0b64dc79a2533460892c

// please read type definitions: src/sdk/api-clients/688a0b64dc79a2533460892c/_impl/types.gen.ts
// to learn about type and default values
import type { CreateChatCompletionData, CreateChatCompletionErrors, CreateChatCompletionResponses } from '@/sdk/api-clients/688a0b64dc79a2533460892c/requestOpenAIGPTChat';

// Type definition of request function:
// async function requestOpenAIGPTChat(opts: CreateChatCompletionData): Promise<{
//     error?: CreateChatCompletionErrors[keyof CreateChatCompletionErrors],
//     data?: CreateChatCompletionResponses[keyof CreateChatCompletionResponses],
//     request: Request,
//     response: Response
// }>
import { requestOpenAIGPTChat } from '@/sdk/api-clients/688a0b64dc79a2533460892c/requestOpenAIGPTChat';
```