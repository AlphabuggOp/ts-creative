import type { ReactNode, CSSProperties } from 'react'

/**
 * ShinyText — animated sheen sweep across text (ReactBits-style, tuned to SANCTUM).
 * For gradient-clip shine over any children (incl. Scramble output).
 */
export function ShinyText({
  children,
  className = '',
  speed = 4.5,
  base = 'rgba(103,232,249,.55)',
  sheen = '#e8fbff',
  style,
}: {
  children: ReactNode
  className?: string
  speed?: number
  base?: string
  sheen?: string
  style?: CSSProperties
}) {
  return (
    <>
      <style>{`
        .shiny-text{
          background: linear-gradient(110deg, var(--sx-base) 42%, var(--sx-sheen) 50%, var(--sx-base) 58%);
          background-size: 220% 100%;
          -webkit-background-clip: text; background-clip: text;
          color: transparent; -webkit-text-fill-color: transparent;
          animation: sx-sheen var(--sx-speed) linear infinite;
        }
        @keyframes sx-sheen{ 0%{background-position: 210% 0} 100%{background-position: -110% 0} }
      `}</style>
      <span
        className={`shiny-text ${className}`}
        style={
          {
            '--sx-speed': `${speed}s`,
            '--sx-base': base,
            '--sx-sheen': sheen,
            ...style,
          } as CSSProperties
        }
      >
        {children}
      </span>
    </>
  )
}
