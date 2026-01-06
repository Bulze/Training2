import { createChatCompletion as requestOpenAIGPTChat } from './_impl/sdk.gen';

// please read type definitions: src/sdk/api-clients/688a0b64dc79a2533460892c/_impl/types.gen.ts
// to learn about type and default values
export type { CreateChatCompletionData, CreateChatCompletionErrors, CreateChatCompletionResponses } from './_impl/types.gen';

// Type definition of request function:
// async function requestOpenAIGPTChat(opts: CreateChatCompletionData): Promise<{
//     error?: CreateChatCompletionErrors[keyof CreateChatCompletionErrors],
//     data?: CreateChatCompletionResponses[keyof CreateChatCompletionResponses],
//     request: Request,
//     response: Response
// }>
export { requestOpenAIGPTChat };