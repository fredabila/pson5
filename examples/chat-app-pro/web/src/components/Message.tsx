export interface ToolCallState {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
  state: "running" | "done" | "error";
  durationMs?: number;
  resultPreview?: string;
  error?: string;
}

export interface MessageState {
  id: string;
  role: "user" | "assistant";
  kind: "text";
  text: string;
  streaming?: boolean;
  toolCalls?: ToolCallState[];
}

function friendlyToolName(name: string): string {
  switch (name) {
    case "pson_get_agent_context":
      return "reading your profile";
    case "pson_learn":
      return "saving your answer";
    case "pson_observe_fact":
      return "noting what you mentioned";
    case "pson_simulate":
      return "simulating a decision";
    case "pson_get_next_questions":
      return "picking a question";
    case "pson_load_profile_by_user_id":
      return "loading your profile";
    case "pson_create_profile":
      return "creating your profile";
    case "pson_get_provider_policy":
      return "checking privacy policy";
    case "pson_generate_domain_questions":
      return "inventing questions for this topic";
    default:
      return name;
  }
}

export function Message({ message }: { message: MessageState }) {
  const { role, text, streaming, toolCalls } = message;
  return (
    <article className={`msg msg--${role}`} data-streaming={streaming ? "true" : undefined}>
      <div className="msg__bubble">
        <div className="msg__meta">{role === "user" ? "You" : "Assistant"}</div>
        {text ? (
          <div className="msg__text">
            {text}
            {streaming ? <span className="cursor" aria-hidden="true" /> : null}
          </div>
        ) : streaming && (toolCalls?.length ?? 0) === 0 ? (
          <div className="msg__text msg__text--thinking">thinking…</div>
        ) : null}
        {toolCalls && toolCalls.length > 0 ? (
          <ul className="tool-list">
            {toolCalls.map((tc) => (
              <li key={tc.id} className={`tool tool--${tc.state}`}>
                <div className="tool__head">
                  <span className="tool__dot" aria-hidden="true" />
                  <span className="tool__label">
                    {tc.state === "running" ? "running " : tc.state === "error" ? "failed " : ""}
                    {friendlyToolName(tc.name)}
                  </span>
                  <span className="tool__name">{tc.name}</span>
                  {tc.durationMs != null ? <span className="tool__duration">{tc.durationMs}ms</span> : null}
                </div>
                {tc.error ? <pre className="tool__error">{tc.error}</pre> : null}
              </li>
            ))}
          </ul>
        ) : null}
      </div>
    </article>
  );
}
