import { useEffect, useState } from 'react'

type AsyncState<T> = { data: T | null; error: string | null; loading: boolean }

// Runs an async loader when `key` changes and ignores results from stale runs.
export function useAsync<T>(load: () => Promise<T>, key: string): AsyncState<T> {
  const [state, setState] = useState<AsyncState<T>>({ data: null, error: null, loading: true })

  useEffect(() => {
    let active = true
    setState({ data: null, error: null, loading: true })
    load()
      .then((data) => active && setState({ data, error: null, loading: false }))
      .catch((err: unknown) =>
        active && setState({ data: null, error: err instanceof Error ? err.message : 'Something went wrong', loading: false }),
      )
    return () => {
      active = false
    }
    // `load` is recreated every render; `key` decides when to reload.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key])

  return state
}
