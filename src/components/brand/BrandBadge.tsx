// GERADO por scripts/app_brand.py a partir do kit da marca. Não editar.
import { brand } from '../../brand'

type Props = { variant?: 'light' | 'dark'; className?: string }

export function BrandBadge({ variant = 'dark', className }: Props) {
  return (
    <a
      data-brand="badge"
      href={brand.badge.href}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={brand.badge.alt}
      className={className}
    >
      <img src={variant === 'light' ? brand.badge.light : brand.badge.dark} alt={brand.name} height={20} />
    </a>
  )
}
