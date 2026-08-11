type StatusItem = {
  mode?: 'auto' | 'manual'
  status?: 'complete' | 'failed' | 'partial' | 'pending' | 'translating'
}

export default function TranslationStatusCell({ cellData }: { cellData?: StatusItem[] | null }) {
  const items = Array.isArray(cellData) ? cellData : []
  const failed = items.filter((item) => item.status === 'failed').length
  const pending = items.filter(
    (item) => item.status === 'pending' || item.status === 'translating',
  ).length
  const manual = items.filter((item) => item.mode === 'manual').length
  const complete = items.filter((item) => item.status === 'complete').length
  const color = failed ? '#b42318' : pending ? '#b54708' : '#067647'
  const label = failed
    ? `${failed} 个失败`
    : pending
      ? `${pending} 个处理中`
      : `${complete} 个完成${manual ? ` · ${manual} 个手工` : ''}`

  return (
    <span
      style={{
        background: `${color}18`,
        border: `1px solid ${color}55`,
        borderRadius: 999,
        color,
        display: 'inline-block',
        fontSize: 12,
        padding: '3px 8px',
      }}
    >
      {label}
    </span>
  )
}
