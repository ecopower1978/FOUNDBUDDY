import { permanentRedirect } from 'next/navigation'

export default async function LegacyPost({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  permanentRedirect(`/en/posts/${encodeURIComponent((await params).slug)}`)
}

