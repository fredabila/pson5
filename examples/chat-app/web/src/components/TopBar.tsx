interface Props {
  profileId: string | null;
  userId: string;
  revision: number | null;
  confidence: number | null;
  onReset: () => void;
}

export function TopBar({ profileId, userId, revision, confidence, onReset }: Props) {
  return (
    <header className="topbar">
      <div className="topbar__left">
        <div className="wordmark" aria-label="PSON5">
          <span className="wordmark__dot" aria-hidden="true" />
          <span className="wordmark__name">
            PSON<em>5</em>
          </span>
          <span className="wordmark__tag">chat</span>
        </div>
      </div>

      <div className="topbar__center">
        <dl className="pill-group">
          <div className="pill">
            <dt>user</dt>
            <dd>{userId}</dd>
          </div>
          <div className="pill">
            <dt>profile</dt>
            <dd>{profileId ?? "—"}</dd>
          </div>
          <div className="pill">
            <dt>revision</dt>
            <dd>{revision ?? "—"}</dd>
          </div>
          <div className="pill">
            <dt>confidence</dt>
            <dd>{confidence == null ? "—" : confidence.toFixed(2)}</dd>
          </div>
        </dl>
      </div>

      <div className="topbar__right">
        <button className="btn btn--ghost" type="button" onClick={onReset} aria-label="Reset session">
          Reset session
        </button>
      </div>
    </header>
  );
}
