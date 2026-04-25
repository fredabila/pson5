interface Props {
  profileId: string | null;
  userId: string;
  revision: number | null;
  confidence: number | null;
  sourceCount: number | null;
  sidePanel: "profile" | "graph";
  onSidePanelChange: (mode: "profile" | "graph") => void;
  onReset: () => void;
}

export function TopBar({
  profileId,
  userId,
  revision,
  confidence,
  sourceCount,
  sidePanel,
  onSidePanelChange,
  onReset
}: Props) {
  return (
    <header className="topbar">
      <div className="topbar__left">
        <div className="wordmark">
          <span className="wordmark__dot" aria-hidden="true" />
          <span className="wordmark__name">
            PSON<em>5</em>
          </span>
          <span className="wordmark__tag">pro</span>
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
            <dt>rev</dt>
            <dd>{revision ?? "—"}</dd>
          </div>
          <div className="pill">
            <dt>sources</dt>
            <dd>{sourceCount ?? "—"}</dd>
          </div>
          <div className="pill">
            <dt>confidence</dt>
            <dd>{confidence == null ? "—" : confidence.toFixed(2)}</dd>
          </div>
        </dl>
      </div>

      <div className="topbar__right">
        <div className="segmented" role="tablist" aria-label="Side panel mode">
          <button
            type="button"
            role="tab"
            aria-selected={sidePanel === "profile"}
            className={`segmented__option${sidePanel === "profile" ? " is-active" : ""}`}
            onClick={() => onSidePanelChange("profile")}
          >
            Profile
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={sidePanel === "graph"}
            className={`segmented__option${sidePanel === "graph" ? " is-active" : ""}`}
            onClick={() => onSidePanelChange("graph")}
          >
            Graph
          </button>
        </div>
        <button className="btn btn--ghost" type="button" onClick={onReset}>
          Reset
        </button>
      </div>
    </header>
  );
}
