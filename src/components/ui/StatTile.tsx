import Link from 'next/link'
import styles from './StatTile.module.css'

interface StatTileProps {
  label: string
  count: number
  sub?: string
  href: string
  pending?: boolean
  wide?: boolean
}

export function StatTile({ label, count, sub, href, pending = false, wide = false }: StatTileProps) {
  return (
    <Link
      href={href}
      className={[styles.link, wide ? styles.wideLink : ''].filter(Boolean).join(' ')}
    >
      {wide ? (
        <div className={styles.wideTile}>
          <p className={styles.wideCount}>{count}</p>
          <p className={styles.wideLabel}>{label}</p>
        </div>
      ) : (
        <div className={[styles.tile, pending ? styles.tilePending : ''].filter(Boolean).join(' ')}>
          <p className={[styles.label, pending ? styles.labelPending : ''].filter(Boolean).join(' ')}>
            {label}{pending ? ' ●' : ''}
          </p>
          <p className={styles.count}>{count}</p>
          {sub && (
            <p className={[styles.sub, pending ? styles.subPending : ''].filter(Boolean).join(' ')}>
              {sub}
            </p>
          )}
        </div>
      )}
    </Link>
  )
}
