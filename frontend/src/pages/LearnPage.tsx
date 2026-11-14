export default function LearnPage() {
  return (
    <div style={{ padding: 'var(--hs-space-6)', overflowY: 'auto', flex: 1 }}>
      <h1 style={{ color: 'var(--hs-color-text-primary)', marginTop: 0 }}>Learn</h1>
      {/* Mount point for Person 4's MissionPanel */}
      <div id="mission-panel-mount">
        <p style={{ color: 'var(--hs-color-text-secondary)' }}>
          Mission panel (Person 4) will mount here.
        </p>
      </div>
    </div>
  )
}
