type ApiResponseOptions = {
  fallbackMessage: string;
  timeoutMessage?: string;
};

export async function readApiJson<T>(response: Response, options: ApiResponseOptions): Promise<T> {
  const body = await response.text();
  if (body.trim()) {
    try {
      return JSON.parse(body) as T;
    } catch {
      if (response.status === 504 || /FUNCTION_INVOCATION_TIMEOUT|An error occurred with your deployment/i.test(body)) {
        throw new Error(options.timeoutMessage ?? "서버 처리 시간이 제한을 초과했습니다. 잠시 후 다시 시도해 주세요.");
      }
    }
  }

  const status = response.status ? ` (HTTP ${response.status})` : "";
  throw new Error(`${options.fallbackMessage}${status}`);
}
