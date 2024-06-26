import { SwarmsApiGuard } from '@/shared/utils/api/swarms-guard';
import { NextResponse } from 'next/server';
import { OpenAI } from 'openai';
async function POST(req: Request) {
  /* 
      headers:
        Authorization: Bearer <token> : Required
        Organization ID : Optional
    */

  const headers = req.headers;

  const organizationId = headers.get('Swarms-Organization');
  let apiKey = headers.get('Authorization');
  if (apiKey) {
    apiKey = apiKey.replace('Bearer ', '');
  }

  const data =
    (await req.json()) as OpenAI.Chat.Completions.ChatCompletionCreateParams;

  const modelId = data?.model;

  const guard = new SwarmsApiGuard({ apiKey, organizationId, modelId });
  const isAuthenticated = await guard.isAuthenticated();

  if (isAuthenticated.status !== 200) {
    return new Response(isAuthenticated.message, {
      status: isAuthenticated.status
    });
  }
  // SEND REQUEST TO DIFFERENT MODELS ENDPOINTS
  const endpoint = guard.modelRecord?.api_endpoint;
  const url = `${endpoint}/chat/completions`;

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(data)
    });
    const res_json = (await res.json()) as OpenAI.Completion;

    if (res.status != 200) {
      return new Response('Internal Error', {
        status: res.status
      });
    }
    const price_million_input = guard.modelRecord?.price_million_input || 0;
    const price_million_output = guard.modelRecord?.price_million_output || 0;
    const input_price =
      ((res_json.usage?.prompt_tokens ?? 0) / 1000000) * price_million_input;
    const output_price =
      ((res_json.usage?.completion_tokens ?? 0) / 1000000) *
      price_million_output;

    const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
      ...data.messages,
      {
        role: 'assistant',
        content: res_json.choices[0].text
      }
    ];
    // log the result
    const logResult = await guard.logUsage({
      input_cost: input_price,
      output_cost: output_price,
      input_tokens: res_json.usage?.prompt_tokens ?? 0,
      output_tokens: res_json.usage?.completion_tokens ?? 0,
      max_tokens: data.max_tokens ?? 0,
      messages,
      model: modelId,
      temperature: data.temperature ?? 0,
      top_p: data.top_p ?? 0,
      total_cost: input_price + output_price,
      stream: data.stream ?? false
    });
    if (logResult.status !== 200) {
      return new Response(logResult.message, {
        status: logResult.status
      });
    }
    return NextResponse.json(res_json);
  } catch (error) {
    console.log('error', error);
    return new Response('Internal Server Error', {
      status: 500
    });
  }
}

export { POST };
