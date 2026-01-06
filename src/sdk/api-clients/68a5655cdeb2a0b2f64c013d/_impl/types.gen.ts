// SDK exports these request functions:
//
//   /**
//    * Chat completion with image recognition
//    *
//    * Sends messages including images for analysis and receives JSON formatted responses
//    */
//
//   export function postV1AiZWwyutGgvEgWwzSaChatCompletions(opts: PostV1AiZWwyutGgvEgWwzSaChatCompletionsData): Promise<{
//     error?: PostV1AiZWwyutGgvEgWwzSaChatCompletionsErrors[keyof PostV1AiZWwyutGgvEgWwzSaChatCompletionsErrors],
//     data?: PostV1AiZWwyutGgvEgWwzSaChatCompletionsResponses[keyof PostV1AiZWwyutGgvEgWwzSaChatCompletionsResponses],
//     request: Request,
//     response: Response }>;
//
//   ALIAS: postV1AiZWwyutGgvEgWwzSaChatCompletions is equivalent to: import { requestOpenAIGPTVision } from '@/sdk/api-clients/68a5655cdeb2a0b2f64c013d/requestOpenAIGPTVision'
//
// 

export type ClientOptions = {
    baseUrl: 'https://genaiapi.cloudsway.net' | (string & {});
};

export type PostV1AiZWwyutGgvEgWwzSaChatCompletionsData = {
    body: {
        messages: Array<{
            role: 'user';
            content: Array<{
                type: 'text';
                /**
                 * Text content for the message
                 */
                text: string;
            } | {
                type: 'image_url';
                image_url: {
                    /**
                     * The URL of the image to analyze (variable field)
                     */
                    url: string;
                };
            }>;
        }>;
        /**
         * Whether to stream the response
         */
        stream?: boolean;
    };
    path?: never;
    query?: never;
    url: '/v1/ai/zWwyutGgvEGWwzSa/chat/completions';
};

export type PostV1AiZWwyutGgvEgWwzSaChatCompletionsErrors = {
    /**
     * Bad request - invalid input parameters
     */
    400: unknown;
    /**
     * Unauthorized - invalid or missing token
     */
    401: unknown;
};

export type PostV1AiZWwyutGgvEgWwzSaChatCompletionsResponses = {
    /**
     * Successful response with image analysis
     */
    200: {
        /**
         * Unique identifier for the chat completion
         */
        id: string;
        choices: Array<{
            /**
             * The index of the choice in the list of choices
             */
            index: number;
            /**
             * Log probabilities (null if not requested)
             */
            logprobs?: unknown;
            message: {
                /**
                 * The role of the author of this message
                 */
                role: 'assistant';
                /**
                 * The contents of the message
                 */
                content: string;
                /**
                 * Reasoning content (null if not provided)
                 */
                reasoning_content?: unknown;
                /**
                 * Function call information (null if not applicable)
                 */
                function_call?: unknown;
                /**
                 * Tool calls information (null if not applicable)
                 */
                tool_calls?: unknown;
                /**
                 * Reasoning details (null if not provided)
                 */
                reasoning_details?: unknown;
            };
            /**
             * The reason the model stopped generating tokens
             */
            finish_reason: 'stop' | 'length' | 'function_call' | 'tool_calls' | 'content_filter';
            /**
             * Native finish reason (null if not applicable)
             */
            native_finish_reason?: unknown;
        }>;
        /**
         * The Unix timestamp (in seconds) when the chat completion was created
         */
        created: number;
        /**
         * The model used for the completion
         */
        model: string;
        /**
         * The object type, which is always 'chat.completion'
         */
        object: 'chat.completion';
        /**
         * System fingerprint (null if not provided)
         */
        system_fingerprint?: unknown;
        usage: {
            /**
             * Number of tokens in the prompt
             */
            prompt_tokens: number;
            /**
             * Number of tokens in the generated completion
             */
            completion_tokens: number;
            /**
             * Total number of tokens used in the request (prompt + completion)
             */
            total_tokens: number;
            completion_tokens_details?: {
                /**
                 * Number of reasoning tokens used
                 */
                reasoning_tokens?: number;
            };
            /**
             * Detailed breakdown of prompt tokens (null if not provided)
             */
            prompt_tokens_details?: unknown;
        };
    };
};

export type PostV1AiZWwyutGgvEgWwzSaChatCompletionsResponse = PostV1AiZWwyutGgvEgWwzSaChatCompletionsResponses[keyof PostV1AiZWwyutGgvEgWwzSaChatCompletionsResponses];
