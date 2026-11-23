// GERADO por scripts/app_brand.py a partir do kit da marca. Não editar.
import { brand } from '../../brand'

type Props = { variant?: 'light' | 'dark'; className?: string }

export function BrandHeader({ variant = 'dark', className }: Props) {
  return (
    <a data-brand="header" href={brand.header.href} aria-label={`${brand.name} — início`} className={className}>
      <img src={variant === 'light' ? brand.header.light : brand.header.dark} alt={brand.name} height={28} />
    </a>
  )
}
