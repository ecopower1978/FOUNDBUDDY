import { permanentRedirect } from 'next/navigation'

export default function LegacyPosts() {
  permanentRedirect('/en/posts')
}

