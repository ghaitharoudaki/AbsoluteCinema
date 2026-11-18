import { useEffect } from 'react'

/** Sets the browser tab title, e.g. "Discover · AbsoluteCinema". */
export function usePageTitle(title: string | null) {
  useEffect(() => {
    document.title = title ? `${title} · AbsoluteCinema` : 'AbsoluteCinema'
  }, [title])
}
