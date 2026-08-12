'use client'

import { createContext, useContext, useRef, ReactNode } from 'react'
import { useRouter } from 'next/navigation'

type TriggerExit = (dir: 'left' | 'right') => void

const ExitCtx = createContext<TriggerExit>(() => {})

export function useQueueExit(): TriggerExit {
  return useContext(ExitCtx)
}

export function QueueExitProvider({ children }: { children: ReactNode }) {
  const router = useRouter()
  const ref = useRef<HTMLDivElement>(null)

  function triggerExit(dir: 'left' | 'right') {
    const el = ref.current
    if (!el) {
      router.push('/queue')
      router.refresh()
      return
    }
    el.classList.add(dir === 'left' ? 'card-exit-left' : 'card-exit-right')
    setTimeout(() => {
      router.push('/queue')
      router.refresh()
    }, 280)
  }

  return (
    <ExitCtx.Provider value={triggerExit}>
      <div ref={ref}>{children}</div>
    </ExitCtx.Provider>
  )
}
