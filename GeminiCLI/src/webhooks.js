export async function sendWebhook(url, payload) {
  if (!url) return { success: false, error: 'No webhook URL configured' };

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...payload,
        timestamp: new Date().toISOString(),
        source: 'HYDRA-GeminiCLI'
      })
    });

    return {
      success: response.ok,
      status: response.status
    };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

export function notifyTaskComplete(taskId, result, webhookUrl) {
  return sendWebhook(webhookUrl, {
    event: 'task.complete',
    taskId,
    result: typeof result === 'string' ? result : JSON.stringify(result).slice(0, 500)
  });
}