type Props = {
  title: string;
  message: string;
  comingSoon: string;
};

export function StubPage({ title, message, comingSoon }: Props) {
  return (
    <div className="page stub-page">
      <div className="page-header">
        <div>
          <h2>{title}</h2>
          <p className="lede muted">{comingSoon}</p>
        </div>
      </div>
      <section className="panel">
        <p className="muted" style={{ margin: 0 }}>
          {message}
        </p>
      </section>
    </div>
  );
}
