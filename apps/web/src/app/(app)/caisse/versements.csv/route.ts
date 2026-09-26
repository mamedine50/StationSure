import { creerClientServeur } from '@/lib/supabase/server';

/** Export comptable : une ligne par clôture (station, shift, espèces comptées, versé, référence, écart). */
export async function GET() {
  const supabase = await creerClientServeur();
  const [
    { data: closings },
    { data: stations },
    { data: shifts },
    { data: links },
    { data: deposits },
  ] = await Promise.all([
    supabase
      .from('cash_closings')
      .select(
        'id, shift_id, station_id, counted_cash_fcfa, expected_cash_fcfa, variance_fcfa, closed_at, deposit_mode',
      )
      .order('closed_at', { ascending: false }),
    supabase.from('stations').select('id, name'),
    supabase.from('shifts').select('id, label, opened_at'),
    supabase.from('bank_deposit_shifts').select('deposit_id, shift_id'),
    supabase.from('bank_deposits').select('id, amount_fcfa, bank_ref, deposited_at'),
  ]);
  const lignes = [
    [
      'station',
      'shift',
      'ouvert_le',
      'cloture_le',
      'especes_comptees_fcfa',
      'especes_attendues_fcfa',
      'ecart_fcfa',
      'verse_fcfa',
      'bordereau',
      'verse_le',
      'mode',
    ],
  ];
  for (const c of closings ?? []) {
    const s = shifts?.find((x) => x.id === c.shift_id);
    const l = links?.find((x) => x.shift_id === c.shift_id);
    const d = l ? deposits?.find((x) => x.id === l.deposit_id) : undefined;
    lignes.push([
      stations?.find((x) => x.id === c.station_id)?.name ?? '',
      s?.label ?? '',
      s?.opened_at ?? '',
      c.closed_at,
      String(c.counted_cash_fcfa),
      String(c.expected_cash_fcfa),
      String(c.variance_fcfa),
      d ? String(d.amount_fcfa) : '',
      d?.bank_ref ?? '',
      d?.deposited_at ?? '',
      c.deposit_mode,
    ]);
  }
  const csv = lignes
    .map((l) => l.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(';'))
    .join('\n');
  return new Response(`\uFEFF${csv}`, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': 'attachment; filename="versements.csv"',
    },
  });
}
