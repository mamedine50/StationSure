import { couleurs } from '@stationsure/ui';

interface Props {
  taille?: number;
  className?: string;
}

/** Icône pompe de la maquette (trait ambre). */
export function LogoPompe({ taille = 22, className }: Props) {
  return (
    <svg
      width={taille}
      height={taille}
      viewBox="0 0 24 24"
      fill="none"
      stroke={couleurs.accent}
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={className}
    >
      <path d="M3 22h12" />
      <path d="M4 9h10" />
      <path d="M14 22V4a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v18" />
      <path d="M14 13h2a2 2 0 0 1 2 2v2a2 2 0 0 0 4 0V9.83a2 2 0 0 0-.59-1.42L18 5" />
    </svg>
  );
}
