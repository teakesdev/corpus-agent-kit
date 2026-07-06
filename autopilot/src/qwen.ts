import OpenAI from "openai";
import { lane, type Lane } from "./routing.js";

let client: OpenAI | null = null;

export function getQwen(): OpenAI {
  if (client) return client;
  const apiKey = process.env.QWEN_API_KEY;
  const baseURL = process.env.QWEN_BASE_URL;
  if (!apiKey) throw new Error("QWEN_API_KEY is not configured");
  if (!baseURL) throw new Error("QWEN_BASE_URL is not configured");
  client = new OpenAI({ apiKey, baseURL });
  return client;
}

/** One chat completion on the given lane. Tools optional. */
export async function chat(
  laneName: Lane,
  messages: OpenAI.ChatCompletionMessageParam[],
  tools?: OpenAI.ChatCompletionTool[],
): Promise<OpenAI.ChatCompletion> {
  return getQwen().chat.completions.create({
    model: lane(laneName),
    messages,
    ...(tools && tools.length ? { tools, tool_choice: "auto" as const } : {}),
    temperature: 0.2,
  });
}
